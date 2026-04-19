# Harvester — Implementation Handoff (IMPLEMENTATION.md)

> **Doc ID:** IMPLEMENTATION.md
> **Version:** 1.0
> **Audience:** Claude Code (or any code-writing agent). Implementation is executed against this doc.
> **Format:** Dense. Every section is buildable as written. Where choice exists, one path is named and the other rejected.
> **Consumes:** `PRD.md` (what to build), `ARCHITECTURE.md` (decisions + ADRs), `UI_DESIGN.md` (visual), `UI_HANDOFF.md` (frontend contract).
> **Authority:** This doc MAY add implementation detail not in PRD/ARCHITECTURE, but MUST NOT contradict them. On contradiction, PRD and ARCHITECTURE win; fix this file.

---

## 0. How to Use This Document

1. Read §1 (system snapshot) and §2 (repo scaffold).
2. For each phased task in §13, the body of the task points to other sections of this document that specify the exact contract (signatures, SQL, error codes, API shapes).
3. Every module in §4 has: purpose, file location, exports, dependencies (in + out), public interface, tests.
4. Work phase-by-phase. Each phase has a verification checklist (§14).

---

## 1. System Snapshot

- **Target platform:** Windows 10/11 primary; macOS and Linux CI-clean.
- **Runtime:** Node.js 20 LTS (`>=20.11.0 <21`).
- **Language:** TypeScript 5.4+. Strict mode. No `any` outside `@ts-expect-error` with justification comment.
- **Backend framework:** Fastify v4.
- **DB:** SQLite via `better-sqlite3` v11 (WAL mode).
- **Frontend:** React 18 + Vite 5 + Tailwind 3 + TanStack Query 5 + Zustand.
- **Package structure:** Single repo, two `package.json` (root + `web/`). See ADR-013.
- **Distribution:** `git clone` → `npm install` → `npm run build` → `start.bat`/`start.sh`.
- **Ports:** default `5173` (configurable).
- **Paths:**
  - Config: `%APPDATA%\Harvester\config.json` (Windows), `~/.config/harvester/config.json` (POSIX).
  - DB: `%APPDATA%\Harvester\harvester.db`.
  - Logs: `%APPDATA%\Harvester\logs\harvester-YYYY-MM-DD.jsonl`.

---

## 2. Repository Scaffold

### 2.1 Root layout

```
harvester/
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ tsconfig.build.json
├─ .eslintrc.cjs
├─ .prettierrc
├─ .nvmrc                           # "20.14.0"
├─ .gitignore
├─ README.md
├─ LICENSE                          # MIT
├─ vitest.config.ts
├─ playwright.config.ts
├─ scripts/
│  ├─ start.bat
│  ├─ start.sh
│  ├─ dev.sh
│  ├─ build.sh
│  └─ seed-dev-db.ts
├─ src/                             # BACKEND
│  ├─ index.ts                      # bootstrap / composition root
│  ├─ appPaths.ts                   # resolve %APPDATA% / ~/.config
│  ├─ config/
│  ├─ db/
│  ├─ logger/
│  ├─ errors/
│  ├─ events/
│  ├─ mteam/
│  ├─ qbt/
│  ├─ rules/
│  ├─ workers/
│  ├─ auth/                         # Phase 3
│  ├─ services/
│  ├─ observability/
│  ├─ util/
│  └─ http/
│     ├─ server.ts
│     ├─ plugins/
│     ├─ routes/
│     └─ sse/
├─ shared/                          # shared between backend + frontend
│  ├─ types.ts
│  ├─ constants.ts
│  └─ rules-schema.json             # generated from Zod
├─ db/migrations/
│  ├─ 0001_init.sql
│  └─ …
├─ fixtures/                        # msw handlers + recorded responses
├─ tests/                           # backend unit + integration
├─ web/                             # FRONTEND (see UI_HANDOFF §2)
│  ├─ package.json
│  ├─ tsconfig.json
│  ├─ vite.config.ts
│  ├─ tailwind.config.ts
│  ├─ postcss.config.js
│  ├─ index.html
│  └─ src/
│     ├─ main.tsx
│     ├─ App.tsx
│     ├─ routes/
│     ├─ components/ui/
│     ├─ components/feature/
│     ├─ hooks/
│     ├─ api/
│     ├─ design/tokens.css
│     ├─ store/
│     └─ styles/
└─ .github/workflows/
   ├─ ci.yml
   └─ release.yml
```

### 2.2 Root `package.json`

```json
{
  "name": "harvester",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20.11.0 <21" },
  "scripts": {
    "dev": "node --watch --enable-source-maps --loader tsx src/index.ts",
    "dev:web": "cd web && npm run dev",
    "build": "npm run build:server && npm run build:web",
    "build:server": "tsc -p tsconfig.build.json",
    "build:web": "cd web && npm run build",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint 'src/**/*.ts' 'tests/**/*.ts' 'shared/**/*.ts'",
    "typecheck": "tsc --noEmit && cd web && tsc --noEmit",
    "gen:rules-schema": "tsx scripts/gen-rules-schema.ts",
    "audit": "npm audit --audit-level=high"
  },
  "dependencies": {
    "fastify": "^4.28.0",
    "@fastify/static": "^7.0.0",
    "@fastify/rate-limit": "^9.0.0",
    "@fastify/sensible": "^5.5.0",
    "@fastify/cors": "^9.0.0",
    "better-sqlite3": "^11.3.0",
    "pino": "^9.3.0",
    "pino-roll": "^2.0.0",
    "argon2": "^0.41.0",
    "ajv": "^8.17.0",
    "ajv-formats": "^3.0.0",
    "zod": "^3.23.0",
    "zod-to-json-schema": "^3.23.0",
    "date-fns": "^3.6.0",
    "date-fns-tz": "^3.1.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsx": "^4.11.0",
    "vitest": "^1.6.0",
    "@vitest/coverage-v8": "^1.6.0",
    "@playwright/test": "^1.44.0",
    "msw": "^2.3.0",
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^7.8.0",
    "@typescript-eslint/parser": "^7.8.0",
    "eslint-plugin-boundaries": "^5.0.0",
    "prettier": "^3.3.0",
    "@types/node": "^20.12.0",
    "@types/better-sqlite3": "^7.6.0"
  }
}
```

### 2.3 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "paths": {
      "@shared/*": ["shared/*"],
      "@/*": ["src/*"]
    },
    "baseUrl": "."
  },
  "include": ["src/**/*", "shared/**/*", "tests/**/*", "scripts/**/*"]
}
```

`tsconfig.build.json` extends the above with `{ "compilerOptions": { "outDir": "dist", "noEmit": false, "sourceMap": true }, "exclude": ["tests/**", "scripts/**"] }`.

### 2.4 `.eslintrc.cjs`

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { project: './tsconfig.json' },
  plugins: ['@typescript-eslint', 'boundaries'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:boundaries/recommended'
  ],
  settings: {
    'boundaries/elements': [
      { type: 'config', pattern: 'src/config/**' },
      { type: 'db', pattern: 'src/db/**' },
      { type: 'logger', pattern: 'src/logger/**' },
      { type: 'errors', pattern: 'src/errors/**' },
      { type: 'events', pattern: 'src/events/**' },
      { type: 'mteam', pattern: 'src/mteam/**' },
      { type: 'qbt', pattern: 'src/qbt/**' },
      { type: 'rules', pattern: 'src/rules/**' },
      { type: 'workers', pattern: 'src/workers/**' },
      { type: 'auth', pattern: 'src/auth/**' },
      { type: 'services', pattern: 'src/services/**' },
      { type: 'observability', pattern: 'src/observability/**' },
      { type: 'util', pattern: 'src/util/**' },
      { type: 'http', pattern: 'src/http/**' },
      { type: 'shared', pattern: 'shared/**' }
    ],
    'boundaries/ignore': ['src/index.ts']
  },
  rules: {
    'boundaries/element-types': ['error', {
      default: 'disallow',
      rules: [
        { from: 'http',    allow: ['services', 'db', 'logger', 'errors', 'events', 'shared', 'util', 'auth', 'rules', 'mteam', 'qbt', 'config', 'observability'] },
        { from: 'workers', allow: ['db', 'logger', 'errors', 'events', 'shared', 'util', 'rules', 'mteam', 'qbt', 'services', 'config', 'observability'] },
        { from: 'services', allow: ['db', 'logger', 'errors', 'events', 'shared', 'util', 'config', 'rules', 'qbt', 'mteam', 'observability'] },
        { from: 'rules',    allow: ['shared', 'util', 'errors'] },
        { from: 'mteam',    allow: ['logger', 'errors', 'shared', 'util', 'observability'] },
        { from: 'qbt',      allow: ['logger', 'errors', 'shared', 'util', 'observability'] },
        { from: 'auth',     allow: ['logger', 'errors', 'shared', 'util', 'config', 'observability'] },
        { from: 'db',       allow: ['logger', 'errors', 'shared', 'util'] },
        { from: 'logger',   allow: ['shared', 'util', 'errors'] },
        { from: 'errors',   allow: ['shared'] },
        { from: 'events',   allow: ['shared', 'logger'] },
        { from: 'config',   allow: ['errors', 'shared', 'util', 'logger'] },
        { from: 'observability', allow: ['shared', 'util'] },
        { from: 'util',     allow: ['shared'] }
      ]
    }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/consistent-type-imports': 'error'
  }
};
```

---

## 3. Data Contracts (canonical — referenced by PRD §12)

### 3.1 `shared/types.ts`

```ts
// Discount enum (canonical; from M-Team API)
export const DISCOUNT = ['FREE', '_2X_FREE', '_2X', 'PERCENT_50', 'PERCENT_30', 'NORMAL'] as const;
export type Discount = typeof DISCOUNT[number];

// Torrent decisions (mirrors SQL CHECK constraint)
export const DECISION = [
  'GRABBED', 'SKIPPED_RULE', 'SKIPPED_DUP', 'SKIPPED_FLIPPED',
  'RE_EVALUATED_GRABBED', 'RE_EVALUATED_SKIPPED', 'ERROR'
] as const;
export type Decision = typeof DECISION[number];

// Service states (mirrors SQL CHECK)
export const SERVICE_STATUS = [
  'RUNNING', 'PAUSED_USER', 'PAUSED_EMERGENCY', 'PAUSED_BACKOFF', 'STOPPED'
] as const;
export type ServiceStatus = typeof SERVICE_STATUS[number];

// Log levels
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

// M-Team normalized torrent (produced from raw payload, fed to rule engine)
export interface NormalizedTorrent {
  mteam_id: string;
  name: string;
  size_bytes: number;
  discount: Discount;
  discount_end_ts: number | null;     // unix seconds; null if NORMAL
  seeders: number;
  leechers: number;
  category: string | null;
  created_date_ts: number;            // unix seconds, M-Team publish time
  raw_payload: unknown;               // full M-Team response object (redacted via logger only)
}

// Rule schema v1 (see PRD §7.2 FR-RE-02 + FR-RE-07)
export interface RuleSetV1 {
  schema_version: 1;
  discount_whitelist: Discount[];                            // non-empty
  min_free_hours_remaining: number | null;
  size_gib_min: number;                                      // required; default 0
  size_gib_max: number;                                      // required; default Infinity OR large number
  category_whitelist: string[] | null;
  min_seeders: number | null;
  max_seeders: number | null;
  min_leechers: number | null;
  leecher_seeder_ratio_min: number | null;
  title_regex_include: string | null;
  title_regex_exclude: string | null;
  free_disk_gib_min: number | null;
  first_seeder_fast_path: {
    enabled: boolean;
    max_age_minutes: number;
  } | null;
  qbt_category: string;                                      // required; default 'mteam-auto'
  qbt_tags_extra: string[];                                  // required; default []
  qbt_save_path: string | null;
  qbt_upload_limit_kbps: number | null;
  schedule: ScheduleSpec | null;
  lifecycle_overrides: LifecycleOverrides | null;
}

export interface ScheduleSpec {
  timezone: 'system' | string;                               // IANA zone or 'system'
  windows: Array<{
    days: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
    start: string;                                           // "HH:MM"
    end: string;                                             // "HH:MM"
  }>;
}

export interface LifecycleOverrides {
  seed_time_hours: number | null;                            // override FR-LC-02 72h
  zero_peers_minutes: number | null;                         // override FR-LC-02 60m
  remove_with_data: boolean | null;                          // override default true
}

export interface RuleSet {
  id: number;
  name: string;
  enabled: boolean;
  schema_version: number;
  rules: RuleSetV1;                                          // parsed from rules_json
  created_at: number;
  updated_at: number;
}

// Decision (from evaluator)
export type EvaluationResult =
  | { kind: 'GRABBED'; matched: Array<{ id: number; name: string }> }
  | { kind: 'SKIPPED_RULE'; per_rule_set: Array<{ id: number; name: string; rejection_reason: string }> }
  | { kind: 'SKIPPED_DUP' }
  | { kind: 'SKIPPED_FLIPPED' };

// API envelope
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };
export interface ApiError {
  code: string;
  user_message: string;
  details?: unknown;
  retryable?: boolean;
}

// Dashboard summary (PRD §12 /api/dashboard/summary)
export interface DashboardSummary {
  ratio: number | null;
  uploaded_today: number;
  downloaded_today: number;
  active_leeching: number;
  active_seeding: number;
  grabs_24h: number;
  expiring_1h: number;
  disk_free_gib: number;
  bonus_points: number | null;
  tier: string | null;
  tier_min_ratio: number | null;
  harvester_torrent_count: number;                           // for soft-advisory banner (PRD §14.1)
}

// Torrent row (PRD §12 /api/torrents)
export interface TorrentRow {
  mteam_id: string;
  infohash: string | null;
  name: string;
  size_bytes: number;
  discount: Discount;
  added_at: number;
  state: string;                                             // qBt raw state
  ratio: number | null;
  uploaded_bytes: number | null;
  downloaded_bytes: number | null;
  seeders: number | null;
  leechers: number | null;
  discount_end_ts: number | null;
  matched_rule: string | null;
  tags: string[];
  save_path: string | null;
}

// Log row (PRD §12 /api/logs)
export interface LogRow {
  id: number;
  ts: number;
  level: LogLevel;
  component: string;
  message: string;
  meta: Record<string, unknown>;
}

// Stats daily
export interface StatsDaily {
  date: string;                                              // YYYY-MM-DD (user local)
  grabbed_count: number;
  uploaded_bytes: number;
  downloaded_bytes: number;
  active_torrents_peak: number;
  ratio_end_of_day: number | null;
  bonus_points_end_of_day: number | null;
}

// Settings (PRD §12 /api/settings; API key always masked)
export interface Settings {
  mteam: { api_key_masked: string; api_key_set: boolean };
  qbt: { host: string; port: number; user: string; password_set: boolean; version?: string; allowed_client_ok: boolean };
  poller: { interval_sec: number };
  downloads: { default_save_path: string };
  lifecycle: { seed_time_hours: number; zero_peers_minutes: number; remove_with_data: boolean };
  emergency: { tier_thresholds: Array<{ min_weeks: number; min_ratio: number }>; ratio_buffer: number };
  lan_access: { enabled: boolean; password_set: boolean };
  ui: { theme: 'dark' | 'light' | 'system'; density: 'comfortable' | 'compact' };
  telemetry: { enabled: false };                             // always false
}
```

