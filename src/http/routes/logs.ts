import type { FastifyInstance } from 'fastify';
import type { HttpDeps } from '../server.js';
import { listLogs } from '../../db/queries.js';
import type { LogRow } from '@shared/types.js';

export function registerLogsRoutes(app: FastifyInstance, deps: HttpDeps): void {
  app.get('/logs', async (req) => {
    const q = req.query as {
      level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
      component?: string;
      from?: string;
      to?: string;
      q?: string;
      limit?: string;
      cursor?: string;
    };
    const filter: Parameters<typeof listLogs>[1] = {
      limit: q.limit ? Math.min(500, Number(q.limit)) : 200,
    };
    if (q.level) filter.level = q.level;
    if (q.component) filter.component = q.component;
    if (q.from) filter.from = Number(q.from);
    if (q.to) filter.to = Number(q.to);
    if (q.q) filter.q = q.q;
    if (q.cursor) filter.cursor = Number(q.cursor);
    const rows = listLogs(deps.db, filter);
    const items: LogRow[] = rows.map((r) => ({
      id: r.id,
      ts: r.ts,
      level: r.level,
      component: r.component,
      message: r.message,
      meta: r.meta_json ? (JSON.parse(r.meta_json) as Record<string, unknown>) : {},
    }));
    const next_cursor = items.length > 0 ? items[items.length - 1]!.id : null;
    return { ok: true, data: { items, next_cursor } };
  });
}
