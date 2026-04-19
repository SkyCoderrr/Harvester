import { Writable } from 'node:stream';
import type Database from 'better-sqlite3';
import type { Db } from '../db/index.js';
import { pruneLogsBefore } from '../db/queries.js';
import type { EventBus } from '../events/bus.js';
import type { LogRow } from '@shared/types.js';

// FR-V2-62 / TECH_DEBT M13: the SQLite sink batches writes (up to 100 lines or
// 250 ms, whichever comes first) inside a single BEGIN/COMMIT. That amortizes
// the per-insert transaction cost; on a busy probe cycle the old per-line
// commit could take 10+ ms per entry.
//
// Buffer overflow (which shouldn't happen in practice) emits the `log.dropped`
// metric — see below.

const LEVELS: Record<number, 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'> = {
  10: 'DEBUG', // trace
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'ERROR',
};

const BATCH_MAX = 100;
const FLUSH_MS = 250;
// Hard cap on the pending queue. Anything beyond is dropped with a warning.
const BUFFER_MAX = 10_000;

interface PendingRow {
  ts: number;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  component: string;
  message: string;
  meta_json: string | null;
  meta: Record<string, unknown>;
}

export interface SqliteSinkHandle extends Writable {
  flushNow(): void;
}

export function createSqliteSink(db: Db, bus: EventBus | null): SqliteSinkHandle {
  const insertStmt = db.prepare(
    `INSERT INTO logs (ts, level, component, message, meta_json) VALUES (?,?,?,?,?)`,
  );
  const buffer: PendingRow[] = [];
  let flushTimer: NodeJS.Timeout | null = null;
  let droppedSinceLastFlush = 0;
  let writesSinceLastPrune = 0;

  function scheduleFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, FLUSH_MS);
    flushTimer.unref?.();
  }

  function flush(): void {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (buffer.length === 0 && droppedSinceLastFlush === 0) return;
    const rows = buffer.splice(0, buffer.length);

    // One transaction for the whole batch.
    const tx = db.transaction((items: PendingRow[]): number[] => {
      const ids: number[] = [];
      for (const r of items) {
        const info = insertStmt.run(r.ts, r.level, r.component, r.message, r.meta_json);
        ids.push(Number(info.lastInsertRowid));
      }
      return ids;
    });
    let ids: number[];
    try {
      ids = tx(rows);
    } catch {
      // If the batch fails, replay as a no-op for bus emission purposes but
      // don't crash the sink.
      ids = rows.map(() => -1);
    }

    if (bus) {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]!;
        const row: LogRow = {
          id: ids[i] ?? -1,
          ts: r.ts,
          level: r.level,
          component: r.component,
          message: r.message,
          meta: r.meta,
        };
        bus.emit('log.entry', { type: 'log.entry', row });
      }
    }

    writesSinceLastPrune += rows.length;
    if (writesSinceLastPrune >= 500) {
      writesSinceLastPrune = 0;
      const cutoff = Math.floor(Date.now() / 1000) - 7 * 86400;
      try {
        pruneLogsBefore(db, cutoff);
      } catch {
        /* non-fatal */
      }
    }

    if (droppedSinceLastFlush > 0) {
      // Record a synthetic row so the user sees they lost entries. This
      // replaces the `log.dropped` metric the V2 plan calls for (we don't
      // have a dedicated metric registry for this yet).
      try {
        insertStmt.run(
          Math.floor(Date.now() / 1000),
          'WARN',
          'logger',
          `log-sink dropped ${droppedSinceLastFlush} lines (buffer overflow)`,
          null,
        );
      } catch {
        /* ignore */
      }
      droppedSinceLastFlush = 0;
    }
  }

  const writable = new Writable({
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
          const level =
            typeof obj['level'] === 'number' ? LEVELS[obj['level'] as number] : undefined;
          if (!level) continue;
          const msg = typeof obj['msg'] === 'string' ? (obj['msg'] as string) : '';
          const component =
            typeof obj['component'] === 'string' ? (obj['component'] as string) : 'app';
          const ts =
            typeof obj['ts'] === 'number'
              ? (obj['ts'] as number)
              : Math.floor(Date.now() / 1000);
          const {
            msg: _m,
            level: _l,
            component: _c,
            ts: _t,
            time: _tt,
            pid: _p,
            hostname: _h,
            service: _s,
            ...rest
          } = obj;
          void _m;
          void _l;
          void _c;
          void _t;
          void _tt;
          void _p;
          void _h;
          void _s;
          const metaJson = Object.keys(rest).length ? JSON.stringify(rest) : null;

          if (buffer.length >= BUFFER_MAX) {
            droppedSinceLastFlush++;
            continue;
          }
          buffer.push({ ts, level, component, message: msg, meta_json: metaJson, meta: rest });
          if (buffer.length >= BATCH_MAX) {
            flush();
          } else {
            scheduleFlush();
          }
        }
        cb();
      } catch (err) {
        cb(err as Error);
      }
    },
    final(cb) {
      flush();
      cb();
    },
  }) as SqliteSinkHandle;
  writable.flushNow = flush;
  return writable;
}

// Exporting Database unused-warning suppression so the import stays live for
// editors even if its only use is the `db.transaction` call above.
export type _DatabaseAlias = Database.Database;