### 3.2 Zod schemas (runtime validation)

File: `src/rules/schema.ts` — source of truth for rule validation. Also fed to `scripts/gen-rules-schema.ts` to produce `shared/rules-schema.json` for the frontend Monaco editor.

```ts
import { z } from 'zod';
import { DISCOUNT } from '@shared/types.js';

export const discountZ = z.enum(DISCOUNT);

export const hhmmZ = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const dayZ = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

export const scheduleWindowZ = z.object({
  days: z.array(dayZ).min(1),
  start: hhmmZ,
  end: hhmmZ
});

export const scheduleZ = z.object({
  timezone: z.string().min(1),  // 'system' or IANA; validator in util/time.ts checks IANA at runtime
  windows: z.array(scheduleWindowZ).min(1)
});

export const lifecycleOverridesZ = z.object({
  seed_time_hours: z.number().min(0.1).max(720).nullable(),
  zero_peers_minutes: z.number().min(1).max(1440).nullable(),
  remove_with_data: z.boolean().nullable()
}).nullable();

export const ruleSetV1Z = z.object({
  schema_version: z.literal(1),
  discount_whitelist: z.array(discountZ).min(1),
  min_free_hours_remaining: z.number().min(0).max(168).nullable(),
  size_gib_min: z.number().min(0).max(100000),
  size_gib_max: z.number().min(0).max(100000),
  category_whitelist: z.array(z.string().min(1).max(64)).nullable(),
  min_seeders: z.number().int().min(0).nullable(),
  max_seeders: z.number().int().min(0).nullable(),
  min_leechers: z.number().int().min(0).nullable(),
  leecher_seeder_ratio_min: z.number().min(0).nullable(),
  title_regex_include: z.string().max(500).nullable(),
  title_regex_exclude: z.string().max(500).nullable(),
  free_disk_gib_min: z.number().min(0).max(1000000).nullable(),
  first_seeder_fast_path: z.object({
    enabled: z.boolean(),
    max_age_minutes: z.number().int().min(1).max(1440)
  }).nullable(),
  qbt_category: z.string().min(1).max(64).regex(/^[A-Za-z0-9 _-]+$/),
  qbt_tags_extra: z.array(z.string().min(1).max(64)).max(16),
  qbt_save_path: z.string().max(500).nullable(),
  qbt_upload_limit_kbps: z.number().int().min(0).max(1000000).nullable(),
  schedule: scheduleZ.nullable(),
  lifecycle_overrides: lifecycleOverridesZ
})
  .refine(v => v.size_gib_min <= v.size_gib_max, {
    message: 'size_gib_min must be ≤ size_gib_max',
    path: ['size_gib_max']
  })
  .refine(v => v.min_seeders == null || v.max_seeders == null || v.min_seeders <= v.max_seeders, {
    message: 'min_seeders must be ≤ max_seeders',
    path: ['max_seeders']
  })
  .refine(v => {
    if (v.title_regex_include == null) return true;
    try { new RegExp(v.title_regex_include, 'u'); return true; } catch { return false; }
  }, { message: 'title_regex_include is not a valid Unicode regex', path: ['title_regex_include'] })
  .refine(v => {
    if (v.title_regex_exclude == null) return true;
    try { new RegExp(v.title_regex_exclude, 'u'); return true; } catch { return false; }
  }, { message: 'title_regex_exclude is not a valid Unicode regex', path: ['title_regex_exclude'] });

export const ruleSetInputZ = z.object({
  name: z.string().min(1).max(64).regex(/^[A-Za-z0-9 _-]+$/),
  enabled: z.boolean(),
  rules: ruleSetV1Z
});

export type RuleSetInput = z.infer<typeof ruleSetInputZ>;
```

---

## 4. Module-by-Module Specifications

Each module below: **purpose · path · exports · deps · notes**.

### 4.1 `src/index.ts` — composition root

