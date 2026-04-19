import { Writable } from 'node:stream';
import type { Db } from '../db/index.js';
import { insertLog, pruneLogsBefore } from '../db/queries.js';
import type { EventBus } from '../events/bus.js';
import type { LogRow } from '@shared/types.js';

const LEVELS: Record<number, 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'> = {
  10: 'DEBUG', // trace
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'ERROR',
};

/**
 * pino writable sink that persists log entries to the SQLite `logs` table and emits a
 * domain `log.entry` event for SSE consumers.
 *
 * Prunes aggressively: every 100 writes, deletes rows older than 7 days to keep the table
 * bounded.
 */
export function createSqliteSink(db: Db, bus: EventBus | null): Writable {
  let writeCount = 0;
  return new Writable({
    write(chunk, _enc, cb) {
      try {
        const line = Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
        for (const part of line.split('\n')) {
          if (!part.trim()) continue;
          let obj: Record<string, unknown>;
          try {
            obj = JSON.parse(part) as Record<string, unknown>;
          } catch {
            continue;
          }
          const level = typeof obj['level'] === 'number' ? LEVELS[obj['level'] as number] : undefined;
          if (!level) continue;
          const msg = typeof obj['msg'] === 'string' ? (obj['msg'] as string) : '';
          const component = typeof obj['component'] === 'string' ? (obj['component'] as string) : 'app';
          const ts = typeof obj['ts'] === 'number' ? (obj['ts'] as number) : Math.floor(Date.now() / 1000);
          const { msg: _m, level: _l, component: _c, ts: _t, time: _tt, pid: _p, hostname: _h, service: _s, ...rest } = obj;
          void _m;
          void _l;
          void _c;
          void _t;
          void _tt;
          void _p;
          void _h;
          void _s;
          const metaJson = Object.keys(rest).length ? JSON.stringify(rest) : null;
          const id = insertLog(db, {
            ts,
            level,
            component,
            message: msg,
            meta_json: metaJson,
          });
          const row: LogRow = {
            id,
            ts,
            level,
            component,
            message: msg,
            meta: rest,
          };
          bus?.emit('log.entry', { type: 'log.entry', row });
        }
        writeCount++;
        if (writeCount % 100 === 0) {
          const cutoff = Math.floor(Date.now() / 1000) - 7 * 86400;
          pruneLogsBefore(db, cutoff);
        }
        cb();
      } catch (err) {
        cb(err as Error);
      }
    },
  });
}
