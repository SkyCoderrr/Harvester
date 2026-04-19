import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface AppPaths {
  configFile: string;
  dataDir: string;
  dbFile: string;
  logsDir: string;
  defaultSaveRoot: string;
  migrationsDir: string;
}

/**
 * Resolves platform-appropriate paths for config, DB, logs, and a sensible default download
 * root. Creates the directories on first use.
 *
 * Windows: %APPDATA%\Harvester
 * POSIX:   ~/.config/harvester  (dirs chmod 700)
 */
export function resolveAppPaths(): AppPaths {
  const home = os.homedir();
  const dataDir =
    process.platform === 'win32'
      ? path.join(process.env['APPDATA'] ?? path.join(home, 'AppData', 'Roaming'), 'Harvester')
      : path.join(process.env['XDG_CONFIG_HOME'] ?? path.join(home, '.config'), 'harvester');
  const defaultSaveRoot =
    process.platform === 'win32' ? path.join(home, 'Downloads') : path.join(home, 'Downloads');

  const paths: AppPaths = {
    dataDir,
    configFile: path.join(dataDir, 'config.json'),
    dbFile: path.join(dataDir, 'harvester.db'),
    logsDir: path.join(dataDir, 'logs'),
    defaultSaveRoot,
    migrationsDir: resolveMigrationsDir(),
  };

  fs.mkdirSync(paths.dataDir, { recursive: true });
  fs.mkdirSync(paths.logsDir, { recursive: true });
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(paths.dataDir, 0o700);
      fs.chmodSync(paths.logsDir, 0o700);
    } catch {
      // best-effort
    }
  }
  return paths;
}

function resolveMigrationsDir(): string {
  // Look up from compiled dist/ OR ts-source.
  const candidates = [
    path.resolve(process.cwd(), 'db', 'migrations'),
    path.resolve(import.meta.dirname ?? '.', '..', 'db', 'migrations'),
    path.resolve(import.meta.dirname ?? '.', '..', '..', 'db', 'migrations'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Fall back to cwd
  return candidates[0]!;
}
