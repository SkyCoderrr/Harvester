import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { Logger } from '../logger/index.js';
import type { AppPaths } from '../appPaths.js';

export function runMigrations(
  db: Database.Database,
  paths: AppPaths,
  logger: Logger,
): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
  );
  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((r) => (r as { version: number }).version),
  );
  if (!fs.existsSync(paths.migrationsDir)) {
    logger.warn({ dir: paths.migrationsDir }, 'migrations dir missing');
    return;
  }
  const files = fs
    .readdirSync(paths.migrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
  // FR-V2-05: refuse to start if the on-disk version sequence is non-contiguous
  // (1, 2, 3, …). Any out-of-order or missing version aborts before any apply.
  // Each .sql file has a unique 4-digit version — schema_migrations.version is
  // the primary key, so file names and DB rows are 1:1.
  const onDiskVersions = files.map((f) => parseInt(f.slice(0, 4), 10));
  for (let i = 0; i < onDiskVersions.length; i++) {
    if (onDiskVersions[i] !== i + 1) {
      throw new Error(
        `Migration sequence has gaps or is out of order: files=[${onDiskVersions.join(',')}]`,
      );
    }
  }
  for (const file of files) {
    const version = parseInt(file.slice(0, 4), 10);
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(paths.migrationsDir, file), 'utf-8');
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        version,
        Math.floor(Date.now() / 1000),
      );
    });
    try {
      tx();
      logger.info({ migration: file }, 'applied migration');
    } catch (e) {
      logger.error({ migration: file, err: e }, 'migration failed');
      throw e;
    }
  }
}
