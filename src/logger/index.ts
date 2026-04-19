import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import { pino, type Logger as PinoLogger, type LoggerOptions, multistream } from 'pino';
import pinoRoll from 'pino-roll';
import type { AppPaths } from '../appPaths.js';
import type { AppConfig } from '../config/schema.js';
import { createSqliteSink } from './sqliteSink.js';
import type { Db } from '../db/index.js';
import type { EventBus } from '../events/bus.js';

export interface Logger {
  trace: PinoLogger['trace'];
  debug: PinoLogger['debug'];
  info: PinoLogger['info'];
  warn: PinoLogger['warn'];
  error: PinoLogger['error'];
  fatal: PinoLogger['fatal'];
  child(bindings: Record<string, unknown>): Logger;
  /** Hot-update the secret redactor. Calls replace the entire set. */
  setSecrets(secrets: string[]): void;
  /** Attach a DB sink + bus. Safe to call exactly once, after the DB is open. */
  attachDbSink(db: Db, bus: EventBus | null): void;
}

/**
 * Structured logger with three destinations:
 *   1. Daily-rotated JSONL file on disk (`pino-roll`)
 *   2. stdout (JSON)
 *   3. SQLite sink (attached after DB is open; until then, writes are discarded).
 *
 * Secondary secret redactor: any exact substring of a loaded secret is replaced with
 * `***REDACTED***` before the line hits any destination, so secrets can't leak via
 * nested structured fields pino.redact doesn't know about.
 */
export async function createLogger(config: AppConfig, paths: AppPaths): Promise<Logger> {
  fs.mkdirSync(paths.logsDir, { recursive: true });

  const secrets = new Set<string>();
  if (config.mteam.api_key && !config.mteam.api_key.startsWith('__FIRST_RUN')) {
    secrets.add(config.mteam.api_key);
  }
  if (config.qbt.password && !config.qbt.password.startsWith('__FIRST_RUN')) {
    secrets.add(config.qbt.password);
  }

  // A mutable box the redactor reads from; hot-updates work without re-wrapping.
  const redact = (s: string): string => {
    if (secrets.size === 0) return s;
    let out = s;
    for (const secret of secrets) {
      if (secret.length < 4) continue;
      out = out.split(secret).join('***REDACTED***');
    }
    return out;
  };

  const rollStream = await pinoRoll({
    file: path.join(paths.logsDir, 'harvester.jsonl'),
    frequency: 'daily',
    size: '50m',
    limit: { count: config.logging.retain_days },
    mkdir: true,
  });

  // Deferred DB sink — swapped in at attachDbSink time. Prior writes are discarded.
  const dbSinkProxy = new ProxyWritable();

  // Wrap each destination with the redactor, so secrets never hit disk/stdout/db.
  const fileRedacted = makeRedactedPassthrough(rollStream, redact);
  const stdoutRedacted = makeRedactedPassthrough(process.stdout, redact);
  const dbRedacted = makeRedactedPassthrough(dbSinkProxy, redact);

  const pinoOpts: LoggerOptions = {
    level: config.logging.level,
    base: { service: 'harvester', pid: process.pid },
    redact: {
      paths: [
        'req.headers["x-api-key"]',
        'req.headers.authorization',
        'req.headers.cookie',
        '*.api_key',
        '*.password',
        '*.password_hash',
        '*.mteam.api_key',
        '*.qbt.password',
      ],
      censor: '***REDACTED***',
    },
    timestamp: () => `,"ts":${Math.floor(Date.now() / 1000)}`,
  };

  const root = pino(
    pinoOpts,
    multistream([{ stream: fileRedacted }, { stream: stdoutRedacted }, { stream: dbRedacted }]),
  );

  const api: Logger = wrap(root, {
    setSecrets(next) {
      secrets.clear();
      for (const s of next) if (s) secrets.add(s);
    },
    attachDbSink(db, bus) {
      const sink = createSqliteSink(db, bus);
      dbSinkProxy.attach(sink);
      root.info({ component: 'logger' }, 'db sink attached');
    },
  });
  return api;
}

function wrap(
  root: PinoLogger,
  ext: { setSecrets(v: string[]): void; attachDbSink(db: Db, bus: EventBus | null): void },
): Logger {
  return {
    trace: root.trace.bind(root),
    debug: root.debug.bind(root),
    info: root.info.bind(root),
    warn: root.warn.bind(root),
    error: root.error.bind(root),
    fatal: root.fatal.bind(root),
    child(bindings) {
      return wrap(root.child(bindings), ext);
    },
    setSecrets: ext.setSecrets,
    attachDbSink: ext.attachDbSink,
  };
}

/**
 * Redacting passthrough: buffers the chunk as a string, substitutes secrets, then
 * forwards to the target. Pino writes newline-delimited JSON, so we can redact
 * whole-string per chunk safely.
 */
function makeRedactedPassthrough(target: NodeJS.WritableStream, redact: (s: string) => string): Writable {
  return new Writable({
    write(chunk, _enc, cb) {
      try {
        const s = typeof chunk === 'string' ? chunk : Buffer.from(chunk as Buffer).toString('utf-8');
        target.write(redact(s));
        cb();
      } catch (err) {
        cb(err as Error);
      }
    },
  });
}

/**
 * Pass-through Writable that can be "armed" with a real destination after the stream
 * has already been registered with pino's multistream. Before arming, writes are no-ops.
 */
class ProxyWritable extends Writable {
  private inner: NodeJS.WritableStream | null = null;
  attach(inner: NodeJS.WritableStream): void {
    this.inner = inner;
  }
  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    cb: (err?: Error | null) => void,
  ): void {
    if (!this.inner) {
      cb();
      return;
    }
    // Node's Writable<->Writable bridge. Let the downstream sink back-pressure us.
    const ok =
      typeof chunk === 'string'
        ? this.inner.write(chunk, encoding)
        : this.inner.write(chunk);
    if (ok) cb();
    else this.inner.once('drain', () => cb());
  }
}
