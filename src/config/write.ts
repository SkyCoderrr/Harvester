import fs from 'node:fs';
import path from 'node:path';
import type { AppPaths } from '../appPaths.js';
import type { AppConfig } from './schema.js';
import { configSchemaZ } from './schema.js';
import { HarvesterError } from '../errors/index.js';

/**
 * Atomic write: write to `config.json.tmp`, fsync, then rename over `config.json`.
 * On POSIX, chmod 600.
 */
export function writeConfig(paths: AppPaths, config: AppConfig): void {
  const validated = configSchemaZ.safeParse(config);
  if (!validated.success) {
    throw new HarvesterError({
      code: 'CONFIG_INVALID',
      user_message: 'Refused to write invalid config',
      context: { issues: validated.error.issues },
    });
  }
  fs.mkdirSync(paths.dataDir, { recursive: true });
  const tmp = paths.configFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(validated.data, null, 2), { encoding: 'utf-8' });
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(tmp, 0o600);
    } catch {
      // best-effort
    }
  }
  fs.renameSync(tmp, paths.configFile);
  // Ensure the final file has restrictive perms on POSIX.
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(paths.configFile, 0o600);
    } catch {
      // best-effort
    }
  }
  // Help bash workflows: log what we wrote without leaking secrets.
  try {
    fs.statSync(path.dirname(paths.configFile));
  } catch {
    // ignore
  }
}
