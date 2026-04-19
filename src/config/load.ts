import fs from 'node:fs';
import { configSchemaZ, type AppConfig } from './schema.js';
import { HarvesterError } from '../errors/index.js';
import type { AppPaths } from '../appPaths.js';

/**
 * Loads config.json from disk.
 *
 * - Returns a validated AppConfig or throws CONFIG_INVALID.
 * - If the file is missing, returns a "bootstrap" config with first_run_completed=false
 *   and a placeholder api_key. The caller routes first-run wizard responsibility.
 */
export function loadConfig(paths: AppPaths): AppConfig {
  if (!fs.existsSync(paths.configFile)) {
    return bootstrapConfig(paths);
  }
  let raw: string;
  try {
    raw = fs.readFileSync(paths.configFile, 'utf-8');
  } catch (err) {
    throw new HarvesterError({
      code: 'CONFIG_INVALID',
      user_message: 'Could not read config.json',
      cause: err,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new HarvesterError({
      code: 'CONFIG_INVALID',
      user_message: 'config.json is not valid JSON',
      cause: err,
    });
  }
  const result = configSchemaZ.safeParse(parsed);
  if (!result.success) {
    throw new HarvesterError({
      code: 'CONFIG_INVALID',
      user_message: 'config.json is invalid',
      context: { issues: result.error.issues },
    });
  }
  return result.data;
}

function bootstrapConfig(paths: AppPaths): AppConfig {
  // Synthesize a config with the minimum required-string fields populated with sentinels.
  // The UI treats first_run_completed=false as a redirect to /first-run.
  const parsed = configSchemaZ.parse({
    mteam: { api_key: '__FIRST_RUN_PLACEHOLDER__' },
    qbt: { user: '__FIRST_RUN__', password: '__FIRST_RUN__' },
    downloads: { default_save_path: paths.defaultSaveRoot },
    first_run_completed: false,
  });
  return parsed;
}