**Purpose:** boot sequence.
**Deps:** config, logger, db, services/preflight, services/serviceState, http/server, workers/*.

**Algorithm:**
```ts
async function main() {
  const paths = resolveAppPaths();                  // appPaths.ts
  const config = loadConfig(paths);                 // config/load.ts; throws if invalid
  const logger = createLogger(config, paths);       // logger/index.ts
  const db = openDatabase(paths, logger);           // db/index.ts (opens + runs migrations)
  await migrateRuleSets(db, logger);                // rules/migrate.ts
  const bus = createEventBus(logger);               // events/bus.ts
  const metrics = createMetrics();                  // observability/metrics.ts
  const serviceState = createServiceState(db, bus, logger);
  const mteam = createMTeamClient(config, logger, metrics);
  const qbt = createQbtClient(config, logger, metrics);
  const preflight = await runPreflight({ config, db, mteam, qbt, logger });
  const app = await createHttpServer({ config, db, logger, bus, metrics, serviceState, mteam, qbt, paths });
  await app.listen({ host: config.bind_host, port: config.port });

  // Start workers (unless preflight hard-failed)
  const workers = preflight.ok ? startWorkers({ config, db, logger, bus, metrics, serviceState, mteam, qbt }) : null;

  installGracefulShutdown({ app, workers, db, logger });
  installGlobalErrorHandlers(logger);
}
main().catch(err => { console.error(err); process.exit(1); });
```

**Graceful shutdown:**
- `SIGINT`/`SIGTERM` → call `workers.stopAll()` (awaits in-flight ticks, ≤ 15 s timeout) → `app.close()` → close DB → `process.exit(0)`.
- Second signal within 5 s of first → hard `process.exit(1)`.

**Global error handlers:**
- `process.on('unhandledRejection', err => { logger.fatal({err}); process.exit(1); })`.
- `process.on('uncaughtException', err => { logger.fatal({err}); process.exit(1); })`.

---

### 4.2 `src/appPaths.ts`

**Exports:**
```ts
export interface AppPaths {
  configFile: string;
  dataDir: string;          // %APPDATA%/Harvester or ~/.config/harvester
  dbFile: string;
  logsDir: string;
  defaultSaveRoot: string;  // %USERPROFILE%/Downloads or $HOME/Downloads
}
export function resolveAppPaths(): AppPaths;
```
**Logic:** platform branch on `process.platform`; create directories recursively on first use; set `0700` on POSIX.

---

### 4.3 `src/config/`

#### `src/config/schema.ts`
Zod schema for the full config file. Fields map to PRD Settings plus internals.

```ts
import { z } from 'zod';

export const configSchemaZ = z.object({
  config_schema_version: z.literal(1),
  port: z.number().int().min(1024).max(65535).default(5173),
  bind_host: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  mteam: z.object({
    api_key: z.string().min(10),
    base_url: z.string().url().default('https://api.m-team.cc')
  }),
  qbt: z.object({
    host: z.string().default('127.0.0.1'),
    port: z.number().int().min(1).max(65535).default(8080),
    user: z.string().min(1),
    password: z.string().min(1),
    allowed_client_range: z.string().default('>=4.0.0 <=5.1.4'),
    allowed_client_override: z.boolean().default(false)
  }),
  poller: z.object({
    interval_sec: z.number().int().min(60).max(3600).default(90),
    backoff_cap_sec: z.number().int().min(60).max(7200).default(1800)
  }),
  downloads: z.object({
    default_save_path: z.string().min(1),
    soft_advisory_harvester_count: z.number().int().min(10).max(10000).default(100)
  }),
  lifecycle: z.object({
    seed_time_hours: z.number().min(0.1).max(720).default(72),
    zero_peers_minutes: z.number().min(1).max(1440).default(60),
    remove_with_data: z.boolean().default(true)
  }),
  emergency: z.object({
    ratio_buffer: z.number().min(0).max(5).default(0.2),
    ratio_resume_buffer: z.number().min(0).max(5).default(0.4),
    tier_thresholds: z.array(z.object({
      min_weeks: z.number().int().min(0),
      min_ratio: z.number().min(0)
    })).default([
      { min_weeks: 0, min_ratio: 0.0 },
      { min_weeks: 4, min_ratio: 1.0 },
      { min_weeks: 8, min_ratio: 2.0 },
      { min_weeks: 12, min_ratio: 3.0 },
      { min_weeks: 16, min_ratio: 4.0 }
    ])
  }),
  lan_access: z.object({
    password_hash: z.string().nullable().default(null),          // Argon2id encoded string
    rate_limit: z.object({
      max_failures: z.number().int().min(1).default(10),
      window_sec: z.number().int().min(1).default(300),
      lockout_sec: z.number().int().min(1).default(300)
    }).default({ max_failures: 10, window_sec: 300, lockout_sec: 300 })
  }).default({ password_hash: null, rate_limit: { max_failures: 10, window_sec: 300, lockout_sec: 300 } }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    retain_days: z.number().int().min(1).max(90).default(14)
  }),
  ui: z.object({
    theme: z.enum(['dark', 'light', 'system']).default('dark'),
    density: z.enum(['comfortable', 'compact']).default('comfortable')
  }).default({ theme: 'dark', density: 'comfortable' }),
  first_run_completed: z.boolean().default(false)
}).refine(cfg => {
  // Bind rule (ADR FR-AUTH-01): 0.0.0.0 only permitted when password hash set
  return cfg.bind_host === '127.0.0.1' || cfg.lan_access.password_hash != null;
}, { message: 'bind_host=0.0.0.0 requires lan_access.password_hash to be set', path: ['bind_host'] });

export type AppConfig = z.infer<typeof configSchemaZ>;
```

#### `src/config/load.ts`

```ts
export function loadConfig(paths: AppPaths): AppConfig;
```
- If file missing → write minimal bootstrap (asking user to run first-run wizard — i.e. a placeholder `mteam.api_key` that fails validation). Actually: if file missing, return an in-memory config in a "needs first-run" state and mark `first_run_completed=false`. The loader writes a file only after first-run-complete.
- If file exists → JSON.parse → Zod parse → on failure, throw `HarvesterError({code:'CONFIG_INVALID', user_message:'config.json is invalid: ...', context: {issues}})`.

#### `src/config/write.ts`

```ts
export function writeConfig(paths: AppPaths, config: AppConfig): void;
```
- Atomic write: write to `config.json.tmp`, `fs.renameSync` over `config.json`.
- POSIX: `fs.chmodSync(file, 0o600)`.
- Update in-memory config store so live handlers see the new values (for settings that don't require restart).

#### `src/config/store.ts`

In-process reactive store for config. Uses a simple event emitter so workers subscribe to `poller.interval_sec` changes, etc.

```ts
export interface ConfigStore {
  get(): AppConfig;
  update(patch: Partial<AppConfig>): void;     // merge + validate + write + emit
  on(key: string, fn: (val: unknown) => void): () => void;
}
```

---

### 4.4 `src/db/`

#### `src/db/index.ts`

```ts
import Database from 'better-sqlite3';
export function openDatabase(paths: AppPaths, logger: Logger): Database.Database {
  const db = new Database(paths.dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  runMigrations(db, logger);
  return db;
}
```

#### `src/db/migrate.ts`

```ts
export function runMigrations(db: Database.Database, logger: Logger): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version));
  const migrationDir = resolveMigrationDir();
  const files = fs.readdirSync(migrationDir).filter(f => /^\d{4}_.+\.sql$/.test(f)).sort();
  for (const file of files) {
    const version = parseInt(file.slice(0, 4), 10);
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(migrationDir, file), 'utf-8');
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?,?)').run(version, Math.floor(Date.now()/1000));
    });
    try { tx(); logger.info({migration: file}, 'Applied migration'); }
    catch (e) { logger.error({migration: file, err: e}, 'Migration failed'); throw e; }
  }
}
```

#### `src/db/queries.ts`

Centralized prepared statements. One module-level cache keyed by SQL string.

```ts
export function getTorrentEventByMteamId(db, mteamId: string): TorrentEventRow | undefined;
export function insertTorrentEvent(db, row: NewTorrentEventRow): number;
export function updateTorrentEventInfohash(db, id: number, infohash: string): void;
export function countReEvals(db, mteamId: string): number;
export function listRuleSets(db, onlyEnabled?: boolean): RuleSet[];
export function getRuleSet(db, id: number): RuleSet | undefined;
export function insertRuleSet(db, input: RuleSetInput): number;
export function updateRuleSet(db, id: number, input: RuleSetInput): void;
export function deleteRuleSet(db, id: number): void;
export function archiveRuleSet(db, original: RuleSet, newVersion: number): void;
export function insertPollRun(db, row: PollRunRow): number;
export function finishPollRun(db, id: number, patch: Partial<PollRunRow>): void;
export function enqueueGrab(db, row: NewGrabQueueRow): number;
export function nextDueGrab(db, now: number): GrabQueueRow | undefined;
export function removeGrabQueue(db, id: number): void;
export function insertLog(db, row: NewLogRow): number;
export function pruneLogsBefore(db, ts: number): number;
export function listLogs(db, filter: LogFilter): LogRow[];
export function upsertStatsDaily(db, row: StatsDaily): void;
export function getLifecyclePeerState(db, infohash: string): LifecyclePeerRow | undefined;
export function upsertLifecyclePeerState(db, row: LifecyclePeerRow): void;
export function insertProfileSnapshot(db, row: ProfileSnapshotRow): number;
export function getServiceState(db): ServiceStateRow;
export function upsertServiceState(db, row: ServiceStateRow): void;
```

Every function is a prepared statement wrapper; returns typed rows. Null-safe: missing columns yield `undefined`.

#### `src/db/maintenance.ts`

- `vacuumNightly(db)` — triggered by a cron-at-04:00 timer in an auxiliary worker; runs `VACUUM INTO` to a temp file, swaps atomically.
- `pruneLogs(db, retainDays)` — deletes log rows older than N days.
- `archiveTorrentEvents(db, olderThanDays)` — copies to `torrent_events_archive` and deletes (migration 0002 creates the archive table if not existing by then).

---

### 4.5 `src/logger/`

#### `src/logger/index.ts`

```ts
export function createLogger(config: AppConfig, paths: AppPaths): Logger;

interface Logger {
  trace: LogFn; debug: LogFn; info: LogFn; warn: LogFn; error: LogFn; fatal: LogFn;
  child(bindings: Record<string, unknown>): Logger;
  setSecrets(secrets: string[]): void;                 // hot-updates redactor
}
```

Under the hood:
- pino with `redact` paths from ADR-010.
- Two destinations via `pino.multistream`: file roller + SQLite sink + (dev only) pretty stdout.
- Before writing, a regex pass substitutes any loaded secret with `***REDACTED***` (ADR-010 secondary redactor).

#### `src/logger/sqliteSink.ts`
Custom writable stream: `_write(chunk, _enc, cb)` parses JSON line and calls `insertLog`. Every 100 writes, runs `pruneLogsBefore` to keep ≤ 10k rows.

#### `src/logger/fileRoller.ts`
Wrapper around `pino-roll` configured with:
```
{ file: path.join(paths.logsDir, 'harvester.jsonl'), frequency: 'daily', size: '50m', limit: { count: retainDays } }
```

---

### 4.6 `src/errors/`

#### `src/errors/index.ts`

```ts
export type ErrorCode =
  | 'CONFIG_INVALID' | 'CONFIG_MISSING'
  | 'MTEAM_AUTH_FAILED' | 'MTEAM_RATE_LIMITED' | 'MTEAM_UNAVAILABLE' | 'MTEAM_FORBIDDEN_METHOD' | 'MTEAM_BAD_RESPONSE'
  | 'QBT_UNREACHABLE' | 'QBT_AUTH_FAILED' | 'QBT_VERSION_DISALLOWED' | 'QBT_BAD_RESPONSE'
  | 'RULE_VALIDATION' | 'RULE_NAME_CONFLICT' | 'RULE_SCHEDULE_INVALID'
  | 'AUTH_UNAUTHENTICATED' | 'AUTH_RATE_LIMITED' | 'AUTH_PASSWORD_WEAK'
  | 'DISK_LOW' | 'DISK_UNREACHABLE'
  | 'GRAB_TOKEN_EXPIRED' | 'GRAB_DUPLICATE' | 'GRAB_DISCOUNT_FLIPPED'
  | 'NOT_FOUND' | 'INTERNAL';

export class HarvesterError extends Error {
  code: ErrorCode;
  user_message: string;
  context?: Record<string, unknown>;
  retryable: boolean;
  cause?: unknown;
  constructor(init: { code: ErrorCode; user_message: string; context?: Record<string, unknown>; retryable?: boolean; cause?: unknown }) {
    super(init.user_message);
    this.code = init.code; this.user_message = init.user_message;
    this.context = init.context; this.retryable = init.retryable ?? false; this.cause = init.cause;
  }
}

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  CONFIG_INVALID: 500, CONFIG_MISSING: 500,
  MTEAM_AUTH_FAILED: 503, MTEAM_RATE_LIMITED: 503, MTEAM_UNAVAILABLE: 503, MTEAM_FORBIDDEN_METHOD: 500, MTEAM_BAD_RESPONSE: 502,
  QBT_UNREACHABLE: 503, QBT_AUTH_FAILED: 503, QBT_VERSION_DISALLOWED: 503, QBT_BAD_RESPONSE: 502,
  RULE_VALIDATION: 400, RULE_NAME_CONFLICT: 409, RULE_SCHEDULE_INVALID: 400,
  AUTH_UNAUTHENTICATED: 401, AUTH_RATE_LIMITED: 429, AUTH_PASSWORD_WEAK: 400,
  DISK_LOW: 507, DISK_UNREACHABLE: 500,
  GRAB_TOKEN_EXPIRED: 409, GRAB_DUPLICATE: 409, GRAB_DISCOUNT_FLIPPED: 409,
  NOT_FOUND: 404, INTERNAL: 500
};

export function normalizeError(err: unknown): HarvesterError {
  if (err instanceof HarvesterError) return err;
  if (err instanceof Error) {
    return new HarvesterError({ code: 'INTERNAL', user_message: 'Unexpected error; see logs', cause: err });
  }
  return new HarvesterError({ code: 'INTERNAL', user_message: 'Unexpected error; see logs', context: { raw: String(err) } });
}
```

**User-safe message catalog** (per code) — UI consumes these verbatim as toast text unless frontend overrides:

| Code | User message |
|------|--------------|
| MTEAM_AUTH_FAILED | "M-Team rejected the API key. Verify it in Settings → M-Team." |
| MTEAM_UNAVAILABLE | "M-Team is not reachable right now. Harvester will retry automatically." |
| MTEAM_RATE_LIMITED | "Rate-limited by M-Team. Poll interval will back off automatically." |
| MTEAM_FORBIDDEN_METHOD | "An internal call hit a forbidden M-Team endpoint. Please file a bug." |
| QBT_UNREACHABLE | "qBittorrent isn't responding. Check that it's running and the credentials in Settings → qBittorrent." |
| QBT_AUTH_FAILED | "qBittorrent rejected the login. Check the username/password in Settings." |
| QBT_VERSION_DISALLOWED | "Your qBittorrent version isn't on M-Team's allowed list. See Settings → qBittorrent for override." |
| AUTH_UNAUTHENTICATED | "This Harvester instance requires a password. Please sign in." |
| AUTH_RATE_LIMITED | "Too many failed sign-in attempts. Try again in 5 minutes." |
| AUTH_PASSWORD_WEAK | "Password must be at least 12 characters and include three of: lowercase, uppercase, digit, symbol — and not match an obvious word." |
| RULE_VALIDATION | "One or more rule-set fields are invalid. See details." |
| DISK_LOW | "Free disk on the save path is below the configured minimum; grab skipped." |
| GRAB_TOKEN_EXPIRED | "A one-time download token was already consumed; Harvester will re-fetch." |
| GRAB_DISCOUNT_FLIPPED | "Torrent discount flipped to paid before the grab completed; skipped." |

---

### 4.7 `src/events/bus.ts`

```ts
export type DomainEvent =
  | { type: 'poll.started' }
  | { type: 'poll.finished'; torrents_seen: number; torrents_grabbed: number }
  | { type: 'poll.failed'; error: ApiError }
  | { type: 'torrent.decision'; mteam_id: string; decision: Decision; matched?: string[]; reason?: string }
  | { type: 'torrent.grab.success'; mteam_id: string; infohash: string }
  | { type: 'torrent.grab.failed'; mteam_id: string; error: ApiError }
  | { type: 'lifecycle.removed'; infohash: string; reason: 'seed_time' | 'zero_peers' | 'discount_flipped' }
  | { type: 'emergency.triggered'; ratio: number; tier_min: number }
  | { type: 'emergency.cleared' }
  | { type: 'service.state'; status: ServiceStatus; meta?: Record<string, unknown> }
  | { type: 'log.entry'; row: LogRow }
  | { type: 'kpi.delta'; partial: Partial<DashboardSummary> }
  | { type: 'auth.unauthenticated'; ip: string; path: string }
  | { type: 'auth.rate_limited'; ip: string }
  | { type: 'config.updated'; patch: Record<string, unknown> };

export interface EventBus {
  emit<T extends DomainEvent['type']>(type: T, payload: Extract<DomainEvent, { type: T }>): void;
  on<T extends DomainEvent['type']>(type: T, handler: (ev: Extract<DomainEvent, { type: T }>) => void): () => void;
  onAny(handler: (ev: DomainEvent) => void): () => void;
}

export function createEventBus(logger: Logger): EventBus;
```

Implementation: wraps `node:events` EventEmitter. Every handler is wrapped in try/catch; broken handler logs and is left in place (only explicit `off` removes).

---

### 4.8 `src/mteam/`

#### `src/mteam/client.ts`

```ts
export interface MTeamClient {
  search(params: { mode?: 'normal' | 'tvshow' | 'movie'; pageSize?: number; sortBy?: string }): Promise<MTeamSearchResult>;
  genDlToken(mteamId: string): Promise<string>;        // returns a single-use URL
  profile(): Promise<MTeamProfile>;
}
export function createMTeamClient(config: AppConfig, logger: Logger, metrics: Metrics): MTeamClient;
```

- `search()`: calls yeast.js first, falls back to raw-HTTP if UnimplementedMethodError AND method not on forbidden list. Translates response to canonical shape (`MTeamSearchResult`) — fields per PRD §7 naming.
- `genDlToken()`: raw-HTTP (yeast.js may not cover). Throws `GRAB_TOKEN_EXPIRED` on known expired responses.
- `profile()`: same pattern.
- Every call wrapped with metric timer + retry (3×, 1 s/2 s/4 s).
- **Timeouts:** connect 5 s, read 10 s, total 15 s, via `AbortController`.
- **Redaction:** API key from headers scrubbed from any logged request.

#### `src/mteam/forbidden.ts`

```ts
export const FORBIDDEN_METHODS: readonly string[] = [
  // populated after Phase 0 spike; placeholder:
];
```

#### `src/mteam/types.ts`
Canonical response shapes — documented per Phase 0 findings.

---

### 4.9 `src/qbt/client.ts`

```ts
export interface QbtClient {
  login(): Promise<void>;
  logout(): Promise<void>;
  getVersion(): Promise<string>;
  getBuildInfo(): Promise<QbtBuildInfo>;
  listTorrents(filter?: { tag?: string; hashes?: string[] }): Promise<QbtTorrentInfo[]>;
  torrentInfo(hashes: string[]): Promise<QbtTorrentInfo[]>;
  addTorrent(input: QbtAddInput): Promise<void>;
  pauseTorrents(hashes: string[]): Promise<void>;
  resumeTorrents(hashes: string[]): Promise<void>;
  recheckTorrents(hashes: string[]): Promise<void>;
  deleteTorrents(hashes: string[], deleteFiles: boolean): Promise<void>;
}
export function createQbtClient(config: AppConfig, logger: Logger, metrics: Metrics): QbtClient;
```

Session cookie managed in-memory; auto-reauth on 403; retries once, then fails.

---

### 4.10 `src/rules/`

#### `src/rules/evaluator.ts`

Pure. Signature per ADR-009.

```ts
export interface EvalContext {
  now_ms: number;
  free_disk_gib: (path: string | null) => number;
  simulate_at_ms?: number;
}

export function evaluate(torrent: NormalizedTorrent, ruleSets: RuleSet[], ctx: EvalContext): EvaluationResult;

// also exported (for dry-run UI):
export function evaluateOne(torrent: NormalizedTorrent, rs: RuleSet, ctx: EvalContext):
  { pass: true } | { pass: false; rejection_reason: string };
```

**Algorithm (evaluateOne):**
```
now = ctx.simulate_at_ms ?? ctx.now_ms
r = rs.rules

// Step 0: schedule gate (FR-RE-07)
if r.schedule != null:
  if !isScheduleActive(r.schedule, now):
    return fail('schedule_closed')

// Step 1: discount whitelist
if r.discount_whitelist not contains torrent.discount:
  return fail('discount_whitelist')

// Step 2: min free hours remaining
if r.min_free_hours_remaining != null:
  hoursLeft = torrent.discount_end_ts == null ? Infinity : (torrent.discount_end_ts - now/1000)/3600
  if hoursLeft < r.min_free_hours_remaining: return fail('min_free_hours_remaining')

// Step 3: size
sizeGib = torrent.size_bytes / 2**30
if sizeGib < r.size_gib_min or sizeGib > r.size_gib_max: return fail('size_range')

// Step 4: category
if r.category_whitelist != null and (torrent.category == null or not in whitelist):
  return fail('category_whitelist')

// Step 5: swarm (UNLESS first-seeder fast path applies)
ageMin = (now/1000 - torrent.created_date_ts)/60
fastPath = r.first_seeder_fast_path
useFastPath = fastPath != null && fastPath.enabled && ageMin < fastPath.max_age_minutes &&
              (torrent.discount == 'FREE' || torrent.discount == '_2X_FREE')

if !useFastPath:
  if r.min_seeders != null and torrent.seeders < r.min_seeders: return fail('min_seeders')
  if r.max_seeders != null and torrent.seeders > r.max_seeders: return fail('max_seeders')
  if r.min_leechers != null and torrent.leechers < r.min_leechers: return fail('min_leechers')
  if r.leecher_seeder_ratio_min != null:
    ratio = torrent.leechers / Math.max(torrent.seeders, 1)
    if ratio < r.leecher_seeder_ratio_min: return fail('leecher_seeder_ratio_min')

// Step 6-7: regex
if r.title_regex_include != null and !new RegExp(r.title_regex_include, 'iu').test(torrent.name):
  return fail('title_regex_include')
if r.title_regex_exclude != null and new RegExp(r.title_regex_exclude, 'iu').test(torrent.name):
  return fail('title_regex_exclude')

// Step 8: free disk
if r.free_disk_gib_min != null:
  free = ctx.free_disk_gib(r.qbt_save_path)
  if free < r.free_disk_gib_min: return fail('free_disk_gib_min')

return pass()
```

**Top-level `evaluate()`:** runs `evaluateOne` across all enabled rule-sets. If ANY pass → GRABBED with list of passing. Else → SKIPPED_RULE with per-rule-set rejection reasons (deterministic order by rule-set id asc). Regex compilation cached per rule-set via `WeakMap<RuleSet, {include?:RegExp, exclude?:RegExp}>`.

#### `src/rules/schedule.ts`

```ts
export function isScheduleActive(schedule: ScheduleSpec, now_ms: number): boolean;
```

Uses `date-fns-tz` to resolve `now_ms` into `(weekday, hour, minute)` in `schedule.timezone` (`'system'` → `Intl.DateTimeFormat().resolvedOptions().timeZone`). Then iterates `schedule.windows`:
- For each window with `days` including the current weekday: check `start ≤ hh:mm < end` (simple case).
- If `end < start` (midnight wrap): ALSO check against the window whose effective start was yesterday ("yesterday's weekday in `days` AND hh:mm < end"). Accept either.

Return true on first active window; false if none.

#### `src/rules/validate.ts`

Wraps Zod + ajv. Returns `{ ok: boolean; errors?: Array<{path: string[]; message: string}> }`.

#### `src/rules/migrate.ts`

```ts
export async function migrateRuleSets(db, logger): Promise<void>;
```
Iterates `rule_sets`, parses `rules_json`, if `schema_version < CURRENT` → runs migration chain, archives original, writes new. Migration chain is a map `{1: (json)=>json, 2: ...}`. Currently only version 1 exists; function is a no-op stub for future-compat.

#### `src/rules/defaults.ts`
```ts
export const FACTORY_DEFAULT_RULE_SET: RuleSetInput = {
  name: 'default',
  enabled: true,
  rules: {
    schema_version: 1,
    discount_whitelist: ['FREE', '_2X_FREE'],
    min_free_hours_remaining: 4.0,
    size_gib_min: 1.0,
    size_gib_max: 80.0,
    category_whitelist: null,
    min_seeders: null, max_seeders: null, min_leechers: null, leecher_seeder_ratio_min: null,
    title_regex_include: null, title_regex_exclude: null,
    free_disk_gib_min: 100,
    first_seeder_fast_path: { enabled: true, max_age_minutes: 10 },
    qbt_category: 'mteam-auto',
    qbt_tags_extra: [],
    qbt_save_path: null,
    qbt_upload_limit_kbps: null,
    schedule: null,
    lifecycle_overrides: null
  }
};
```

---

### 4.11 `src/workers/`

#### `src/workers/loopWorker.ts`

```ts
export interface LoopWorker {
  readonly name: string;
  start(): void;
  stop(): Promise<void>;
  tick(): Promise<void>;        // one iteration; thrown errors become WARN logs
  readonly nextTickAt: number;
}

export function createLoopWorker(opts: {
  name: string;
  intervalMs: () => number;      // dynamic — re-read each tick
  tick: () => Promise<void>;
  onWakeFromSleep?: () => Promise<void>;  // called if wall-clock jump > 3× interval
  logger: Logger;
}): LoopWorker;
```

Implementation: recursive `setTimeout`; monotonic clock via `process.hrtime.bigint()`; on each tick, check `Date.now() - lastTickWallMs > intervalMs*3` → invoke `onWakeFromSleep` before `tick()`.

#### `src/workers/poller.ts`

```ts
export function createPoller(deps: {
  db; logger; bus; metrics; config; mteam; serviceState;
}): LoopWorker;
```

**Tick algorithm** (implements PRD §7.1 FR-PO-01..07 + re-eval):

```
if serviceState.get().status !== 'RUNNING': return
pollRunId = insertPollRun({started_at: now})
bus.emit('poll.started', {})
try:
  searchResp = await mteam.search({mode:'normal', pageSize:50, sortBy:'createdDate desc'})
  seenCount = searchResp.items.length
  grabbedCount = 0
  for each rawTorrent in searchResp.items:
    torrent = normalize(rawTorrent)
    existing = getTorrentEventByMteamId(torrent.mteam_id)
    if existing:
      if canReEval(existing, now): (FR-PO-03)
        decision = evaluator.evaluate(torrent, enabledRuleSets, ctx)
        if decision.kind === 'GRABBED':
          await downloader.enqueue(torrent, decision.matched, pollRunId)
          insertTorrentEvent({..., decision: 'RE_EVALUATED_GRABBED'})
          grabbedCount++
        else if decision.kind === 'SKIPPED_RULE':
          insertTorrentEvent({..., decision: 'RE_EVALUATED_SKIPPED', rejection_reason})
      continue
    // first sight
    decision = evaluator.evaluate(torrent, enabledRuleSets, ctx)
    if decision.kind === 'GRABBED':
      await downloader.enqueue(torrent, decision.matched, pollRunId)
      insertTorrentEvent({..., decision: 'GRABBED', matched_rule: joined names})
      grabbedCount++
    else:
      insertTorrentEvent({..., decision: (kind === 'SKIPPED_RULE' ? 'SKIPPED_RULE' : kind), rejection_reason})
  finishPollRun(pollRunId, {finished_at: now, torrents_seen: seenCount, torrents_grabbed: grabbedCount})
  serviceState.dispatch({type: 'POLL_FINISHED'})
  bus.emit('poll.finished', {torrents_seen: seenCount, torrents_grabbed: grabbedCount})
catch err:
  normalized = normalizeError(err)
  finishPollRun(pollRunId, {finished_at: now, error: normalized.message})
  serviceState.dispatch({type: 'POLL_FAILED', error: normalized})
  bus.emit('poll.failed', {error: {code, user_message}})
  // backoff handled by serviceState + config.poller.interval_sec * 2^n
```

**Dynamic interval:** `intervalMs = () => (serviceState.get().backoff_factor || 1) * config.poller.interval_sec * 1000`.

**Wake-from-sleep:** onWakeFromSleep fires one catch-up tick immediately.

**Re-eval check (`canReEval`):**
- `now - existing.seen_at < 3600`
- `existing.discount_end_ts - now/1000 > 600`
- `countReEvals(existing.mteam_id) < 3`
- `existing.decision IN ('SKIPPED_RULE', 'RE_EVALUATED_SKIPPED')`

#### `src/workers/downloader.ts`

Not a LoopWorker — event-driven via `downloader.enqueue()`. Internal queue processor drains sequentially.

```ts
export interface Downloader {
  enqueue(torrent: NormalizedTorrent, matched: Array<{id:number; name:string}>, pollRunId: number): Promise<void>;
  drainQueued(): Promise<void>;   // called on qBt recovery
}
```

**enqueue algorithm:**
```
await ensureQbtSession() — retries once
torrentsNow = await qbt.listTorrents({ tag: 'harvester' })
if collision(torrentsNow, torrent.name, torrent.size_bytes): 
  insertTorrentEvent(..., decision: 'SKIPPED_DUP'); return
try:
  tokenUrl = await mteam.genDlToken(torrent.mteam_id)
  // re-check discount before add (PRD FR-DL-04)
  freshDiscount = torrent.discount  // from this poll; could stale-check via another search, we accept risk
  if !matched.every(rs => whitelistIncludes(rs, torrent.discount)):
    insertTorrentEvent(..., decision: 'SKIPPED_FLIPPED'); return
  tags = ['harvester', `discount:${torrent.discount}`, ...matched.map(m => `rule:${m.name}`)]
  await qbt.addTorrent({ urls: tokenUrl, category: effectiveCategory(matched), tags, paused: false, savepath, upLimit })
  // verify (FR-DL-01 step 4)
  await sleep(5000)
  after = await qbt.listTorrents({ tag: 'harvester' })
  added = after.find(t => t.name === torrent.name && Math.abs(t.size - torrent.size_bytes) < 1024)
  if added: updateTorrentEventInfohash(existing.id, added.hash)
  else: logger.warn('grab verify failed')
  bus.emit('torrent.grab.success', {...})
catch QBT_UNREACHABLE:
  enqueueGrab({mteam_id, rule_set_name, next_attempt_at: now + backoff})
  bus.emit('torrent.grab.failed', {mteam_id, error})
catch GRAB_TOKEN_EXPIRED:
  // single retry with fresh token
  retry once; on second fail, ERROR log and skip
```

`drainQueued`: called by `grab-retry` worker every 30 s; pops due rows, retries, removes from queue on success. Rows > 10 min old are discarded (token TTL).

#### `src/workers/lifecycle.ts`

```ts
export function createLifecycleWorker(deps): LoopWorker;
```

Interval 300 000 ms. Tick:
```
torrents = qbt.listTorrents({ tag: 'harvester' })
for t in torrents:
  state = getLifecyclePeerState(t.hash) or { first_seen_at: now, zero_peers_since: null }
  peers = t.num_incomplete + t.num_complete
  if peers == 0: state.zero_peers_since = state.zero_peers_since ?? now
  else: state.zero_peers_since = null
  state.last_checked_at = now; upsertLifecyclePeerState(state)
  
  // Safety override (FR-LC-03)
  if t.progress < 1.0 and currentDiscount(t) not in originalGrabWhitelist(t):
    qbt.deleteTorrents([t.hash], true); continue
  
  // Overrides from matched rule-set if any; else defaults
  seedHours = overrideSeedHours(t) ?? config.lifecycle.seed_time_hours
  zeroMin = overrideZeroMin(t) ?? config.lifecycle.zero_peers_minutes
  remove = overrideRemoveWithData(t) ?? config.lifecycle.remove_with_data
  
  seedSec = t.seeding_time ?? (now - state.first_seen_at)
  if seedSec >= seedHours*3600 or (state.zero_peers_since != null and now - state.zero_peers_since >= zeroMin*60):
    qbt.deleteTorrents([t.hash], remove)
    bus.emit('lifecycle.removed', {infohash: t.hash, reason: ...})
```

#### `src/workers/profileProbe.ts`

Interval 900 000 ms. Fetches `mteam.profile()` → insert `profile_snapshots`. Publishes `kpi.delta`.

#### `src/workers/emergencyMonitor.ts`

Subscribes to `profile.snapshot.inserted` (bus event from profileProbe). Reads latest snapshot + config thresholds. On threshold crossing:
- If `ratio < tier_min + buffer`: dispatch `EMERGENCY_TRIGGERED`. Poller auto-pauses via serviceState.
- If `PAUSED_EMERGENCY` and `ratio ≥ tier_min + resume_buffer`: dispatch `EMERGENCY_CLEARED`.

Writes WARN log every 15 min until cleared or manually overridden.

#### `src/workers/grabRetry.ts`

Interval 30 000 ms. Calls `downloader.drainQueued()`.

#### `src/workers/index.ts`

```ts
export function startWorkers(deps): { stopAll: () => Promise<void>; list: LoopWorker[] };
```

---

### 4.12 `src/services/`

#### `src/services/serviceState.ts`

Per ADR-020. Exports:
```ts
export interface ServiceStateStore {
  get(): ServiceStateView;
  dispatch(action: ServiceStateAction): void;
  subscribe(fn: (s: ServiceStateView) => void): () => void;
}

export type ServiceStateView = {
  status: ServiceStatus;
  last_poll_at: number | null;
  consecutive_errors: number;
  backoff_factor: number;         // used by poller for dynamic interval
  allowed_client_ok: boolean;
  preflight: { mteam: boolean; qbt: boolean; allowed_client: boolean; disk: boolean };
  emergency: { active: boolean; current_ratio: number | null; tier_min: number | null } | null;
  lan: { enabled: boolean; listening_on: string };
};

export type ServiceStateAction =
  | { type: 'START' } | { type: 'POLL_STARTED' } | { type: 'POLL_FINISHED' }
  | { type: 'POLL_FAILED'; error: HarvesterError }
  | { type: 'USER_PAUSE' } | { type: 'USER_RESUME' }
  | { type: 'EMERGENCY_TRIGGER'; ratio: number; tier_min: number }
  | { type: 'EMERGENCY_CLEAR' }
  | { type: 'PREFLIGHT_UPDATE'; preflight: ServiceStateView['preflight'] }
  | { type: 'ALLOWED_CLIENT_ACK' } | { type: 'ALLOWED_CLIENT_WARN' }
  | { type: 'SHUTDOWN' };
```

Reducer is a switch statement; illegal transitions → throw. After each state change, persist to `service_state` and emit `service.state` on bus.

#### `src/services/preflight.ts`

```ts
export async function runPreflight(deps): Promise<{ ok: boolean; hard: string[]; soft: string[] }>;
```

Sequence:
1. M-Team auth: `mteam.profile()`; on failure → hard.
2. qBt login; on failure → hard.
3. qBt version vs allowed range (config.qbt.allowed_client_range, using `semver.satisfies`); on failure + not overridden → soft.
4. Save-path: `fs.statSync(config.downloads.default_save_path)` + writable check; on failure → hard.
5. Disk: `freeGib(saveRoot) < 1` → hard; `< 10` → soft.

Returns result; caller decides whether to start workers.

#### `src/services/stats.ts`

```ts
export function rollupDaily(db, now: number): void;
export function getDailyStats(db, from: number, to: number): StatsDaily[];
export function getRuleSetPerformance(db, from: number, to: number): RuleSetPerfRow[];
```

Called nightly by aux worker (`scheduler.ts` cron-at-00:05-local).

---

### 4.13 `src/auth/` (Phase 3)

#### `src/auth/middleware.ts`

Fastify preHandler:
```ts
export function createAuthPreHandler(deps: { config: ConfigStore; verifyCache: LRU; logger; rateLimiter }): FastifyPreHandler;
```

Algorithm:
```
if config.lan_access.password_hash == null: return  // localhost mode
if req.url starts with '/api/health': return
// SSE query-param
let token = req.headers['authorization']?.replace('Bearer ', '') ?? req.query.token
if !token: return 401 AUTH_UNAUTHENTICATED
// IP exempt: localhost never rate-limited
ip = req.ip
if !isLocalhost(ip):
  if rateLimiter.isLocked(ip): return 429 AUTH_RATE_LIMITED, Retry-After
// Cache check
cacheKey = `${ip}:${sha256(token)}:${config.auth_epoch}`
cached = verifyCache.get(cacheKey)
if cached === 'ok': return
if cached === 'bad': rateLimiter.fail(ip); return 401
// Verify
ok = await argon2.verify(config.lan_access.password_hash, token)
if ok: verifyCache.set(cacheKey, 'ok', 60_000); return
verifyCache.set(cacheKey, 'bad', 60_000)
rateLimiter.fail(ip)
bus.emit('auth.unauthenticated', {ip, path: req.url})
return 401 AUTH_UNAUTHENTICATED
```

#### `src/auth/argon2.ts`

```ts
export async function hashPassword(plain: string): Promise<string>;     // Argon2id; params from config
export async function verifyPassword(hash: string, plain: string): Promise<boolean>;
```

Params: `{ type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 }`.

#### `src/auth/passwordPolicy.ts`

```ts
export function validatePasswordPolicy(plain: string, context: { mteamApiKey?: string; qbtPassword?: string }): { ok: boolean; reason?: string };
```

Checks:
- length ≥ 12
- at least 3 of 4 char classes (lowercase, uppercase, digit, symbol)
- not equal to `mteamApiKey`, `qbtPassword`
- not matching denylist regex (case-insensitive): `/^(password|harvester|admin|letmein|qwerty|12345|abcdef)/i` (anchored) PLUS leet variants (`a→@`, `e→3`, etc.). Implement via a compiled list.

#### `src/auth/rateLimiter.ts`

In-memory sliding window per IP. Implementation: per-IP deque of failure timestamps; `fail(ip)` pushes; `isLocked(ip)` returns true if failure count in window ≥ max. On lockout crossed, records `lockedUntil` and all subsequent `isLocked` checks return true until that timestamp.

#### `src/auth/verifyCache.ts`

Small LRU (cap 10). TTL 60 s. Bumped on `auth_epoch` change.

---

### 4.14 `src/observability/metrics.ts`

Already scaffolded in ADR-025. Concrete:

```ts
export interface Metrics {
  counter(name: string, labels?: Record<string, string>): Counter;
  gauge(name: string, labels?: Record<string, string>): Gauge;
  histogram(name: string, labels?: Record<string, string>): Histogram;
  snapshot(): { counters: Record<string, number>; gauges: Record<string, number>; histograms: Record<string, any> };
}
```

Pre-registered metrics (loaded at bootstrap):
- Counters: `poll.runs.total`, `poll.runs.errors`, `poll.torrents.seen`, `poll.torrents.grabbed`, `poll.torrents.skipped` (label: `reason`), `qbt.calls.total`, `qbt.calls.errors`, `mteam.calls.total`, `mteam.calls.errors`, `lifecycle.removed.total`, `lifecycle.errors`, `auth.failures.total`, `auth.rate_limited.total`.
- Gauges: `service.status` (0=STOPPED 1=RUNNING 2=PAUSED_USER 3=PAUSED_EMERGENCY 4=PAUSED_BACKOFF), `harvester.torrent.count`, `disk.free.gib`.
- Histograms: `qbt.calls.duration_ms`, `mteam.calls.duration_ms`, `poll.cycle.duration_ms`.

---

### 4.15 `src/util/`

Each file ≤ 100 LoC:

- `disk.ts`: `freeGib(path, ttlMs = 30_000): Promise<number>`. Uses `fs.statfs`.
- `time.ts`: re-exports from `date-fns`, `isScheduleActive`, `formatRelative`, `parseHHMM`.
- `semver.ts`: tiny `satisfies(version, range)` — use `compare-versions` dep OR hand-roll (ADR-024 bans extra deps for trivial cases — hand-roll).
- `normalize.ts`: `normalizeMTeamTorrent(raw): NormalizedTorrent` — canonical translator.
- `iec.ts`: `gib(bytes)`, `mib(bytes)`, `formatSize(bytes)`, `formatRate(bytesPerSec)`.
- `retry.ts`: `withRetry(fn, { attempts, baseMs, factor, onAttempt? })`.
- `atomic.ts`: `atomicWriteFile(path, data)`.
- `regex.ts`: `compileUnicodeRegex(pattern, flags = 'iu'): RegExp | null` — cached compile.

---

### 4.16 `src/http/server.ts`

```ts
export async function createHttpServer(deps): Promise<FastifyInstance>;
```

Setup order:
1. `fastify({ logger: pinoInstance })`.
2. Register `@fastify/sensible`, `@fastify/cors` (disabled — localhost only by default).
3. Register `@fastify/rate-limit` with global config (override per route where stricter).
4. Register auth preHandler hook (scoped to `/api/*`, bypassed for `/api/health`).
5. Register route files from `routes/`.
6. Register SSE handlers.
7. Register `@fastify/static` with root `web/dist` (production) — NOT in dev (Vite serves).
8. `setErrorHandler`: normalizes `HarvesterError` → `{ok:false, error}` + HTTP status from `ERROR_HTTP_STATUS`. Other errors → `normalizeError` → same path.
9. `setNotFoundHandler`: for `/api/*` paths → 404 envelope; else serves `index.html` (SPA fallback).
10. Graceful close on SIGTERM/SIGINT.

### 4.17 `src/http/routes/` — route files

Each file: one Fastify plugin registering routes with schemas.

#### `src/http/routes/health.ts`
`GET /api/health` → `{status:'ok', uptime_sec, service_status, last_poll_at}`. No auth.

#### `src/http/routes/dashboard.ts`
`GET /api/dashboard/summary` → `DashboardSummary`. Queries: profile_snapshots (latest), stats_daily (today), qbt listTorrents (cached 1 s), free-disk.

#### `src/http/routes/torrents.ts`

- `GET /api/torrents?state=&limit=&cursor=&q=`: composes qBt listTorrents (tag=harvester) + joins `torrent_events` for matched_rule + derives states.
- `GET /api/torrents/:id`: id is mteam_id. Returns detail + transition log (query torrent_events rows for this mteam_id ordered by seen_at) + raw M-Team payload.
- `POST /api/torrents/:id/action`: body `{action}` ∈ `{pause, resume, recheck, remove, remove_with_data}`. Calls qbt, returns new state.
- `POST /api/torrents/bulk-action`: body `{ids, action}`. Per-id loop with partial failures reported.

#### `src/http/routes/rules.ts`

- `GET /api/rules`, `POST /api/rules`, `GET /api/rules/:id`, `PUT /api/rules/:id`, `DELETE /api/rules/:id`: CRUD via `queries.ts`. Validation via `ruleSetInputZ`.
- `POST /api/rules/:id/dry-run`: body `{ simulate_at?: number }`. Loads last 200 `torrent_events` rows (any decision), normalizes each, runs `evaluateOne` against just this rule-set, returns `{items: [{mteam_id, name, would_grab, failing_condition}]}`.
- `POST /api/rules/validate`: body `{rules_json}`. Returns Zod issues normalized.

Name-uniqueness enforced by UNIQUE constraint → `RULE_NAME_CONFLICT` on SQL UNIQUE violation.

#### `src/http/routes/logs.ts`

- `GET /api/logs?level=&component=&from=&to=&q=&limit=&cursor=`: paginated via seek pagination (`id < cursor`).
- `GET /api/logs/stream` (SSE): subscribes to `log.entry` events, writes `event: log\ndata: <JSON>\n\n`. Honors query-param auth per FR-AUTH-07.

#### `src/http/routes/stats.ts`

- `GET /api/stats/daily?from=&to=` → `StatsDaily[]` from `stats_daily`.
- `GET /api/stats/ruleset-performance?from=&to=` → computed from `torrent_events` grouped by `matched_rule`.

#### `src/http/routes/settings.ts`

- `GET /api/settings` → masked settings (api_key → `sk_***abcd`).
- `PUT /api/settings` → partial update. Some fields require restart (documented in response: `{ok, requires_restart: boolean, restart_reason?}`). `bind_host` / `lan_access.password` changes require restart.
- `POST /api/settings/test/mteam` → attempts `mteam.profile()` with provided-or-stored key.
- `POST /api/settings/test/qbt` → attempts qBt login with provided-or-stored creds.
- `POST /api/settings/lan-access` → validates password policy, hashes, writes config. Phase 3.
- `POST /api/settings/lan-access/disable` → clears hash. Phase 3.

#### `src/http/routes/service.ts`

- `GET /api/service/state` → `ServiceStateView`.
- `GET /api/service/events` (SSE) → subscribes to `service.state`, `kpi.delta`, `toast`.
- `POST /api/service/pause`, `POST /api/service/resume`.
- `POST /api/service/restart` → returns `{ok:true}`, then after 200 ms calls `process.exit(0)` so supervisor restarts. Phase 3.

#### `src/http/routes/firstRun.ts`

- `POST /api/first-run/complete` → body `{acknowledged: true}`. Validates wizard prerequisites (config.mteam.api_key set, qbt creds set, default_save_path set), sets `first_run_completed = true`, seeds factory default rule-set if user opted.

#### `src/http/routes/auth.ts` (Phase 3)

- `POST /api/auth/verify` → returns 200 if middleware passes, else middleware already returned 401.

### 4.18 `src/http/sse/` — helpers

Shared logic: heartbeat interval, client registration against bus, close on `req.raw.on('close')`, ring-buffer (100 events) per connection for re-send on reconnect (`Last-Event-ID` support).

---

## 5. SQL Migration 0001_init.sql (verbatim — matches PRD §9)

```sql
-- 0001_init.sql
BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS torrent_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  mteam_id         TEXT    NOT NULL,
  infohash         TEXT,
  name             TEXT    NOT NULL,
  size_bytes       INTEGER NOT NULL,
  discount         TEXT    NOT NULL,
  discount_end_ts  INTEGER,
  seeders          INTEGER,
  leechers         INTEGER,
  category         TEXT,
  created_date_ts  INTEGER,
  raw_payload      TEXT    NOT NULL,
  seen_at          INTEGER NOT NULL,
  decision         TEXT    NOT NULL
                   CHECK (decision IN (
                     'GRABBED','SKIPPED_RULE','SKIPPED_DUP','SKIPPED_FLIPPED',
                     'RE_EVALUATED_GRABBED','RE_EVALUATED_SKIPPED','ERROR'
                   )),
  matched_rule     TEXT,
  rejection_reason TEXT,
  re_eval_count    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_torrent_events_mteam_id ON torrent_events(mteam_id);
CREATE INDEX IF NOT EXISTS idx_torrent_events_seen_at  ON torrent_events(seen_at);
CREATE INDEX IF NOT EXISTS idx_torrent_events_decision ON torrent_events(decision);

CREATE TABLE IF NOT EXISTS rule_sets (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT UNIQUE NOT NULL,
  enabled        INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  schema_version INTEGER NOT NULL DEFAULT 1,
  rules_json     TEXT    NOT NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rule_sets_archive (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  original_rule_set_id  INTEGER NOT NULL,
  schema_version        INTEGER NOT NULL,
  rules_json            TEXT    NOT NULL,
  archived_at           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_runs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at       INTEGER NOT NULL,
  finished_at      INTEGER,
  torrents_seen    INTEGER,
  torrents_grabbed INTEGER,
  error            TEXT
);

CREATE TABLE IF NOT EXISTS grab_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  mteam_id        TEXT NOT NULL,
  rule_set_name   TEXT NOT NULL,
  enqueued_at     INTEGER NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error      TEXT
);

CREATE TABLE IF NOT EXISTS logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,
  level     TEXT NOT NULL CHECK (level IN ('DEBUG','INFO','WARN','ERROR')),
  component TEXT NOT NULL,
  message   TEXT NOT NULL,
  meta_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);

CREATE TABLE IF NOT EXISTS stats_daily (
  date                    TEXT PRIMARY KEY,
  grabbed_count           INTEGER NOT NULL DEFAULT 0,
  uploaded_bytes          INTEGER NOT NULL DEFAULT 0,
  downloaded_bytes        INTEGER NOT NULL DEFAULT 0,
  active_torrents_peak    INTEGER NOT NULL DEFAULT 0,
  ratio_end_of_day        REAL,
  bonus_points_end_of_day INTEGER
);

CREATE TABLE IF NOT EXISTS lifecycle_peer_state (
  infohash         TEXT PRIMARY KEY,
  first_seen_at    INTEGER NOT NULL,
  zero_peers_since INTEGER,
  last_checked_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_snapshots (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ts               INTEGER NOT NULL,
  uploaded_bytes   INTEGER NOT NULL,
  downloaded_bytes INTEGER NOT NULL,
  ratio            REAL NOT NULL,
  bonus_points     INTEGER,
  account_tier     TEXT,
  raw_payload      TEXT
);
CREATE INDEX IF NOT EXISTS idx_profile_snapshots_ts ON profile_snapshots(ts DESC);

CREATE TABLE IF NOT EXISTS service_state (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  status             TEXT NOT NULL CHECK (status IN
                     ('RUNNING','PAUSED_USER','PAUSED_EMERGENCY','PAUSED_BACKOFF','STOPPED')),
  last_poll_at       INTEGER,
  consecutive_errors INTEGER NOT NULL DEFAULT 0,
  allowed_client_ok  INTEGER NOT NULL DEFAULT 0 CHECK (allowed_client_ok IN (0,1)),
  updated_at         INTEGER NOT NULL
);
INSERT OR IGNORE INTO service_state (id, status, consecutive_errors, allowed_client_ok, updated_at)
  VALUES (1, 'STOPPED', 0, 0, strftime('%s','now'));

COMMIT;
```

---

## 6. Frontend Implementation Notes (delta over UI_HANDOFF.md)

Everything structural is already in `UI_HANDOFF.md`. This section adds **only** the deltas introduced by PRD amendments (scheduled windows + LAN auth) and wires up specific hooks.

### 6.1 New UI modules

- `web/src/components/feature/ScheduleEditor.tsx` — weekday pills (lucide `Clock`/`Calendar`), start+end time inputs, window list with add/remove. Zod-integrated via `react-hook-form` `useFieldArray`.
- `web/src/components/feature/PasswordStrengthMeter.tsx` — renders bar + missing-requirements list for LAN password.
- `web/src/components/feature/LoginModal.tsx` — blocking modal prompting for password when in LAN mode without a token in memory. Uses `authStore.setToken(plain)`; on server 401 from next request, re-opens.
- `web/src/components/feature/LanFooterChip.tsx` — yellow lock chip in footer when LAN enabled.

### 6.2 New hooks

- `useLanStatus()` — `useQuery(['service','state'])` → exposes `lan.enabled`, `lan.listening_on`.
- `useSaveLanAccess()` — mutation → `POST /api/settings/lan-access`.
- `useDisableLanAccess()` — mutation → `POST /api/settings/lan-access/disable`.
- `useRestart()` — mutation → `POST /api/service/restart`; on success starts a reconnect loop in `authStore` until `/api/health` responds again.

### 6.3 Auth interceptor (for LAN mode)

```ts
// web/src/api/client.ts
async function apiFetch<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    useAuthStore.getState().promptLogin();
    throw new HarvesterClientError('AUTH_UNAUTHENTICATED');
  }
  if (res.status === 429) {
    // show lockout toast with Retry-After
  }
  return res.json();
}
```

For SSE (EventSource doesn't support headers): append `?token=` query param if token set. Use `@microsoft/fetch-event-source` instead — supports headers.

### 6.4 Generated rule-schema feed for Monaco

`scripts/gen-rules-schema.ts` runs on build:
```ts
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ruleSetInputZ } from '../src/rules/schema';
const schema = zodToJsonSchema(ruleSetInputZ, 'RuleSetInput');
fs.writeFileSync('shared/rules-schema.json', JSON.stringify(schema, null, 2));
```

Monaco editor on `/rules/:id` loads this at mount and registers:
```ts
monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
  schemas: [{ uri: 'inmemory://rules', fileMatch: ['*'], schema }]
});
```

---

## 7. API Request/Response Contract Table (abridged — full OpenAPI generated from Fastify schemas at build)

All paths rooted at `/api`. All responses use `ApiResponse<T>` envelope (§3.1).

| Method | Path | Schema (request) | Schema (response.data) | Notes |
|--------|------|------------------|------------------------|-------|
| GET | `/health` | — | `{status:'ok', uptime_sec, service_status, last_poll_at}` | No auth. |
| GET | `/dashboard/summary` | — | `DashboardSummary` | Cached 1 s server-side. |
| GET | `/torrents` | query: `state?, limit?:int(1-200)=50, cursor?, q?` | `{items:TorrentRow[], next_cursor}` | |
| GET | `/torrents/:id` | — | `{torrent:TorrentRow, transitions, mteam_payload}` | 404 if unknown. |
| POST | `/torrents/:id/action` | `{action:'pause'|'resume'|'recheck'|'remove'|'remove_with_data'}` | `{ok, new_state}` | |
| POST | `/torrents/bulk-action` | `{ids:string[], action}` | `{results:[{id, ok, error?}]}` | |
| GET | `/rules` | — | `{items:RuleSet[]}` | |
| POST | `/rules` | `RuleSetInput` | `{id:number}` | 409 if name exists. |
| GET | `/rules/:id` | — | `RuleSet` | |
| PUT | `/rules/:id` | `RuleSetInput` | `RuleSet` | |
| DELETE | `/rules/:id` | — | `{ok:true}` | |
| POST | `/rules/:id/dry-run` | `{simulate_at?:number}` | `{items:[{mteam_id, name, would_grab:boolean, failing_condition?:string}]}` | |
| POST | `/rules/validate` | `{rules_json:string}` | `{ok, errors?:[{path, message}]}` | |
| GET | `/logs` | query: `level?, component?, from?, to?, q?, limit?, cursor?` | `{items:LogRow[], next_cursor}` | |
| GET | `/logs/stream` | SSE | `event: log\ndata: LogRow\n\n` | Auth via `?token=` in LAN mode. |
| GET | `/stats/daily` | `from, to` | `{items:StatsDaily[]}` | |
| GET | `/stats/ruleset-performance` | `from, to` | `{items:RuleSetPerfRow[]}` | |
| GET | `/settings` | — | `Settings` | API key masked. |
| PUT | `/settings` | partial `Settings` (mutable subset) | `{settings:Settings, requires_restart:boolean, restart_reason?}` | |
| POST | `/settings/test/mteam` | `{api_key?}` | `{ok, profile?, error?}` | |
| POST | `/settings/test/qbt` | `{host,port,user,pass}` | `{ok, version?, error?}` | |
| POST | `/settings/lan-access` | `{enabled:boolean, password?:string}` | `{ok, requires_restart:true}` | Phase 3. |
| POST | `/settings/lan-access/disable` | — | `{ok, requires_restart:true}` | Phase 3. |
| POST | `/service/pause` | — | `{status}` | |
| POST | `/service/resume` | — | `{status}` | |
| POST | `/service/restart` | — | `{ok}` | Phase 3. Response flushed, process exits. |
| GET | `/service/state` | — | `ServiceStateView` | |
| GET | `/service/events` | SSE | multi-event | Same auth rules as `/logs/stream`. |
| GET | `/metrics` | — | `{counters, gauges, histograms}` | |
| POST | `/first-run/complete` | `{acknowledged:true}` | `{ok}` | |
| POST | `/auth/verify` | — | `{ok}` | 401 if bad. |

---

## 8. Event Catalog (complete)

| Event type | Emitted by | Consumed by |
|------------|------------|-------------|
| `poll.started` | poller | SSE /service/events |
| `poll.finished` | poller | SSE, metrics counters |
| `poll.failed` | poller | SSE, serviceState reducer |
| `torrent.decision` | poller | SSE, dashboard KPI refresh |
| `torrent.grab.success` | downloader | SSE, toast, metrics |
| `torrent.grab.failed` | downloader | SSE, toast, metrics |
| `lifecycle.removed` | lifecycle | SSE, toast |
| `emergency.triggered` | emergency-monitor | SSE, toast, serviceState |
| `emergency.cleared` | emergency-monitor | SSE, serviceState |
| `service.state` | serviceState store | SSE |
| `log.entry` | logger sqlite sink | SSE /logs/stream |
| `kpi.delta` | profile-probe, lifecycle | SSE /service/events |
| `auth.unauthenticated` | auth middleware | metrics, logger |
| `auth.rate_limited` | rate limiter | metrics, logger |
| `config.updated` | config store | logger, workers (react to interval changes) |

---

## 9. Test Matrix

### 9.1 Unit tests (Vitest)

| File | Coverage target |
|------|-----------------|
| `src/rules/evaluator.test.ts` | ≥ 95%. Golden fixtures: 50+ cases. Matrix of discount × size × free-hours × schedule. |
| `src/rules/schedule.test.ts` | 100%. Midnight wrap, DST transitions, non-system TZ. |
| `src/rules/validate.test.ts` | Every Zod failure path. |
| `src/rules/migrate.test.ts` | v1 passthrough + future-version hook. |
| `src/services/serviceState.test.ts` | 100%. Every legal + illegal transition. |
| `src/auth/passwordPolicy.test.ts` | Denylist, leet, class-count. |
| `src/auth/rateLimiter.test.ts` | Lockout, window roll. |
| `src/auth/verifyCache.test.ts` | TTL, epoch bump. |
| `src/config/schema.test.ts` | Bind-host refinement, tier thresholds. |
| `src/util/time.test.ts` | schedule, relative. |
| `src/util/normalize.test.ts` | M-Team translator. |
| `src/util/iec.test.ts` | Formatters. |
| `src/errors/*.test.ts` | HTTP status mapping. |

### 9.2 Integration tests (Vitest + msw + sqlite `:memory:`)

| File | Verifies |
|------|----------|
| `tests/integration/poll-and-grab.test.ts` | Full FR-PO/FR-RE/FR-DL happy path. Mocks M-Team search + genDlToken, qBt add. Asserts `torrent_events` row, qBt call, tags. |
| `tests/integration/poll-backoff.test.ts` | 3 consecutive M-Team 5xx → backoff factor 8. |
| `tests/integration/grab-queue.test.ts` | qBt down → enqueue → recover → drain → exactly one add. |
| `tests/integration/allowed-client.test.ts` | qBt reports 5.1.5 → service enters ALLOWED_CLIENT_WARN, grabs blocked. |
| `tests/integration/lifecycle-seed-time.test.ts` | Torrent with `seeding_time=259200` → removed with data. |
| `tests/integration/lifecycle-zero-peers.test.ts` | 0 peers for 3600s → removed. |
| `tests/integration/lifecycle-discount-flip.test.ts` | Progress<1, discount flipped → removed immediately. |
| `tests/integration/emergency-trigger.test.ts` | Ratio drops below tier_min+0.2 → poller pauses, red banner event emitted. |
| `tests/integration/rule-dry-run.test.ts` | Dry-run returns 200 rows with per-rule reasons; simulate_at_ms respected. |
| `tests/integration/rule-multi-match.test.ts` | Two enabled rule-sets match same torrent → one grab, both names in matched_rule. |
| `tests/integration/re-evaluation.test.ts` | Skipped for min_leechers, re-polled within 60 min with higher leechers → RE_EVALUATED_GRABBED. |
| `tests/integration/first-run-gate.test.ts` | Before `first_run_completed`, all non-first-run routes redirect (checked at SPA level; backend returns `requires_first_run` on dashboard summary). |
| `tests/integration/kill-switch.test.ts` | Mid-cycle pause: current cycle finishes, next does not fire. |
| `tests/integration/log-redaction.test.ts` | API key + LAN password substrings substituted with `***REDACTED***`. |
| `tests/integration/lan-auth-allow.test.ts` | Phase 3. Password set, bearer token valid → 200. |
| `tests/integration/lan-auth-deny.test.ts` | Phase 3. No header → 401; wrong password → 401 + rate-counter++. |
| `tests/integration/lan-auth-lockout.test.ts` | Phase 3. 10 fails → 11th is 429 Retry-After 300. Localhost never locked. |
| `tests/integration/sse-query-auth.test.ts` | Phase 3. SSE with `?token=` accepted; without → 401. |
| `tests/integration/schedule-window.test.ts` | Rule with `sat/sun 00:00-23:59`: Tue match → schedule_closed; Sat match → normal eval. |
| `tests/integration/schedule-midnight-wrap.test.ts` | 22:00–08:00 at 23:30 → active; 04:00 next day → active; 09:00 → closed. |

### 9.3 E2E tests (Playwright)

| Spec | Steps |
|------|-------|
| `e2e/first-run.spec.ts` | Boots app with empty config → lands on `/first-run` → fills wizard with mocked M-Team/qBt → completes → lands on Dashboard. |
| `e2e/kill-switch.spec.ts` | Click red pause → status banner flips → unclick → resumes. |
| `e2e/rules-dry-run.spec.ts` | Create new rule-set with non-default size, click Dry Run, assert decision column. |
| `e2e/lan-auth.spec.ts` | Phase 3. Enable LAN from a localhost session → restart → connect from 127.0.0.1 impersonating LAN IP → login modal → enter password → dashboard loads. |
| `e2e/schedule-window.spec.ts` | Phase 2. Create rule with schedule; open Dry Run; set Simulate-At to Tuesday 10 AM when schedule is sat/sun only; assert all rows show "would skip: schedule_closed". |

### 9.4 Bench tests

| Bench | Target |
|-------|--------|
| `evaluator-bench.ts` | ≥ 100 k evals/sec single-thread (for dry-run speed). |
| `poll-cycle-bench.ts` | 50-result poll cycle ≤ 50 ms DB work. |
| `argon2-bench.ts` | Verify < 500 ms on reference laptop (informs cache TTL). |

### 9.5 Manual / non-automated

- Sleep/wake test on Windows laptop: close lid 10 min, open, assert one catch-up poll fires within 5 s.
- Power-loss test: kill-process mid-grab; on restart, `grab_queue` drains.
- Disk-full test: fill disk → confirm service pauses and banner shows.

---

## 10. Acceptance Criteria → Test Mapping (from PRD §15)

| PRD acceptance criterion | Test file |
|--------------------------|-----------|
| FREE torrent matching default rule → GRABBED within 180 s | `poll-and-grab.test.ts` + perf assertion |
| NORMAL torrent → SKIPPED_RULE discount_whitelist | `poll-and-grab.test.ts` |
| Two rule-sets matching → single grab, both names | `rule-multi-match.test.ts` |
| Re-eval with increased leechers → RE_EVALUATED_GRABBED | `re-evaluation.test.ts` |
| qBt offline → grab_queue → recovery → exactly once | `grab-queue.test.ts` |
| qBt 5.1.5 → ALLOWED_CLIENT_WARN blocks grabs | `allowed-client.test.ts` |
| Seed_time ≥ 72h → remove-with-data | `lifecycle-seed-time.test.ts` |
| Discount flipped + progress<1 → remove immediately | `lifecycle-discount-flip.test.ts` |
| Ratio < tier_min+0.2 → EMERGENCY_PAUSED | `emergency-trigger.test.ts` |
| Poll interval < 60 rejected | `config/schema.test.ts` |
| 3 consecutive 500 → backoff ≥ base*8 | `poll-backoff.test.ts` |
| First-run gate | `first-run-gate.test.ts` |
| Kill switch finishes current, stops next | `kill-switch.test.ts` |
| API key in log → redacted | `log-redaction.test.ts` |
| Schedule `sat/sun` on Tuesday → schedule_closed | `schedule-window.test.ts` |
| Schedule wrap `22:00–08:00` at 23:30 / 04:00 / 09:00 | `schedule-midnight-wrap.test.ts` |
| LAN disabled → non-loopback can't reach | Playwright `lan-auth.spec.ts` infra |
| LAN enabled, no header → 401 | `lan-auth-deny.test.ts` |
| LAN 10 fails → 429 Retry-After 300; localhost unaffected | `lan-auth-lockout.test.ts` |
| SSE `?token=` accepted | `sse-query-auth.test.ts` |
| `Password1234` rejected (denylist) | `passwordPolicy.test.ts` |
| GET /settings never returns password hash/plain | `settings.test.ts` integration |
| LAN toggle returns `requires_restart:true` | `settings.test.ts` |
| Dry-run `simulate_at` honored | `rule-dry-run.test.ts` |

---

## 11. Performance Budgets & Measurement

| Budget | Measurement | Enforcement |
|--------|-------------|-------------|
| Poll cycle DB work ≤ 50 ms | `poll-cycle-bench.ts` | CI |
| API p95 ≤ 80 ms | `api-bench.ts` against built server | CI (non-blocking warn initially) |
| Frontend critical JS ≤ 250 KB gz | `vite build --report` + script | CI |
| Lighthouse Performance ≥ 90 (localhost) | `@lhci/cli` | CI (non-blocking) |
| Argon2id verify ≥ 200 ms, ≤ 500 ms | `argon2-bench.ts` | Tuning manually, then lock |
| Memory RSS steady-state ≤ 300 MB | Production smoke on dev rig | Manual |

---

## 12. Observability — Correlation IDs

Every Fastify request gets `req.id` (Fastify default UUIDv4). Every log line emitted during a request carries `req_id`. Every outbound M-Team / qBt call within a request propagates `req_id` in its log context. Every worker tick generates a `tick_id` the same way. Correlation IDs surface in the UI's Log page on the row's hover tooltip.

---

## 13. Phased Task List (ordered; each is a Claude-Code-sized unit)

**Notation:** `[P{phase}-T{n}]` = phase & task number. `blockedBy` annotations identify dependencies.

### Phase 0 — Spike (1 week)

- `[P0-T1]` Create `SPIKE_REPORT.md` skeleton.
- `[P0-T2]` Stand up a throwaway `spike/` folder with:
  - Node script that calls M-Team search via yeast.js → prints raw payload.
  - Script that calls `genDlToken` → asserts single-use + measures TTL.
  - Script that calls `qbt.torrents/add` → reports infohash exposure.
- `[P0-T3]` Populate `shared/mteam-confirmed-fields.json` with observed field names and types.
- `[P0-T4]` Populate `src/mteam/forbidden.ts` with every method that threw `UnimplementedMethodError`.
- `[P0-T5]` Measure Argon2id verify timing on reference hardware; document final params in this file.
- `[P0-T6]` Update PRD §14 OQ table with spike resolutions; amend ARCHITECTURE.md if any decision invalidated.

### Phase 1 — MVP (3–4 weeks)

- `[P1-T1]` Scaffold repo per §2. All configs, lint, prettier, vitest, playwright stubs. Zero runtime code yet.
- `[P1-T2]` Implement `src/appPaths.ts`, `src/config/schema.ts`, `src/config/load.ts`, `src/config/write.ts`. Unit-test config schema.
- `[P1-T3]` Implement `src/errors/` (types, normalize, HTTP status map). Tests.
- `[P1-T4]` Implement `src/db/index.ts`, migration runner, `0001_init.sql`. Smoke test: `:memory:` → runs migrations cleanly.
- `[P1-T5]` Implement `src/db/queries.ts` — ALL prepared statements from §4.4. One test file exercising each.
- `[P1-T6]` Implement `src/logger/` — pino + redactor + file roller + SQLite sink.
- `[P1-T7]` Implement `src/events/bus.ts` + typed events.
- `[P1-T8]` Implement `src/observability/metrics.ts` — counters/gauges/histograms + snapshot.
- `[P1-T9]` Implement `src/util/*`.
- `[P1-T10]` Implement `src/rules/schema.ts` (Zod) + `src/rules/defaults.ts`.
- `[P1-T11]` Implement `src/rules/evaluator.ts` with **no schedule support** (schedule evaluator is a stub returning true for Phase 1).
- `[P1-T12]` Implement `src/rules/validate.ts` + `src/rules/migrate.ts` (no-op for v1).
- `[P1-T13]` Implement `src/mteam/client.ts` + raw adapter + yeast adapter stub. `forbidden.ts` from spike.
- `[P1-T14]` Implement `src/qbt/client.ts`.
- `[P1-T15]` Implement `src/services/serviceState.ts` + legal-transition matrix + tests (all transitions).
- `[P1-T16]` Implement `src/services/preflight.ts`.
- `[P1-T17]` Implement `src/workers/loopWorker.ts` base + poller + downloader + lifecycle + profileProbe + emergencyMonitor + grabRetry.
- `[P1-T18]` Implement `src/http/server.ts` + error handler + SPA fallback.
- `[P1-T19]` Implement `src/http/routes/health.ts`, `dashboard.ts`, `torrents.ts` (single-torrent actions only), `settings.ts` (no LAN endpoints yet), `service.ts` (pause/resume/state), `firstRun.ts`, `metrics.ts`.
- `[P1-T20]` Implement `src/http/sse/service.ts` (service events; no logs stream yet in MVP).
- `[P1-T21]` Implement `src/index.ts` composition root + graceful shutdown.
- `[P1-T22]` Scaffold `web/` per UI_HANDOFF.md §2. Install frontend deps, set up Vite + Tailwind + tokens.css.
- `[P1-T23]` Implement `web/src/App.tsx`, router, layout shell (sidebar + topbar + footer), theme switcher, toast system.
- `[P1-T24]` Implement `web/src/api/client.ts` (no auth yet — Phase 3).
- `[P1-T25]` Implement `web/src/store/` (uiStore, toastStore; authStore stubbed).
- `[P1-T26]` Implement `web/src/hooks/api/*` for dashboard, torrents, settings, service.
- `[P1-T27]` Implement pages: First-run wizard, Dashboard, Torrents (single-selection actions), Settings, Logs (basic DB-query list, no SSE tail yet).
- `[P1-T28]` Implement factory default rule-set seed on first-run complete.
- `[P1-T29]` Implement preflight gating + ALLOWED_CLIENT_WARN flow.
- `[P1-T30]` Implement emergency-monitor wiring + red banner component.
- `[P1-T31]` Integration test suite — all Phase 1 scope tests from §9.2. Green.
- `[P1-T32]` `scripts/start.bat` + `start.sh` + README install section.
- `[P1-T33]` CI pipeline (lint, typecheck, test, build). All green.
- `[P1-T34]` `e2e/first-run.spec.ts` + `e2e/kill-switch.spec.ts`. Green.
- **Phase 1 verification checklist** in §14.

### Phase 2 — v1.0 (3–4 weeks)

- `[P2-T1]` Implement `src/rules/schedule.ts` + all FR-RE-07 semantics. Replace stub in evaluator. Unit tests (midnight wrap, DST, non-system TZ).
- `[P2-T2]` Extend rule JSON schema: `schedule` field, `lifecycle_overrides`. Zod. Update `shared/rules-schema.json` via `gen:rules-schema`.
- `[P2-T3]` Implement `POST /api/rules/:id/dry-run` with `simulate_at` support. Tests.
- `[P2-T4]` Implement multi-rule-set OR evaluation in the evaluator (already supported) + poller integration.
- `[P2-T5]` Implement re-evaluation logic in poller (FR-PO-03). Test.
- `[P2-T6]` Implement Rule-set editor in frontend: list page, form view, JSON view (Monaco), dry-run view with Simulate-At, Schedule accordion.
- `[P2-T7]` Implement Stats page backend endpoints + stats_daily nightly rollup worker.
- `[P2-T8]` Implement Stats page frontend (Recharts).
- `[P2-T9]` Implement `GET /api/logs/stream` SSE + frontend Logs page with virtual scroll + live-tail toggle + filters + export.
- `[P2-T10]` Implement bulk actions on Torrents page.
- `[P2-T11]` Implement keyboard shortcuts (`g d`, `g t`, `g r`, `g l`, `g s`, `g S`, `/`, `?`, `esc`).
- `[P2-T12]` Implement Toasts with mute categories.
- `[P2-T13]` Implement side drawer with M-Team payload + transition log.
- `[P2-T14]` Integration + E2E tests for Phase 2 scope. Green.
- `[P2-T15]` v1.0 tag.
- **Phase 2 verification checklist** in §14.

### Phase 3 — v1.1 (2–3 weeks)

- `[P3-T1]` Implement `src/auth/argon2.ts` with params from Phase 0 spike.
- `[P3-T2]` Implement `src/auth/passwordPolicy.ts` + denylist + leet variants. Tests.
- `[P3-T3]` Implement `src/auth/rateLimiter.ts` with sliding window + localhost exempt. Tests.
- `[P3-T4]` Implement `src/auth/verifyCache.ts` with epoch-bump invalidation. Tests.
- `[P3-T5]` Implement `src/auth/middleware.ts` as Fastify preHandler. Tests (allow/deny/rate-limit/SSE-query-param).
- `[P3-T6]` Implement `POST /api/settings/lan-access`, `POST /api/settings/lan-access/disable`, `POST /api/service/restart`.
- `[P3-T7]` Extend config schema with `lan_access.password_hash`, `lan_access.rate_limit`. Update refinement.
- `[P3-T8]` Wire auth preHandler into Fastify server behind a config-gated toggle.
- `[P3-T9]` Implement frontend `LoginModal`, `PasswordStrengthMeter`, `LanFooterChip`, Settings → Network section.
- `[P3-T10]` Implement `useRestart` hook + reconnect loop in authStore.
- `[P3-T11]` Update redactor to also match LAN plaintext password substring at hot-update time.
- `[P3-T12]` Integration tests: lan-auth-allow / deny / lockout / sse-query-auth. Green.
- `[P3-T13]` Playwright `e2e/lan-auth.spec.ts`. Green.
- `[P3-T14]` Harden log redaction — CI test writing every secret-shape and asserting redaction.
- `[P3-T15]` 100k-row virtual-scroll perf test on Logs page.
- `[P3-T16]` v1.1 GA.
- **Phase 3 verification checklist** in §14.

---

## 14. Per-Phase Verification Checklists

### Phase 0 verification
- [ ] `SPIKE_REPORT.md` exists with field-by-field M-Team schema.
- [ ] `src/mteam/forbidden.ts` lists every `UnimplementedMethodError`-throwing method.
- [ ] Argon2id verify time measured; params in this doc §4.13 reflect measurement.
- [ ] PRD OQ-1..OQ-4 resolved or explicitly deferred.

### Phase 1 verification
- [ ] `start.bat` launches a working dashboard on a fresh Windows machine.
- [ ] First-run wizard completes; factory default rule-set seeded.
- [ ] `poll-and-grab.test.ts` green — FREE torrent grabbed end-to-end.
- [ ] Kill switch stops new polls; lifecycle still runs.
- [ ] Emergency banner appears when mocked ratio drops under tier_min+0.2.
- [ ] All Phase 1 integration tests green.
- [ ] Log redaction test green.
- [ ] README install steps verified by a fresh user.

### Phase 2 verification
- [ ] Multi-rule-set OR evaluation verified via `rule-multi-match.test.ts`.
- [ ] Dry-run with schedule simulate_at works.
- [ ] Stats page shows non-zero data after 24 h of synthetic runs.
- [ ] Logs live tail auto-scrolls and pauses on user scroll up.
- [ ] Bulk actions succeed for 50+ torrents without UI freeze.
- [ ] All keyboard shortcuts honored.
- [ ] Toast mute persists across page reloads (config-store).
- [ ] All Phase 2 integration + E2E tests green.

### Phase 3 verification
- [ ] LAN password set → server rebinds on restart → login modal prompts → successful login → Dashboard loads.
- [ ] 11th failed attempt from LAN IP returns 429; 11th from 127.0.0.1 returns 401 (not rate-limited).
- [ ] SSE `/api/logs/stream?token=` streams; without token → 401.
- [ ] Rotating password invalidates cached auth after next epoch bump.
- [ ] Password-weak cases all caught by policy validator.
- [ ] Log redaction includes LAN plaintext (verified by test emitting the plaintext in a log line).
- [ ] 100k-row Logs virtual-scroll: 60 fps on reference laptop.
- [ ] v1.1 release checklist (§14.1 below) green.

### 14.1 v1.1 release checklist
- [ ] All PRD §15 acceptance criteria mapped to green tests.
- [ ] All ADR action items green.
- [ ] CI pipeline green on main: lint, typecheck, unit, integration, bundle-size, audit, E2E.
- [ ] Readme + screenshots for first-run + LAN setup.
- [ ] Changelog reflects Phase 1/2/3 scope.
- [ ] License: MIT.
- [ ] Repo tagged `v1.1.0`.

---

## 15. Open Items (keep in sync with PRD §14 + ARCHITECTURE §6)

| # | Item | Owner | Blocks |
|---|------|-------|--------|
| OI-1 | Final Argon2id cost params (OAQ-1) | Phase 0 engineer | Phase 3 start |
| OI-2 | forbidden.ts population (OAQ-4 + PRD OQ-4) | Phase 0 engineer | Phase 1 poller |
| OI-3 | genDlToken TTL confirmed (PRD OQ-3) | Phase 0 engineer | Phase 1 downloader |
| OI-4 | M-Team tier ratios (PRD OQ-1) | Phase 0 engineer | Phase 1 emergency monitor |
| OI-5 | Infohash presence in search response (PRD OQ-2) | Phase 0 engineer | None (fallback exists) |
| OI-6 | `/api/db/export` auth requirement when LAN on (ADR OAQ-3) | Phase 3 start | Phase 3 db-export endpoint |

---

## 16. Coding Conventions

- **Imports:** `@/` for `src/`, `@shared/` for `shared/`. No `../../../` chains across 3+ levels.
- **File names:** camelCase for ts files (`loopWorker.ts`), kebab-case for CSS/HTML.
- **Exports:** named exports only. Default exports permitted only for React components and Vite entrypoints.
- **Async:** every `await` is explicit; no `.then()` chains in application code.
- **Error throwing:** only `HarvesterError` (or caught-and-wrapped third-party). Never bare `throw new Error()`.
- **Logging:** structured objects first: `logger.info({ poll_run_id, seen: 12 }, 'poll.finished')`. Never string-concatenate.
- **Tests:** `*.test.ts` colocated with source OR in `tests/integration/`. No `it.only`, `describe.only` in merged code (lint rule).
- **No TODOs in merged code:** open an issue instead.

---

## 17. Delivery Summary for Claude Code

**The complete build order is §13.** Each task is small enough for a single agent invocation. Each task's definition-of-done is: (a) code + tests, (b) typecheck green, (c) lint green, (d) referenced integration/E2E tests pass, (e) no new deps outside the allowlist (ADR-024).

A downstream agent reading this doc end-to-end has:
- Repo structure (§2).
- Full data types (§3).
- Every module's signature (§4).
- Database schema (§5).
- Frontend additions over UI_HANDOFF (§6).
- Every API contract (§7).
- Every event (§8).
- Every test to write (§9, §10).
- Perf budgets (§11).
- Phased tasks (§13).
- Phase-gate checklists (§14).
- Coding style (§16).

If anything here conflicts with PRD.md or ARCHITECTURE.md: PRD/ARCHITECTURE win; open an amendment PR to this file.

*End of IMPLEMENTATION.md.*
