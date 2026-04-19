import type { FastifyInstance } from 'fastify';
import type { HttpDeps } from '../server.js';
import {
  listRuleSetRows,
  getRuleSetRow,
  insertRuleSetRow,
  updateRuleSetRow,
  deleteRuleSetRow,
  archiveRuleSetRow,
  listRecentTorrentEvents,
} from '../../db/queries.js';
import { rowToRuleSet } from '../../rules/migrate.js';
import { validateRuleSetInput } from '../../rules/validate.js';
import { evaluateOne } from '../../rules/evaluator.js';
import { normalizeMTeamTorrent } from '../../util/normalize.js';
import { freeGib } from '../../util/disk.js';
import { HarvesterError } from '../../errors/index.js';
import type { MTeamTorrent } from '@shared/types.js';

export function registerRulesRoutes(app: FastifyInstance, deps: HttpDeps): void {
  app.get('/rules', async () => {
    const items = listRuleSetRows(deps.db).map(rowToRuleSet);
    return { ok: true, data: { items } };
  });

  app.get('/rules/:id', async (req) => {
    const { id } = req.params as { id: string };
    const row = getRuleSetRow(deps.db, Number(id));
    if (!row) throw new HarvesterError({ code: 'NOT_FOUND', user_message: 'Rule-set not found' });
    return { ok: true, data: rowToRuleSet(row) };
  });

  app.post('/rules', async (req) => {
    const input = req.body as unknown;
    const v = validateRuleSetInput(input);
    if (!v.ok || !v.value) {
      throw new HarvesterError({
        code: 'RULE_VALIDATION',
        user_message: 'Rule-set is invalid.',
        context: { errors: v.errors },
      });
    }
    try {
      const id = insertRuleSetRow(
        deps.db,
        v.value.name,
        v.value.enabled,
        1,
        JSON.stringify(v.value.rules),
      );
      return { ok: true, data: { id } };
    } catch (err) {
      if ((err as Error).message.includes('UNIQUE')) {
        throw new HarvesterError({
          code: 'RULE_NAME_CONFLICT',
          user_message: 'A rule-set with that name already exists.',
        });
      }
      throw err;
    }
  });

  app.put('/rules/:id', async (req) => {
    const { id } = req.params as { id: string };
    const row = getRuleSetRow(deps.db, Number(id));
    if (!row) throw new HarvesterError({ code: 'NOT_FOUND', user_message: 'Rule-set not found' });
    const v = validateRuleSetInput(req.body);
    if (!v.ok || !v.value) {
      throw new HarvesterError({
        code: 'RULE_VALIDATION',
        user_message: 'Rule-set is invalid.',
        context: { errors: v.errors },
      });
    }
    archiveRuleSetRow(deps.db, row.id, row.schema_version, row.rules_json);
    updateRuleSetRow(
      deps.db,
      row.id,
      v.value.name,
      v.value.enabled,
      1,
      JSON.stringify(v.value.rules),
    );
    const updated = getRuleSetRow(deps.db, row.id)!;
    return { ok: true, data: rowToRuleSet(updated) };
  });

  app.delete('/rules/:id', async (req) => {
    const { id } = req.params as { id: string };
    const row = getRuleSetRow(deps.db, Number(id));
    if (!row) throw new HarvesterError({ code: 'NOT_FOUND', user_message: 'Rule-set not found' });
    archiveRuleSetRow(deps.db, row.id, row.schema_version, row.rules_json);
    deleteRuleSetRow(deps.db, row.id);
    return { ok: true, data: { ok: true } };
  });

  app.post('/rules/validate', async (req) => {
    const v = validateRuleSetInput(req.body);
    return { ok: true, data: { ok: v.ok, errors: v.errors ?? [] } };
  });

  app.post('/rules/:id/dry-run', async (req) => {
    const { id } = req.params as { id: string };
    const row = getRuleSetRow(deps.db, Number(id));
    if (!row) throw new HarvesterError({ code: 'NOT_FOUND', user_message: 'Rule-set not found' });
    const rs = rowToRuleSet(row);
    const body = (req.body ?? {}) as { simulate_at?: number; sample_size?: number };
    const sample = Math.min(500, Math.max(1, body.sample_size ?? 200));
    const events = listRecentTorrentEvents(deps.db, sample);
    const cfg = deps.config.get();
    const now_ms = body.simulate_at ?? Date.now();

    const items = events.map((e) => {
      let raw: MTeamTorrent;
      try {
        raw = JSON.parse(e.raw_payload) as MTeamTorrent;
      } catch {
        return {
          mteam_id: e.mteam_id,
          name: e.name,
          would_grab: false,
          failing_condition: 'malformed_raw_payload',
        };
      }
      const normalized = normalizeMTeamTorrent(raw);
      const ctx = {
        now_ms: Date.now(),
        simulate_at_ms: now_ms,
        free_disk_gib: (p: string | null) => freeGib(p ?? cfg.downloads.default_save_path),
      };
      const result = evaluateOne(normalized, rs, ctx);
      return {
        mteam_id: normalized.mteam_id,
        name: normalized.name,
        discount: normalized.discount,
        size_gib: Number((normalized.size_bytes / 2 ** 30).toFixed(2)),
        seeders: normalized.seeders,
        leechers: normalized.leechers,
        would_grab: result.pass,
        failing_condition: result.pass ? null : result.rejection_reason,
      };
    });

    const grab_count = items.filter((i) => i.would_grab).length;
    return { ok: true, data: { items, total: items.length, grab_count } };
  });
}
