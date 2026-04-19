import { EventEmitter } from 'node:events';
import type { AppConfig } from './schema.js';
import { configSchemaZ } from './schema.js';
import type { AppPaths } from '../appPaths.js';
import { writeConfig } from './write.js';
import { HarvesterError } from '../errors/index.js';

/**
 * In-process reactive config store. Workers subscribe to `change` events to re-read
 * hot-swappable values (e.g. poller.interval_sec). Writes are atomic and validated.
 */
export interface ConfigStore {
  get(): AppConfig;
  update(patch: PartialDeep<AppConfig>): AppConfig;
  on(event: 'change', fn: (cfg: AppConfig, prev: AppConfig) => void): () => void;
  /** Replace wholesale (used by first-run completion). */
  replace(next: AppConfig): AppConfig;
}

export function createConfigStore(paths: AppPaths, initial: AppConfig): ConfigStore {
  let current: AppConfig = initial;
  const emitter = new EventEmitter();

  function get(): AppConfig {
    return current;
  }

  function update(patch: PartialDeep<AppConfig>): AppConfig {
    const candidate = deepMerge(current, patch);
    const parsed = configSchemaZ.safeParse(candidate);
    if (!parsed.success) {
      throw new HarvesterError({
        code: 'CONFIG_INVALID',
        user_message: 'Invalid config update',
        context: { issues: parsed.error.issues },
      });
    }
    const prev = current;
    current = parsed.data;
    writeConfig(paths, current);
    emitter.emit('change', current, prev);
    return current;
  }

  function replace(next: AppConfig): AppConfig {
    const parsed = configSchemaZ.safeParse(next);
    if (!parsed.success) {
      throw new HarvesterError({
        code: 'CONFIG_INVALID',
        user_message: 'Invalid config replace',
        context: { issues: parsed.error.issues },
      });
    }
    const prev = current;
    current = parsed.data;
    writeConfig(paths, current);
    emitter.emit('change', current, prev);
    return current;
  }

  function on(event: 'change', fn: (cfg: AppConfig, prev: AppConfig) => void): () => void {
    emitter.on(event, fn);
    return () => emitter.off(event, fn);
  }

  return { get, update, replace, on };
}

// -- Deep merge + PartialDeep -------------------------------------------------

export type PartialDeep<T> = T extends (infer U)[]
  ? U[]
  : T extends object
    ? { [K in keyof T]?: PartialDeep<T[K]> }
    : T;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge<T>(base: T, patch: PartialDeep<T>): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch as T) ?? base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const b = (base as Record<string, unknown>)[k];
    if (isPlainObject(b) && isPlainObject(v)) {
      out[k] = deepMerge(b, v as never);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}
