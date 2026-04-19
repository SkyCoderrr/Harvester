import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeConfig } from './write.js';
import type { AppPaths } from '../appPaths.js';
import type { AppConfig } from './schema.js';

// Phase-1 test for writeConfig — exercises the fsync + rename invariants
// introduced in Phase 0 (FR-V2-02). We verify the produced file is valid
// JSON and round-trips, and that the temp file is removed after a
// successful write (no `.config.tmp.*` left behind).

let tempRoot: string;

const SAMPLE: AppConfig = {
  config_schema_version: 1,
  port: 5173,
  bind_host: '127.0.0.1',
  mteam: {
    api_key: '0123456789abcdef',
    base_url: 'https://api.m-team.cc',
    user_agent: 'harvester-test/0.0',
  },
  qbt: {
    host: '127.0.0.1',
    port: 8080,
    user: 'admin',
    password: 'adminadmin',
    allowed_client_range: '>=4.0.0 <=5.1.4',
    allowed_client_override: false,
  },
  poller: { interval_sec: 90, backoff_cap_sec: 1800 },
  downloads: {
    default_save_path: os.tmpdir(),
    soft_advisory_harvester_count: 100,
  },
  lifecycle: { seed_time_hours: 72, zero_peers_minutes: 60, remove_with_data: true },
  emergency: {
    ratio_buffer: 0.2,
    ratio_resume_buffer: 0.4,
    tier_thresholds: [{ min_weeks: 0, min_ratio: 0.0 }],
  },
  lan_access: {
    password_hash: null,
    rate_limit: { max_failures: 5, window_sec: 300, lockout_sec: 300 },
  },
  ui: {},
  first_run_completed: true,
} as unknown as AppConfig;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harvester-writecfg-'));
});

afterEach(() => {
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function paths(): AppPaths {
  return {
    dataDir: tempRoot,
    configFile: path.join(tempRoot, 'config.json'),
    migrationsDir: path.join(tempRoot, 'migrations'),
    dbFile: path.join(tempRoot, 'harvester.db'),
    logDir: path.join(tempRoot, 'logs'),
  } as unknown as AppPaths;
}

describe('writeConfig (FR-V2-02)', () => {
  it('produces a valid JSON file that parses back', () => {
    const p = paths();
    writeConfig(p, SAMPLE);
    const text = fs.readFileSync(p.configFile, 'utf-8');
    const parsed = JSON.parse(text) as { port: number; bind_host: string };
    expect(parsed.port).toBe(5173);
    expect(parsed.bind_host).toBe('127.0.0.1');
  });

  it('leaves no .config.tmp.* sibling on success', () => {
    const p = paths();
    writeConfig(p, SAMPLE);
    const siblings = fs.readdirSync(tempRoot).filter((f) => f.startsWith('.config.tmp.'));
    expect(siblings).toEqual([]);
  });

  it('overwrites atomically: a second write yields fresh contents', () => {
    const p = paths();
    writeConfig(p, SAMPLE);
    writeConfig(p, { ...SAMPLE, port: 5999 });
    const parsed = JSON.parse(fs.readFileSync(p.configFile, 'utf-8')) as { port: number };
    expect(parsed.port).toBe(5999);
  });
});
