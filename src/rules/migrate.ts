import type { Db } from '../db/index.js';
import type { Logger } from '../logger/index.js';
import type { RuleSet, RuleSetV1 } from '@shared/types.js';
import {
  archiveRuleSetRow,
  listRuleSetRows,
  updateRuleSetRow,
  type RuleSetRowDb,
} from '../db/queries.js';
import { ruleSetV1Z } from './schema.js';

const CURRENT_SCHEMA = 1;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type MigrationFn = (json: unknown) => unknown;

/** Future: map from version to migration function that returns next-version JSON. */
const MIGRATIONS: Record<number, MigrationFn> = {
  // 1 → 2 will go here later. v1 is terminal today.
};

// FR-V2-64 / STATUS K1: one-shot rename of the historical "default" rule set
// to "FREE and 2X_FREE". Idempotent via a sentinel row in schema_migrations
// using version=999 (does NOT participate in the sequential file-based
// migration numbering — see db/migrate.ts gap check, which only validates
// the on-disk *.sql sequence, not applied rows).
const RULE_RENAME_SENTINEL_VERSION = 999;

function renameDefaultRuleset(db: Db, logger: Logger): void {
  const already = db
    .prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
    .get(RULE_RENAME_SENTINEL_VERSION);
  if (already) return;
  const r = db
    .prepare(`UPDATE rule_sets SET name = 'FREE and 2X_FREE' WHERE name = 'default'`)
    .run();
  db.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(
    RULE_RENAME_SENTINEL_VERSION,
    Math.floor(Date.now() / 1000),
  );
  if (r.changes > 0) {
    logger.info(
      { component: 'rules', renamed: r.changes },
      'renamed default rule-set → FREE and 2X_FREE',
    );
  }
}

/**
 * Migrate any rule_sets rows with schema_version < CURRENT_SCHEMA. Archives the old
 * version before overwriting. v1 is terminal today, so this is a validate-only pass.
 */
export function migrateRuleSets(db: Db, logger: Logger): void {
  renameDefaultRuleset(db, logger);
  const rows = listRuleSetRows(db);
  for (const row of rows) {
    if (row.schema_version === CURRENT_SCHEMA) continue;
    let json: unknown = JSON.parse(row.rules_json);
    let v = row.schema_version;
    while (v < CURRENT_SCHEMA) {
      const fn = MIGRATIONS[v];
      if (!fn) {
        logger.error({ from: v, id: row.id }, 'no migration function for rule-set schema');
        break;
      }
      json = fn(json);
      v++;
    }
    if (v !== CURRENT_SCHEMA) continue;
    const parsed = ruleSetV1Z.safeParse(json);
    if (!parsed.success) {
      logger.warn(
        { id: row.id, issues: parsed.error.issues },
        'migrated rule-set failed validation — left untouched',
      );
      continue;
    }
    archiveRuleSetRow(db, row.id, row.schema_version, row.rules_json);
    updateRuleSetRow(
      db,
      row.id,
      row.name,
      row.enabled === 1,
      CURRENT_SCHEMA,
      JSON.stringify(parsed.data),
    );
  }
}

/** Parse a DB row into a domain RuleSet. Throws if rules_json is malformed. */
export function rowToRuleSet(row: RuleSetRowDb): RuleSet {
  const raw = JSON.parse(row.rules_json);
  const rules = ruleSetV1Z.parse(raw) as RuleSetV1;
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    schema_version: row.schema_version,
    rules,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
