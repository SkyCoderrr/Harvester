import type { FastifyInstance } from 'fastify';
import type { HttpDeps } from '../server.js';
import { HarvesterError } from '../../errors/index.js';
import { FACTORY_DEFAULT_RULE_SET } from '../../rules/defaults.js';
import { insertRuleSetRow, listRuleSetRows } from '../../db/queries.js';
import { firstRunSaveBody } from '../schemas/firstRun.js';

export function registerFirstRunRoutes(app: FastifyInstance, deps: HttpDeps): void {
  app.post('/first-run/status', async () => {
    const cfg = deps.config.get();
    return {
      ok: true,
      data: {
        first_run_completed: cfg.first_run_completed,
        mteam_set: !cfg.mteam.api_key.startsWith('__FIRST_RUN'),
        qbt_set: !cfg.qbt.user.startsWith('__FIRST_RUN'),
      },
    };
  });

  app.post('/first-run/save', async (req) => {
    const body = firstRunSaveBody.parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.mteam?.api_key) patch['mteam'] = { api_key: body.mteam.api_key };
    if (body.qbt) patch['qbt'] = body.qbt;
    if (body.downloads?.default_save_path) patch['downloads'] = body.downloads;
    deps.config.update(patch as never);
    return { ok: true, data: { ok: true } };
  });

  app.post('/first-run/complete', async () => {
    const cfg = deps.config.get();
    if (cfg.mteam.api_key.startsWith('__FIRST_RUN')) {
      throw new HarvesterError({
        code: 'FIRST_RUN_INCOMPLETE',
        user_message: 'M-Team API key must be set.',
      });
    }
    if (cfg.qbt.user.startsWith('__FIRST_RUN') || cfg.qbt.password.startsWith('__FIRST_RUN')) {
      throw new HarvesterError({
        code: 'FIRST_RUN_INCOMPLETE',
        user_message: 'qBittorrent credentials must be set.',
      });
    }
    // Seed factory default if none exist
    const existing = listRuleSetRows(deps.db);
    if (existing.length === 0) {
      insertRuleSetRow(
        deps.db,
        FACTORY_DEFAULT_RULE_SET.name,
        FACTORY_DEFAULT_RULE_SET.enabled,
        1,
        JSON.stringify(FACTORY_DEFAULT_RULE_SET.rules),
      );
    }
    deps.config.update({ first_run_completed: true } as never);
    deps.serviceState.dispatch({ type: 'START' });
    if (deps.onFirstRunComplete) {
      try {
        await deps.onFirstRunComplete();
      } catch (err) {
        deps.logger.warn({ component: 'first-run', err }, 'onFirstRunComplete failed');
      }
    }
    return { ok: true, data: { ok: true } };
  });
}
