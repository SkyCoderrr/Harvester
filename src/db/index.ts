import Database from 'better-sqlite3';
import type { AppPaths } from '../appPaths.js';
import type { Logger } from '../logger/index.js';
import { runMigrations } from './migrate.js';

export type Db = Database.Database;

export function openDatabase(paths: AppPaths, logger: Logger): Db {
  const db = new Database(paths.dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  runMigrations(db, paths, logger);
  return db;
}
