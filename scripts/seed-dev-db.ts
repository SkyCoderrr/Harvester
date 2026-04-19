// Dev helper: seeds a fresh DB with the factory default rule-set.
import { resolveAppPaths } from '../src/appPaths.js';
import { openDatabase } from '../src/db/index.js';
import { createLogger } from '../src/logger/index.js';
import { loadConfig } from '../src/config/load.js';
import { insertRuleSetRow, listRuleSetRows } from '../src/db/queries.js';
import { FACTORY_DEFAULT_RULE_SET } from '../src/rules/defaults.js';

async function main(): Promise<void> {
  const paths = resolveAppPaths();
  const cfg = loadConfig(paths);
  const logger = await createLogger(cfg, paths);
  const db = openDatabase(paths, logger);
  const existing = listRuleSetRows(db);
  if (existing.length > 0) {
    console.log('rule-sets already present:', existing.length);
    return;
  }
  insertRuleSetRow(
    db,
    FACTORY_DEFAULT_RULE_SET.name,
    FACTORY_DEFAULT_RULE_SET.enabled,
    1,
    JSON.stringify(FACTORY_DEFAULT_RULE_SET.rules),
  );
  console.log('seeded factory default rule-set');
  db.close();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
