# Harvester — V2 Implementation Plan

> Engineering companion to `PRD_V2_Update.md`. Consumes FR-V2-* IDs; produces file-level change sets, migration SQL, route signatures, and per-phase verification checklists. Intended audience: AI coding agent. Prose is dense; readability is not a priority; accuracy and completeness are.

---

## 0. How to Use This Document

- Authority ranks: this doc < PRD_V2_Update.md < old/PRD.md (v1). If a design choice here conflicts with either PRD, the PRD wins.
- Execute phases in order: §2 → §3 → §4 → §5. All four phases are **mandatory** for v2. Do not parallelize across phases without re-reading PRD §9 dependencies. (§6 documents the former Phase 4 / backtest — removed from v2 scope; retained here as an explicit no-op marker so FR-V2-50/51/52 IDs don't get silently reused.)
- Within a phase, follow the "Work order" list. Items are already topologically sorted.
- Every sub-task cites its FR-V2-* and its source location in `old/`. When re-reading source, prefer the file named in the citation over this doc.
- Before starting a phase, run `pnpm run typecheck && pnpm run lint` to establish a clean baseline.
- After completing a phase, run the phase's **Verification checklist** (§2.9 / §3.13 / §4.9 / §5.10 / §6.6). All must pass before the phase can be called done.
- New ADRs are in §7. Migration scripts are in §8.
- `src/` = backend; `web/src/` = frontend; `shared/` = type definitions shared between them; `db/migrations/` = DDL.
- Path conventions below assume repo root; omit `/` prefix in filenames.

---

## 1. System Snapshot Delta from v1

### 1.1 Unchanged

- Process model: single Node 20 process, Fastify v4 HTTP server, worker threads = 0 (all workers are in-process setInterval loops).
- Storage: better-sqlite3 v11, WAL mode, 1 DB file.
- Auth model: single local user, argon2id hash, bearer token (see FR-V2-13 for where it lives in v2).
- Config on disk: `~/.config/harvester/config.json` mode 0o600; atomic write path (made correct in Phase 0).
- Frontend build: Vite, React 18, TanStack Query 5, Zustand, Tailwind 3 + tokens.
- 7 worker loops (poller, probe, downloader, lifecycle, prober, rollup, log-reaper). Names unchanged.

### 1.2 Added in v2

- Backend modules: `src/util/fetchWithTimeout.ts`, `src/webhooks/dispatcher.ts`, `src/observability/prom.ts`. (Former `src/rules/backtest.ts` removed with Phase 4.)
- Frontend primitives: `web/src/components/ui/SegmentedControl.tsx`, `web/src/lib/discount.ts`, `web/src/hooks/useFocusTrap.ts`.
- Dashboard widgets (Phase 2): `web/src/components/dashboard/*` — `KpiStrip.tsx`, `DiskTile.tsx`, `VolumeButterflyChart.tsx`, `RulePerformanceBar.tsx`, `StateStripBar.tsx`, `AccountHealthBanner.tsx`, `SeedingTimeTile.tsx`, plus extracted `SpeedCard`, `RatioChart`, `GrabsChart`.
- Rules widgets: `web/src/components/rules/*` — `ScheduleEditor.tsx` (Phase 3), `ImportExportBar.tsx` (Phase 3). (Former `BacktestPanel.tsx` removed with Phase 4.)
- DB migration: `db/migrations/0003_profile_snapshot_extras.sql` (see §8.1).
- Optional DB migration: `db/migrations/0004_service_state_user_intent.sql` (see §8.2) — may be merged into 0003 if unshipped.

### 1.3 Removed in v2

- Dashboard tile "Community context" (handoff §B.4.8) — dropped per PRD N16.
- Hard-coded discount color literals across `DiscountBadge`, `GrabsChart`, `RulesPage`.
- `Bus.setMaxListeners(N)` workaround in `src/events/bus.ts` (replaced with proper cleanup + metric).
- Rule-set rename code-path: `"default"` becomes `"FREE and 2X_FREE"` on first run, then migration is no-op (K1).

### 1.4 File/LoC budget

| Area | v1 LoC | v2 target |
|------|--------|-----------|
| `src/` (backend) | ~6,300 | ~7,200 (+900) |
| `web/src/` (frontend) | ~3,500 | ~4,800 (+1,300) |
| `shared/types.ts` | ~180 | ~260 |
| `DashboardPage.tsx` | ~450 | < 300 (enforced) |
| `RulesPage.tsx` | ~520 | < 300 (enforced) |

---

## 2. Phase 0 — Stop-ship Class

**Goal:** Fix trust + correctness issues. No user-visible features ship here; only behavior guarantees. ~2 ideal days.

**Covers:** FR-V2-01, 02, 03, 04, 05, 06, 07, 08, 36, 37, 38.

### 2.1 Work order

1. §2.2 — `0003_indexes` partial migration scaffolding (FR-V2-04 index creation; the column additions land in Phase 1).
2. §2.3 — Migration gap check (FR-V2-05).
3. §2.4 — Atomic writeConfig with fsync (FR-V2-02).
4. §2.5 — Zod on every mutating route (FR-V2-01).
5. §2.6 — Fastify bodyLimit (FR-V2-06).
6. §2.7 — SSE ticket auth (FR-V2-07, FR-V2-08).
7. §2.8 — Service pause-state persistence (FR-V2-03, FR-V2-36, FR-V2-37, FR-V2-38).

### 2.2 Indexes migration

- New file: `db/migrations/0003a_indexes.sql` (short form; PRD refers to this as "part of 0003" — kept separate here so Phase 0 can ship before Phase 1's column additions).
- SQL:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_torrent_events_infohash
    ON torrent_events(infohash) WHERE infohash IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_torrent_events_mteam_seen
    ON torrent_events(mteam_id, seen_at DESC);
  ```
- Verify: `EXPLAIN QUERY PLAN SELECT … FROM torrent_events WHERE infohash=?` should show `USING INDEX idx_torrent_events_infohash`.

### 2.3 Migration gap check

- Edit `db/migrate.ts`:
  - After reading the `schema_migrations` table, also read `db/migrations/*.sql` filenames, parse leading numeric prefix, sort, and assert: `applied.length === files.length && every(files[i].num === applied[i].num) && files[i].num === i+1`.
  - On failure: `throw new Error('Migration sequence has gaps or is out of order: applied=[…] files=[…]')`.
- This must run **before** any migrations are applied (i.e., as a precheck).

### 2.4 Atomic writeConfig + fsync

- Edit `src/config/store.ts` (current function `writeConfig(cfg: Config)`):
  ```ts
  import { openSync, writeSync, fsyncSync, closeSync, renameSync, unlinkSync } from 'node:fs';
  import { dirname, join } from 'node:path';
  export function writeConfig(cfg: Config) {
    const path = configPath();
    const dir = dirname(path);
    const tmp = join(dir, `.config.tmp.${process.pid}.${Date.now()}`);
    const data = JSON.stringify(cfg, null, 2);
    const fd = openSync(tmp, 'w', 0o600);
    try {
      writeSync(fd, data);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    try {
      renameSync(tmp, path);
    } catch (e) {
      try { unlinkSync(tmp); } catch {/* ignore */}
      throw e;
    }
    if (process.platform !== 'win32') {
      const dfd = openSync(dir, 'r');
      try { fsyncSync(dfd); } finally { closeSync(dfd); }
    }
  }
  ```
- Unit test (Phase 1, grouped): kill-between write and rename → original remains intact; temp is removed.
- Source: TECH_DEBT C1, H7.

### 2.5 Zod on mutating routes

- Audit pass: grep all `server.(post|put|delete)\b` across `src/http/routes/**`. Expected: ~22 routes.
- For each handler: top of handler body calls `const body = schema.parse(req.body)`. If a schema doesn't exist, define it next to the route in `src/http/schemas/<name>.ts`.
- Error path: catch `ZodError`, return via existing `ApiResponse.fail('VALIDATION_FAILED', { issues: err.issues })`, status 400. This envelope already exists in `src/http/util/api-response.ts`.
- Global fastify error handler stays as the fallback.
- Routes to cover (non-exhaustive, verify against ripgrep):
  - `src/http/routes/auth.ts`: `/login`, `/password`
  - `src/http/routes/rules.ts`: create/update/delete/dry-run/activate
  - `src/http/routes/torrents.ts`: bulk actions
  - `src/http/routes/service.ts`: `/pause`, `/resume`, `/restart`, `/probe`, `/refresh`
  - `src/http/routes/config.ts`: all settings mutations
  - `src/http/routes/downloader.ts` (if present)
- Unit test (Phase 1): post malformed JSON to `/api/rules` → expect 400 with `code === 'VALIDATION_FAILED'`.
- Source: TECH_DEBT C3.

### 2.6 Fastify bodyLimit

- Edit `src/http/server.ts`:
  ```ts
  const server = Fastify({ bodyLimit: 256 * 1024, logger: pino(...) });
  ```
- Per-route override on rules routes:
  ```ts
  server.post('/api/rules', { bodyLimit: 1024 * 1024, schema: {...} }, handler);
  // and for PUT, dry-run
  ```
- Source: TECH_DEBT M4.

### 2.7 SSE ticket authorization

- Threat: SSE URLs with `?token=<bearer>` leak the bearer into access logs / proxy logs / referer.
- New route: `src/http/routes/sse-ticket.ts`
  ```ts
  export default async function sseTicketRoute(server) {
    const tickets = new Map<string, { expires: number; scope: string }>();
    // periodic sweep every 30s:
    const timer = setInterval(() => {
      const now = Date.now();
      for (const [k,v] of tickets) if (v.expires < now) tickets.delete(k);
    }, 30_000).unref();
    server.addHook('onClose', () => clearInterval(timer));

    server.post('/api/sse-ticket', { preHandler: requireAuth, schema: sseTicketSchema }, async (req, reply) => {
      const { scope } = req.body as { scope: 'logs' | 'service-events' };
      const id = randomBytes(24).toString('base64url');
      tickets.set(id, { expires: Date.now() + 60_000, scope });
      return reply.send({ ok: true, data: { ticket: id } });
    });

    server.decorate('consumeSseTicket', (id: string, scope: string) => {
      const t = tickets.get(id);
      if (!t || t.expires < Date.now() || t.scope !== scope) return false;
      tickets.delete(id);
      return true;
    });
  }
  ```
- SSE handlers in `src/http/routes/service.ts` and `logs.ts`:
  - Replace `preHandler: requireAuth` with a custom `preHandler` that reads `?ticket=…` from `req.query.ticket`, calls `server.consumeSseTicket(ticket, 'service-events')` or `'logs'`, and returns 401 on miss.
- Log scrubbing: edit the pino `formatters.bindings` or use `req.log.child({ req: { url: sanitize(req.url) } })` — preferred: add a `redact` rule in pino config:
  ```ts
  pino({ redact: { paths: ['req.url', 'headers.authorization'], censor: (v, path) => {
    if (path[1] === 'url' && typeof v === 'string') return v.replace(/([?&])ticket=[^&]+/g, '$1ticket=REDACTED');
    return '[REDACTED]';
  }}})
  ```
- Frontend changes (Phase 2 touches these; Phase 0 keeps the old auth until the client swap — acceptable transitional state because old token is still scoped to the user's own machine):
  - `web/src/hooks/useServiceEvents.ts`, `useLogStream.ts`: prefetch ticket via `POST /api/sse-ticket` then construct `new EventSource('/api/service/events?ticket=…')`.
  - Reconnect flow: on `error`, fetch a fresh ticket before reconnecting.
- Source: TECH_DEBT C2. ADR-052 in §7.

### 2.8 Pause-state persistence (trust)

- Shape change in `service_state`:
  - Current: `{ state: 'running'|'paused'|'preflight_failed', reason }` (single enum).
  - Target: `{ desired: 'running'|'paused', system: 'running'|'paused'|'preflight_failed', reason, updated_at }`.
- Migration: `db/migrations/0004_service_state_user_intent.sql`:
  ```sql
  ALTER TABLE service_state ADD COLUMN desired TEXT NOT NULL DEFAULT 'running';
  UPDATE service_state SET desired = CASE WHEN state = 'paused' THEN 'paused' ELSE 'running' END;
  ALTER TABLE service_state RENAME COLUMN state TO system;
  ```
  - (Note: SQLite ≥ 3.25 supports `RENAME COLUMN`; confirmed available in better-sqlite3 v11. If not, use the table-rebuild pattern: CREATE new table, INSERT SELECT, DROP, RENAME.)
- Backend changes:
  - `src/service/state.ts`:
    - `readState(): { desired, system, reason, updated_at }`.
    - `setDesired(desired: 'running'|'paused', reason?: string)` — writes only `desired`.
    - `setSystem(system: 'running'|'paused'|'preflight_failed', reason?: string)` — writes only `system`.
  - `src/service/boot.ts`:
    - After migration: read state. If `desired === 'paused'`, set `system='paused'`, reason='user_paused', and **skip worker startup**. If `desired === 'running'`, run preflight; on success start workers and `setSystem('running')`; on failure `setSystem('preflight_failed', reason)`.
  - `src/http/routes/service.ts`:
    - `POST /api/service/pause` → `setDesired('paused')`, stop workers gracefully.
    - `POST /api/service/resume` → `setDesired('running')`, run preflight, on success start workers.
    - `POST /api/service/restart` → preserve `desired`; stop + start.
- Dashboard summary (consumed by StatusTile): extend `ServiceStatus` in `shared/types.ts` to include `desired` and `system` (do not remove `state` yet; alias `state = system` for one release).
- Verify: `pause → kill -9 → restart` → service boots with `system='paused'`, workers not running. User sees "Paused (user)" in UI.
- Source: STATUS K4 / Brainstorm B1. ADR-053 in §7.

### 2.9 Phase 0 verification checklist

- [ ] `pnpm run typecheck` clean.
- [ ] `pnpm run lint` clean.
- [ ] `sqlite3 db.sqlite 'EXPLAIN QUERY PLAN SELECT * FROM torrent_events WHERE infohash=?;'` mentions `idx_torrent_events_infohash`.
- [ ] Delete `db/migrations/0002_*.sql` (simulate gap) → service refuses to start with gap-check error. Restore file.
- [ ] `ps kill -9 <harvester>` during a config write leaves either the old or the new valid JSON (not a truncated/empty file). Temp file absent.
- [ ] `curl -XPOST -d '{invalid}' -H 'Authorization: Bearer …' /api/rules` → 400 `VALIDATION_FAILED`.
- [ ] Without a ticket: `curl /api/service/events?token=…` → 401. With one-shot ticket: 200, SSE stream opens; a second request with the same ticket → 401.
- [ ] `req.url` in logs contains `ticket=REDACTED`, not the actual ticket.
- [ ] Body > 256 KB to any non-rules route → 413.
- [ ] Pause → SIGKILL → restart → `service_state.desired='paused'`, workers not running, UI shows paused.

---

## 3. Phase 1 — Backend Resilience + Dashboard Data Layer

**Goal:** Land the backend changes the dashboard depends on, plus general resilience. ~3 ideal days.

**Covers:** FR-V2-09, 10, 11, 12, 19 (backend), 30, 31, 32, 33, 34, 35, 59, 60, 61, 64 and the drive-by debt items L1, L3, L8.

### 3.1 Work order

1. §3.2 — `fetchWithTimeout` helper (FR-V2-09, L3).
2. §3.3 — qBt single-flight login (FR-V2-10).
3. §3.4 — SSE listener cleanup + bus MaxListeners (FR-V2-11).
4. §3.5 — Retry jitter + worker stagger (FR-V2-12).
5. §3.6 — Migration 0003 full form (profile_snapshot_extras + indexes from Phase 0 consolidated) (FR-V2-04, 30).
6. §3.7 — normalizeMTeamProfile + new columns (FR-V2-31).
7. §3.8 — `diskStats()` (FR-V2-19 backend).
8. §3.9 — Extend `DashboardSummary` + single-query delta (FR-V2-32, 35).
9. §3.10 — `/api/stats/profile-volume` endpoint (FR-V2-33).
10. §3.11 — `stats_daily` delta redefinition (FR-V2-34).
11. §3.12 — Concurrency + TZ fixes (FR-V2-59, 60, 61).
12. §3.13 — Rule-name migration (FR-V2-64, K1).
13. §3.14 — Drive-by (L1 argon2 bench, L8 error wording).
14. §3.15 — Backend unit test suite.

### 3.2 `fetchWithTimeout` helper

- New file: `src/util/fetchWithTimeout.ts`:
  ```ts
  export interface FetchWithTimeoutOptions extends RequestInit {
    connectTimeoutMs?: number; // default 15_000
    totalTimeoutMs?: number;   // default 30_000
  }
  export async function fetchWithTimeout(url: string | URL, opts: FetchWithTimeoutOptions = {}) {
    const ctl = new AbortController();
    const { connectTimeoutMs = 15_000, totalTimeoutMs = 30_000, ...rest } = opts;
    const t = setTimeout(() => ctl.abort(new Error(`total timeout ${totalTimeoutMs}ms`)), totalTimeoutMs);
    t.unref?.();
    try {
      return await fetch(url, { ...rest, signal: ctl.signal });
    } finally {
      clearTimeout(t);
    }
  }
  ```
- Replace every `fetch(` call in:
  - `src/qbt/client.ts`
  - `src/workers/downloader.ts`
  - `src/mteam/client.ts` (if it still does raw fetch)
- Log on timeout with level=warn + url host + elapsed ms. Do NOT log request bodies.
- Source: TECH_DEBT H1, L3.

### 3.3 qBt single-flight login

- In `src/qbt/client.ts`, add:
  ```ts
  let loginInflight: Promise<void> | null = null;
  async function ensureSession() {
    if (loginInflight) return loginInflight;
    loginInflight = (async () => {
      try {
        await doLogin();
      } finally {
        loginInflight = null;
      }
    })();
    return loginInflight;
  }
  ```
- Same pattern for 403-recovery path in `withQbtAuth()`.
- Source: TECH_DEBT H2.

### 3.4 SSE listener cleanup

- In `src/http/routes/service.ts` (SSE handler) and `src/http/routes/logs.ts`:
  ```ts
  const onEvent = (ev) => {
    try {
      reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    } catch (e) {
      bus.off('service-event', onEvent);
      try { reply.raw.end(); } catch {}
    }
  };
  bus.on('service-event', onEvent);
  reply.raw.on('close', () => bus.off('service-event', onEvent));
  reply.raw.on('error', () => bus.off('service-event', onEvent));
  ```
- In `src/events/bus.ts`: remove `bus.setMaxListeners(N)`; call `bus.setMaxListeners(Infinity)` and add a gauge `sse_subscribers{scope}` in `src/observability/metrics.ts`. Increment on `on`, decrement on `off`.
- Source: TECH_DEBT H3.

### 3.5 Retry jitter + worker stagger

- `src/util/retry.ts`:
  ```ts
  export function backoffDelay(attempt: number, base = 1000, cap = 60_000) {
    const pure = Math.min(cap, base * 2 ** attempt);
    return pure + Math.floor(Math.random() * base);
  }
  ```
- Worker manager `src/workers/manager.ts`: for each worker, first tick at `baseInterval * (1 + (Math.random()-0.5) * 0.3)` (±15%).
- Source: TECH_DEBT H6.

### 3.6 Migration 0003 (full)

- File: `db/migrations/0003_profile_snapshot_extras.sql` (see §8.1 for full DDL).
- Consolidates with 0003a_indexes from Phase 0 (delete 0003a; renumber anything after).
- Adds to `profile_snapshots`: `warned INTEGER NOT NULL DEFAULT 0`, `leech_warn INTEGER NOT NULL DEFAULT 0`, `vip INTEGER NOT NULL DEFAULT 0`, `seedtime_sec INTEGER`, `leechtime_sec INTEGER`.
- Source: HANDOFF §B.12, REVIEW §3.6, §3.7.

### 3.7 normalizeMTeamProfile extensions

- Edit `src/mteam/normalize.ts::normalizeMTeamProfile(raw)`:
  - Map raw `warned` (bool|0|1) → 0/1 integer.
  - Map raw `leechwarn` or `leech_warn` → `leech_warn` 0/1.
  - Map raw `vip` 0/1 (or raw `userGroup === 'VIP'` if older schema).
  - Map raw `seedTime` / `seedtime` (seconds) → `seedtime_sec` int.
  - Map raw `leechTime` / `leechtime` → `leechtime_sec` int.
  - Fail-open: if a field is missing, default to 0 for bools / null for seedtime fields.
- Update `src/workers/probe.ts::writeProfileSnapshot(snapshot)` to include the new columns in its INSERT statement.
- Source: REVIEW §6.1.

### 3.8 `diskStats()`

- Edit `src/system/disk.ts`:
  ```ts
  import { statfsSync } from 'node:fs';
  export interface DiskStats { freeGib: number; totalGib: number; usedGib: number; }
  export function diskStats(path: string): DiskStats {
    const s = statfsSync(path);
    const blockSize = s.bsize;
    const total = s.blocks * blockSize;
    const free = s.bavail * blockSize; // bytes available to unprivileged user
    const used = total - free;
    return {
      freeGib: +(free / (1024**3)).toFixed(2),
      totalGib: +(total / (1024**3)).toFixed(2),
      usedGib: +(used / (1024**3)).toFixed(2),
    };
  }
  export function freeGib(p: string) { return diskStats(p).freeGib; }
  ```
- Callers of `freeGib()` stay working; new callers use `diskStats()`.
- Source: HANDOFF §B.4.3, §B.12; REVIEW §3.3.

### 3.9 Extend `DashboardSummary` + single-query delta

- `shared/types.ts`:
  ```ts
  export interface DashboardSummary {
    // existing
    grabs_today: number; grabs_24h_delta: number; // ... (keep v1 fields)
    // Phase-1 additions (all nullable additive):
    uploaded_bytes_total: number | null;
    uploaded_bytes_24h: number | null;
    uploaded_bytes_delta_24h: number | null;
    downloaded_bytes_total: number | null;
    downloaded_bytes_24h: number | null;
    downloaded_bytes_delta_24h: number | null;
    disk_total_gib: number | null;
    disk_used_gib: number | null;
    account_warned: 0 | 1 | null;
    account_leech_warn: 0 | 1 | null;
    account_vip: 0 | 1 | null;
    seedtime_sec: number | null;
    seedtime_sec_delta_24h: number | null;
    // runtime status extension (from Phase 0):
    service_desired: 'running' | 'paused';
    service_system: 'running' | 'paused' | 'preflight_failed';
  }
  ```
- `src/http/routes/dashboard.ts::summary`:
  - Replace the pair of "today" / "yesterday" queries with one aggregate:
    ```sql
    SELECT
      SUM(CASE WHEN occurred_at >= ? THEN 1 ELSE 0 END) AS today,
      SUM(CASE WHEN occurred_at >= ? AND occurred_at < ? THEN 1 ELSE 0 END) AS yesterday
    FROM torrent_events WHERE type = 'grab_success';
    ```
  - Disk fields come from `diskStats(config.qbt.downloadDir)`.
  - Uploaded/downloaded totals: `SELECT uploaded_bytes, downloaded_bytes, warned, leech_warn, vip, seedtime_sec FROM profile_snapshots ORDER BY ts DESC LIMIT 1`.
  - 24h deltas: same query + `WHERE ts <= now-24h LIMIT 1`, subtract.
- Source: HANDOFF §B.12, REVIEW §4.2, TECH_DEBT M10.

### 3.10 `/api/stats/profile-volume` endpoint

- New route file: `src/http/routes/stats-profile-volume.ts`:
  ```ts
  const querySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(14) });
  server.get('/api/stats/profile-volume', { preHandler: requireAuth }, async (req) => {
    const { days } = querySchema.parse(req.query);
    const sinceUnix = Math.floor(Date.now()/1000) - days * 86400;
    const rows = db.prepare(`
      WITH per_day AS (
        SELECT date(ts, 'unixepoch', 'localtime') AS day,
               MAX(uploaded_bytes)   AS up_end,
               MAX(downloaded_bytes) AS down_end
        FROM profile_snapshots
        WHERE ts >= ?
        GROUP BY day
      )
      SELECT day,
             up_end   - LAG(up_end,   1, 0) OVER (ORDER BY day) AS uploaded_delta,
             down_end - LAG(down_end, 1, 0) OVER (ORDER BY day) AS downloaded_delta
      FROM per_day
      ORDER BY day ASC;
    `).all(sinceUnix) as Array<{ day: string; uploaded_delta: number; downloaded_delta: number }>;
    return { ok: true, data: { rows } };
  });
  ```
- The first row will have `LAG` = 0 → delta = that day's max itself. Clients must handle: treat first row's delta as inaccurate and display as a lighter color or omit. Documented in component §4.4.
- Add to `shared/api-routes.ts` (if any registry exists).
- Source: REVIEW §4.4.

### 3.11 `stats_daily` delta redefinition

- Edit `src/workers/rollup.ts::statsDailyRollup`:
  - For each local day completed, compute `uploaded_delta` and `downloaded_delta` as `MAX(profile_snapshots.uploaded_bytes) - MAX(profile_snapshots.uploaded_bytes of previous day)`.
  - If yesterday has no snapshot, fall back to `MIN(today) - 0` (which equals the total at first probe of the day — not accurate but non-zero).
  - Write those into `stats_daily.uploaded_bytes` and `downloaded_bytes`.
- Document: historical `stats_daily.{uploaded,downloaded}_bytes` rows older than the migration ARE WRONG (they were qBt session counters). Clients that read stats_daily historical data should chart only from the migration cutover forward.
- Source: REVIEW §3.10.

### 3.12 Concurrency + TZ fixes

- **FR-V2-59 (poll-cycle reentrancy):** In every worker, replace the pattern:
  ```ts
  setInterval(doWork, interval);
  ```
  with:
  ```ts
  let active = false;
  async function loop() {
    if (active) return;
    active = true;
    const start = performance.now();
    try { await doWork(); }
    finally {
      active = false;
      const elapsed = performance.now() - start;
      const delay = Math.max(100, interval - elapsed);
      timeoutHandle = setTimeout(loop, delay);
      timeoutHandle.unref?.();
    }
  }
  ```
  - Record `interval_used_ms` gauge so we can confirm jitter + drift behaviour.
- **FR-V2-60 (performance.now):** audit for `Date.now() - startedAt` idioms; swap to `performance.now()` for elapsed. Wall-clock timestamps stay `Date.now()`.
- **FR-V2-61 (TZ-aware rollup):** In `rollup.ts`, use `date-fns-tz::utcToZonedTime` with `config.tz` (default 'UTC') to derive "today local". Matches `src/util/time.ts:85::isScheduleActive`'s TZ convention.

### 3.13 Rule-name migration

- New file: `src/migrations/rename-default-ruleset.ts`:
  ```ts
  export function renameDefaultRuleset(db: Database) {
    const row = db.prepare(`SELECT version FROM schema_migrations WHERE name = 'rule_name_default_to_free2x'`).get();
    if (row) return;
    db.prepare(`UPDATE rule_sets SET name = 'FREE and 2X_FREE' WHERE name = 'default'`).run();
    db.prepare(`INSERT INTO schema_migrations(version, name, applied_at) VALUES (999, 'rule_name_default_to_free2x', ?)`).run(Date.now());
  }
  ```
- Invoke from `src/service/boot.ts` right after DB migrations apply, before workers start.
- Idempotent via `schema_migrations` flag. Note version=999 is a sentinel (does NOT participate in sequential file-based migration numbering) — document inline.
- Alternative: make it a real migration `0004_rename_default.sql`. Either is fine; the sentinel approach avoids renumbering.
- Source: STATUS K1.

### 3.14 Drive-by (L1, L8)

- **L1 argon2 bench:** On first boot, run `bench()` (hash a short string with current params) and log `argon2_hash_ms`. If > 500 ms, warn "memoryCost too high for this machine"; if < 50 ms, warn "memoryCost too low; consider bumping". Single log line at boot. Do not change params automatically.
- **L8 MTEAM_FORBIDDEN_METHOD wording:** grep `MTEAM_FORBIDDEN_METHOD` in `src/mteam/**` — replace with `MTEAM_REQUIRED_HEADER_MISSING` (the actual condition). Update any toast copy that surfaces this.

### 3.15 Backend unit test suite (minimal)

- Tooling: add `vitest` as devDep, `vitest.config.ts` with node environment and the `src/**/*.test.ts` glob.
- Target tests (each should be single-file, fast, no network):
  1. `src/rules/evaluator.test.ts` — feeds 6 canonical torrents through evaluator; asserts the expected match/skip/reason. Covers: freeleech-only, 2x_free, min_seeders threshold, schedule active/inactive, size bounds, ratio threshold.
  2. `src/workers/downloader.test.ts` — mock fetchWithTimeout; assert grab loop handles 200, 429 (retry w/ backoff), 500 (give-up), timeout (record error).
  3. `src/config/store.test.ts` — writeConfig + kill-between-write-and-rename simulation using fs mock; asserts invariants (file is valid JSON or old JSON, never truncated).
  4. `src/http/auth.test.ts` — password-verify with a known argon2 hash; wrong pw → false; right pw → true.
  5. `src/util/fetchWithTimeout.test.ts` — asserts abort fires after totalTimeoutMs; asserts normal response returns; asserts timer is unref'd.
- Total target: 10–15 tests. Runtime: < 3 s.
- Hook into `package.json`: `"test": "vitest run"` and `"test:watch": "vitest"`.
- Source: user scope direction.

### 3.16 Phase 1 verification checklist

- [ ] All new `DashboardSummary` fields non-null on a primed account; null on a cold DB.
- [ ] `curl /api/stats/profile-volume?days=14` → 14 rows ordered ASC with numeric deltas; row[0] delta equals its own `up_end` (documented).
- [ ] Hang qBt via `kill -STOP <pid>` → after 30 s, downloader worker logs a timeout and stays healthy.
- [ ] Force concurrent re-auth (parallel requests on a cold client) → exactly one `POST /api/v2/auth/login` in access log.
- [ ] Retry delays vary across attempts (observable in logs — not constant).
- [ ] Worker startup staggered (first-tick timestamps within same second are offset).
- [ ] Pino redact rule strips `ticket=` from `req.url` (sanity re-check).
- [ ] `pnpm test` → all pass.
- [ ] Rename migration: `SELECT name FROM rule_sets` → `"FREE and 2X_FREE"` replaces `"default"` on first boot, no-op after.

---

## 4. Phase 2 — Dashboard v2 Frontend

**Goal:** Implement the dashboard redesign. ~3 ideal days.

**Covers:** FR-V2-16–29, 53–58; plus M6, M7, M14, M15, M16, L4, L6, L7 as drive-by.

### 4.1 Work order

1. §4.2 — Page splits + shared primitives (M6, M7, FR-V2-16, 26, 29).
2. §4.3 — KPI strip with new tiles (FR-V2-17, 18).
3. §4.4 — VolumeButterflyChart (FR-V2-20).
4. §4.5 — DiskTile (FR-V2-19).
5. §4.6 — RulePerformanceBar, StateStripBar, AccountHealthBanner (FR-V2-21, 22, 23).
6. §4.7 — Existing charts: time-window + discount token + refetch change (FR-V2-24, 25, 26).
7. §4.8 — 12-col grid final layout (FR-V2-27), IconBtn aria (FR-V2-28).
8. §4.9 — Polish (memoization, query tuning, contrast, copy) (FR-V2-53, 54, 55, 56, 58), L4/L6/L7.

### 4.2 Page splits + shared primitives

#### 4.2.1 SegmentedControl primitive (FR-V2-16)

- File: `web/src/components/ui/SegmentedControl.tsx`
  ```tsx
  export interface SegmentedControlProps<T extends string> {
    value: T;
    onChange: (v: T) => void;
    options: ReadonlyArray<{ value: T; label: string; ariaLabel?: string }>;
    size?: 'sm' | 'md';
    'aria-label'?: string;
  }
  export function SegmentedControl<T extends string>({ value, onChange, options, size='sm', ...rest }: SegmentedControlProps<T>) { /* role=radiogroup */ }
  ```
- Visual: rounded bg (`--surface-2`), active pill uses `--accent`, others `text-muted`. Height: 28px (sm) / 32px (md).
- Keyboard: arrow-left/right cycles.
- ARIA: `role="radiogroup"` with `role="radio"` children and `aria-checked`.

#### 4.2.2 discount.ts shared lib (FR-V2-26, M7)

- File: `web/src/lib/discount.ts`
  ```ts
  export const DISCOUNTS = ['FREE', '2X_FREE', '50PERCENT', '2X_50PERCENT', '2X', 'NORMAL'] as const;
  export type Discount = typeof DISCOUNTS[number];
  export function discountToken(d: Discount): string {
    return ({
      FREE:           'var(--discount-free)',
      '2X_FREE':      'var(--discount-2x-free)',
      '50PERCENT':    'var(--discount-50)',
      '2X_50PERCENT': 'var(--discount-2x-50)',
      '2X':           'var(--discount-2x)',
      NORMAL:         'var(--discount-normal)',
    } as const)[d];
  }
  export function discountLabel(d: Discount) { /* ... */ }
  ```
- Grep: every raw `#xxxxxx` in `DiscountBadge.tsx`, `GrabsChart.tsx`, `RulesPage.tsx` must be replaced. `PERCENT_30` literal must be removed.

#### 4.2.3 Page-split target structure

- `web/src/pages/DashboardPage.tsx` < 300 LoC: composes components; no rendering logic.
- `web/src/components/dashboard/`:
  - `AccountHealthBanner.tsx`
  - `KpiStrip.tsx` (composes `KpiTile.tsx`)
  - `KpiTile.tsx` (primitive — label, value, delta pill)
  - `SeedingTimeTile.tsx`
  - `DiskTile.tsx`
  - `StateStripBar.tsx`
  - `RulePerformanceBar.tsx`
  - `VolumeButterflyChart.tsx`
  - `SpeedCard.tsx` (extracted)
  - `RatioChart.tsx` (extracted)
  - `GrabsChart.tsx` (extracted)
  - `StatusTile.tsx` (extracted)
- `web/src/pages/RulesPage.tsx` < 300 LoC: similar split to `web/src/components/rules/{RulesList, RuleEditor, DryRunDrawer, ScheduleEditor (Phase 3), ImportExportBar (Phase 3)}`. (Former BacktestPanel removed with Phase 4.)

#### 4.2.4 KPI strip layout (FR-V2-17, 18)

- At `xl/2xl`: 9 tiles in a single row (fits given 12-col grid with each tile span ≈ 1.33 cols; use CSS grid `grid-template-columns: repeat(9, minmax(0, 1fr))` inside the strip container).
- At `lg`: 5 + 4 wrap (first row 5 tiles, second row 4 tiles). Tiles in order: RATIO, SEEDING TIME, SPEED, GRABS, UPLOADED | DOWNLOADED, BUFFER, DISK, STATUS.
- At `md/sm`: 2-col stack.
- Label text: uppercase, letter-spacing-wide. Value: 20px, tabular-nums. Delta pill: 11px, bg=soft accent.
- Source: HANDOFF §B.2, REVIEW §3.7.

### 4.3 KPI tiles (new)

- `UPLOADED` tile: value from `uploaded_bytes_total`, delta pill from `uploaded_bytes_delta_24h`. Format: `formatBytes(value)` with GiB/TiB switch.
- `DOWNLOADED` tile: same pattern against downloaded_* fields.
- `SEEDING TIME` tile: `value = formatDurationShort(seedtime_sec)` → e.g. `124d 6h`. Delta pill: if `seedtime_sec_delta_24h` is null or 0, show `—`; else `+${d}d ${h}h`.
- All three read from `DashboardSummary`; no new endpoint.

### 4.4 VolumeButterflyChart (FR-V2-20)

- File: `web/src/components/dashboard/VolumeButterflyChart.tsx`
- Uses recharts `<BarChart>` with two series rendered symmetrically: Uploaded bars (positive y, accent color) and Downloaded bars (negative y, accent-warn color); x-axis is `day`.
- Technique: pass the dataset with `uploaded_delta` unchanged and `downloaded_delta` negated; use `<YAxis tickFormatter={v => formatBytes(Math.abs(v))}>`.
- SegmentedControl at top-right: `7d | 14d | 30d | 90d` (default 14d). Value stored in component state; query key is `['profile-volume', days]`.
- Query hook:
  ```ts
  useQuery({ queryKey: ['profile-volume', days], queryFn: () => api.get(`/api/stats/profile-volume?days=${days}`), staleTime: 5*60*1000 });
  ```
- Edge: row[0]'s delta may equal total (see §3.10 note) — render that bar with 30% opacity and tooltip text `"First day — LAG baseline missing"`.
- Tooltip: show `Up: X GiB | Down: Y GiB | Ratio: X/Y`.
- Memo: `useMemo(() => data.map(r => ({...r, downloaded_delta: -r.downloaded_delta})), [data])`.
- Source: HANDOFF §B.4.4, REVIEW §4.4.

### 4.5 DiskTile (FR-V2-19 frontend)

- File: `web/src/components/dashboard/DiskTile.tsx`
- Renders two stacked bars:
  - Top bar: full-disk utilization — `usedGib / totalGib`. Color bands: < 70% green, 70–85% amber, > 85% red.
  - Bottom bar: Harvester share — `harvesterBytes / totalBytes`. (`harvesterBytes` = sum of `content_size` for torrents this client manages; backend field added to summary OR computed in a new `/api/stats/disk-share` endpoint. Decision: add to `DashboardSummary.harvester_bytes_total` computed as `SELECT COALESCE(SUM(content_size),0) FROM torrents WHERE managed_by='harvester'` — fits existing schema. If no `managed_by` column, fallback: total across all torrents in DB and label "All torrents".)
- Below the two bars: `free: 312 GiB • total: 1 TiB`.
- Source: HANDOFF §B.4.3, REVIEW §3.3.

### 4.6 RulePerformanceBar, StateStripBar, AccountHealthBanner

#### RulePerformanceBar (FR-V2-21)

- File: `web/src/components/dashboard/RulePerformanceBar.tsx`.
- Queries existing `/api/stats/ruleset-performance`.
- Renders a horizontal stacked bar: one segment per rule-set, width = `grabs_7d / total_grabs`, color from a deterministic hash of rule-set id.
- Clickable segments → `navigate('/rules#id=' + segment.rule_set_id)`.
- Legend below chip-style with count + percent.
- Source: HANDOFF §B.4.5, REVIEW §3.5.

#### StateStripBar (FR-V2-22)

- File: `web/src/components/dashboard/StateStripBar.tsx`.
- Queries existing `/api/stats/torrent-states`.
- Single horizontal bar split into: seeding (green), downloading (blue), queued (gray), stalled (amber), paused (neutral), error (red).
- Sits between the KPI strip and the chart grid. Height ~24px.
- Hover → tooltip with state name + count + percent.
- Source: HANDOFF §B.4.6, REVIEW §3.11.

#### AccountHealthBanner (FR-V2-23)

- File: `web/src/components/dashboard/AccountHealthBanner.tsx`.
- Props: `{ warned, leech_warn, vip, lastSnapshotTs }`.
- Renders ONLY when `warned === 1 || leech_warn === 1`. Above the KPI strip.
- Severity: `warned` → red, `leech_warn` → amber.
- Copy: `"M-Team account WARNED — grab loop paused until resolved. Log in to M-Team and review account status."` (warned) / `"Leech-ratio warning on M-Team — resolve before further grabs."` (leech_warn).
- Dismiss button → stores `(hashKey, snapshotTs)` in zustand store `web/src/stores/dismissedBanners.ts`. Reappears if the condition reoccurs with a newer `lastSnapshotTs`.
- **Decision: do NOT auto-pause the service** based on warned. Banner is advisory. (If product wants enforcement, a future FR can elevate this.)
- Source: HANDOFF §B.4.7, REVIEW §3.6.

### 4.7 Existing-chart updates

- **SpeedCard** (FR-V2-25, FR-V2-16):
  - Extract to `web/src/components/dashboard/SpeedCard.tsx`.
  - Replace inline linear/log toggle with `<SegmentedControl options={[{value:'lin',label:'Linear'},{value:'log',label:'Log'}]} />`.
  - Query `refetchInterval` → 60_000 (was 10_000). Add `staleTime: 55_000`.
- **RatioChart** (FR-V2-24):
  - SegmentedControl `1h | 24h | 7d | 30d`. `1h` default retained.
  - Hoist `window` into component state; TanStack key = `['ratio-over-time', window]`.
- **GrabsChart** (FR-V2-24, FR-V2-26):
  - SegmentedControl `7d | 14d | 30d | 90d`. Default 30d.
  - Series color → `discountToken(discount)`.
  - Hoist `window`.
- **DiscountBadge** (FR-V2-26):
  - Remove raw hex. Use `discountToken(discount)` for bg.
  - Remove `PERCENT_30` references anywhere.
- Source: HANDOFF §B.4.9, §B.4.10, REVIEW §3.2, §3.4, §3.9, TECH_DEBT M9, M7.

### 4.8 12-col grid + IconBtn

- Layout decision (post-component-in-place):
  ```
  Row 0: AccountHealthBanner (conditional, col-span 12)
  Row 1: KpiStrip (col-span 12, inner grid)
  Row 2: StateStripBar (col-span 12)
  Row 3: SpeedCard (col-span 8) | DiskTile (col-span 4)
  Row 4: GrabsChart (col-span 8) | RatioChart (col-span 4)
  Row 5: VolumeButterflyChart (col-span 8) | RulePerformanceBar (col-span 4)
  Row 6: DownloadsTable (col-span 12)
  ```
  — at `md` collapses to 6-col; at `sm` single column (cards stack).
- `DashboardPage.tsx` uses Tailwind `grid grid-cols-12 gap-4`.
- `IconBtn` (in DownloadsTable rows) adds `aria-label={title}`.
- Source: HANDOFF §B.2, §B.10.

### 4.9 Polish

- **FR-V2-53 memoize:** every recharts chart wraps `data`, `gradientId`, and gradient elements in `useMemo([data])`.
- **FR-V2-54 query tuning:**
  - Every query sets `staleTime` ≈ `refetchInterval`.
  - Global `QueryClient` config: `defaultOptions: { queries: { structuralSharing: true, retry: 2 }}`.
  - Where `StrictMode` is in effect: `useEffect(() => { const c = new AbortController(); fetchX({signal:c.signal}); return () => c.abort(); }, [])`.
- **FR-V2-55 contrast:** Update `web/src/styles/tokens.css` — bump `--text-muted` to `#a1a1aa` (dark) / `#52525b` (light). Audit discount tokens against the surface background; if any combo < 4.5:1 (use `--bg-0`), add `text-shadow: 0 0 1px rgba(0,0,0,0.5)` or darken the token.
- **FR-V2-56 recovery copy:** empty-state components add one sentence, e.g. `"No grabs yet. Add a rule-set in /rules and the poller will start matching."`.
- **FR-V2-57 deferred:** Phase 3 (EventSource reconnect).
- **FR-V2-58 bulk toast:** map `results: Array<{id, ok, error?}>` into per-item status; show aggregate + `n failed` with expand.
- **L4:** `grep 'useEffect' web/src | wc` audit — any empty-deps effects with no cleanup and no tool use should be removed. Typical candidates: logging effects that duplicate on StrictMode.
- **L6:** already covered by FR-V2-58.
- **L7:** Monaco a11y: ensure `monacoEditor.updateOptions({ ariaLabel: 'Rule set JSON editor' })`.

### 4.10 Phase 2 verification checklist

- [ ] DashboardPage.tsx < 300 LoC (verify: `wc -l web/src/pages/DashboardPage.tsx`).
- [ ] RulesPage.tsx < 300 LoC.
- [ ] `rg '#[0-9a-f]{6}' web/src/components/dashboard` returns no hex literals inside component bodies (allowed only in `tokens.css`).
- [ ] All 9 KPI tiles render with correct values on a primed account; on a cold DB they show `—`.
- [ ] DiskTile renders both bars; crossing 85% full turns the top bar red.
- [ ] VolumeButterflyChart: window switcher changes days; first-day bar is rendered at reduced opacity; tooltip shows up/down/ratio.
- [ ] RulePerformanceBar: click a segment → URL becomes `/rules#id=<id>`.
- [ ] StateStripBar renders; hovering a segment shows tooltip.
- [ ] Force `profile_snapshots.warned = 1` via sqlite3 CLI → AccountHealthBanner appears on next summary refetch; dismiss hides it; DB flip back to 0 and forward → banner reappears once a newer ts appears.
- [ ] Lighthouse a11y ≥ 90 on /dashboard and /rules.
- [ ] Axe Chrome extension shows zero critical issues.
- [ ] `PERCENT_30` no longer appears anywhere (rg).
- [ ] Light ↔ dark theme parity: visual spot check on all new widgets.

---

## 5. Phase 3 — Auth Hardening + UX Features

**Goal:** Security closure + high-value brainstorm features. ~3 ideal days.

**Covers:** FR-V2-13, 14, 15, 39–49, 57, 62, 63.

### 5.1 Work order

1. §5.2 — CSP header + token relocation (FR-V2-13).
2. §5.3 — CSRF double-submit (FR-V2-14).
3. §5.4 — useFocusTrap for modals (FR-V2-15).
4. §5.5 — SSE reconnect backoff (FR-V2-57).
5. §5.6 — Batched SQLite log sink (FR-V2-62).
6. §5.7 — (optional) stats_daily prune (FR-V2-63).
7. §5.8 — Why-skipped panel (FR-V2-39, 40).
8. §5.9 — Schedule editor (FR-V2-41, 42).
9. §5.10 — Webhooks (FR-V2-43, 44, 45).
10. §5.11 — Rule import/export (FR-V2-46, 47).
11. §5.12 — Prometheus exposition (FR-V2-48, 49).

### 5.2 CSP + token relocation (FR-V2-13)

- Add to `src/http/server.ts` (reply.header for every response or a global hook):
  ```ts
  server.addHook('onSend', (req, reply, payload, done) => {
    reply.header('Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'");
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    done(null, payload);
  });
  ```
- Monaco risk: Monaco may use web-workers/blob URLs. Options (decide in implementation):
  - **Self-host Monaco as an ESM bundle** via `@monaco-editor/react` loader pointing to `/static/monaco/`. CSP stays `'self'`.
  - Alternative: `script-src 'self' blob:; worker-src 'self' blob:` — document the concession in ADR-054.
- **Token relocation:**
  - Backend: add `POST /api/auth/refresh` that accepts a long-lived refresh token (httpOnly cookie, 7-day expiry) and returns a short-lived (15 min) access token as JSON.
  - `POST /api/auth/login` sets `refresh_token` as `HttpOnly; Secure=false (dev) / Secure=true (prod); SameSite=Strict; Path=/api/auth; Max-Age=604800` cookie, returns `{access_token, expires_at}` in body.
  - `POST /api/auth/logout` clears the cookie and invalidates the refresh token server-side.
  - Store refresh tokens in a new SQLite table `auth_refresh_tokens (id TEXT PRIMARY KEY, hash TEXT NOT NULL, user_id INT, created_at INT, expires_at INT, revoked_at INT)`; migration `0005_auth_refresh_tokens.sql`.
  - Frontend: `web/src/auth/tokenStore.ts` holds access token in a module-level variable + exposes `getAccessToken()`. On 401, calls `/api/auth/refresh`; if that 401s, redirects to login.
  - Remove `localStorage.setItem('auth_token', …)`.

### 5.3 CSRF double-submit (FR-V2-14)

- On login response, set a non-HttpOnly cookie `csrf = <random32>` (readable by JS).
- Frontend sets `X-CSRF-Token: <value>` on every mutating request.
- Backend middleware `src/http/middleware/csrf.ts`: for mutating methods, assert `req.headers['x-csrf-token'] === req.cookies.csrf`; 403 on miss.
- Exempt `POST /api/auth/login` and `POST /api/auth/refresh`.

### 5.4 useFocusTrap (FR-V2-15)

- New hook: `web/src/hooks/useFocusTrap.ts`:
  ```ts
  export function useFocusTrap(containerRef: React.RefObject<HTMLElement>, active: boolean, onEscape: () => void) {
    useEffect(() => {
      if (!active) return;
      const previous = document.activeElement as HTMLElement | null;
      const c = containerRef.current; if (!c) return;
      const tabbables = () => Array.from(c.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
      (tabbables()[0] ?? c).focus();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); onEscape(); return; }
        if (e.key !== 'Tab') return;
        const list = tabbables();
        if (list.length === 0) { e.preventDefault(); return; }
        const first = list[0], last = list[list.length-1];
        if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
      };
      document.addEventListener('keydown', onKey);
      return () => { document.removeEventListener('keydown', onKey); previous?.focus?.(); };
    }, [active, onEscape, containerRef]);
  }
  ```
- Apply in: `LoginModal`, `TorrentDetailsDrawer`, `DryRunDrawer`, `ImportFileDialog` (Phase 3).

### 5.5 EventSource reconnect (FR-V2-57)

- Replace `new EventSource(url)` direct usage with `web/src/lib/reconnectingEventSource.ts`:
  ```ts
  export function reconnectingEventSource(getUrl: () => Promise<string>, onEvent: (ev: MessageEvent) => void) {
    let es: EventSource | null = null; let attempt = 0; let killed = false;
    async function connect() {
      if (killed) return;
      const url = await getUrl(); // fetches fresh ticket
      es = new EventSource(url);
      es.onopen = () => { attempt = 0; };
      es.onmessage = onEvent;
      es.onerror = () => {
        es?.close();
        if (killed) return;
        const delay = Math.min(30_000, (2 ** attempt) * 500) + Math.floor(Math.random() * 500);
        attempt++;
        setTimeout(connect, delay);
      };
    }
    connect();
    return () => { killed = true; es?.close(); };
  }
  ```
- Rewire `useServiceEvents` and `useLogStream` to this.

### 5.6 Batched SQLite log sink (FR-V2-62)

- Edit `src/logging/sink-sqlite.ts`:
  ```ts
  const buf: LogRow[] = [];
  let flushTimer: NodeJS.Timeout | null = null;
  let droppedCount = 0;
  const MAX = 5000;
  function schedule() {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, 250);
    flushTimer.unref?.();
  }
  function flush() {
    flushTimer = null;
    if (buf.length === 0) return;
    const slice = buf.splice(0, buf.length);
    db.transaction(() => {
      const stmt = db.prepare(`INSERT INTO logs(ts, level, msg, fields) VALUES (?, ?, ?, ?)`);
      for (const row of slice) stmt.run(row.ts, row.level, row.msg, row.fields);
    })();
  }
  export function writeLog(row: LogRow) {
    if (buf.length >= MAX) { droppedCount++; metrics.counter('log.dropped').inc(); return; }
    buf.push(row);
    if (buf.length >= 100) flush();
    else schedule();
  }
  ```
- On process `beforeExit`: flush remaining buffer.

### 5.7 stats_daily prune (FR-V2-63, optional)

- New monthly job in `src/workers/rollup.ts`: delete `stats_daily` rows with `day < date('now','-2 years')`. Run once/month; idempotent.

### 5.8 Why-skipped panel (FR-V2-39, 40)

- Backend: extend `GET /api/torrents/:id` (or add `GET /api/torrents/:id/events`):
  - Query: `SELECT seen_at, type, rejection_reason, matched_rule_set, unmatched_rule_set FROM torrent_events WHERE infohash=? OR mteam_id=? ORDER BY seen_at DESC LIMIT 5`.
  - Return `{ events: [...] }`.
- Frontend: `web/src/components/torrents/TorrentDetailsDrawer.tsx`:
  - Panel: "Why skipped?"
  - Map rejection reason codes to human copy via `web/src/lib/rejectionReasons.ts`:
    ```ts
    export const REJECTION_REASONS: Record<string, (m: {ruleName?: string}) => string> = {
      min_seeders_not_met: ({ruleName}) => `Below min seeders threshold (rule: ${ruleName ?? '-'})`,
      max_size_exceeded:   ({ruleName}) => `Exceeds max size (rule: ${ruleName ?? '-'})`,
      schedule_inactive:   ({ruleName}) => `Outside schedule window (rule: ${ruleName ?? '-'})`,
      ratio_below_target:  ({ruleName}) => `Ratio below target (rule: ${ruleName ?? '-'})`,
      not_freeleech:       () => 'Not FREE or 2X_FREE',
      disk_low:            () => 'Disk free below reserve threshold',
      // ...
    };
    ```
  - Keys must be kept in sync with `src/rules/evaluator.ts`; add a unit test that enumerates evaluator codes and asserts the lookup map has each key.
- Performance: relies on partial index from FR-V2-04.

### 5.9 Schedule editor UI (FR-V2-41, 42)

- New file: `web/src/components/rules/ScheduleEditor.tsx`.
- Shape consumed: `Schedule = { always?: true } | { windows: Array<{ days: number[]; start: 'HH:mm'; end: 'HH:mm' }> }` — matches `src/util/time.ts::isScheduleActive`.
- UI: a toggle "Always active" at top. When off: a grid of weekday rows with "Add window" button per row; each window renders two `<input type="time">`; delete per window.
- Serialization: validate that no window overlaps itself; backend re-validates via zod schema.
- Wire into RulesPage editor as an accordion under existing rule form.

### 5.10 Webhook notifications (FR-V2-43, 44, 45)

- New settings panel: `web/src/components/settings/WebhooksPanel.tsx`.
  - Table: category (7 rows), URL input, test-fire button.
  - Categories: same as toast categories (list in `src/events/toast-categories.ts`): `grab_success, grab_failure, service_paused, service_resumed, account_warned, migration_error, preflight_failed`.
- Config:
  - Extend `config.ts` schema: `webhooks: Record<Category, { url: string; kind: 'discord' | 'telegram' | 'ntfy' }[]>` (zod).
- Backend:
  - New file `src/webhooks/dispatcher.ts`:
    ```ts
    bus.on('*', async (evt) => {
      const category = mapEventToCategory(evt);
      if (!category) return;
      const targets = config.webhooks[category] ?? [];
      for (const target of targets) {
        try {
          const body = formatPayload(target.kind, evt);
          await fetchWithTimeout(target.url, { method: 'POST', body, headers: {'Content-Type':'application/json'}, totalTimeoutMs: 10_000 });
        } catch (e) {
          // retry with backoff, max 3 attempts
          await retry(() => fetchWithTimeout(target.url, {...}), { attempts: 3 });
          log.warn({ category, url_host: new URL(target.url).host, err: e }, 'webhook_failed');
          metrics.counter('webhook.dispatch_failed', { category }).inc();
        }
      }
    });
    ```
  - Payload formatters per kind (`formatDiscord`, `formatTelegram`, `formatNtfy`).
  - Dispatch is best-effort: event handler MUST NOT await unrelated webhook completion; wrap in `setImmediate(async () => {...})`.
- Security: document that webhook URLs grant write access to their destination. Config is `0o600`.

### 5.11 Rule-set import/export (FR-V2-46, 47)

- Frontend: `web/src/components/rules/ImportExportBar.tsx`:
  - "Export" button → fetches `GET /api/rules/export` (returns `{ rule_sets: [...] }` as JSON), triggers download via `Blob`.
  - "Import" → `<input type="file" accept="application/json">` → POST body to `/api/rules/import`.
- Backend:
  - `GET /api/rules/export`: `SELECT * FROM rule_sets ORDER BY id;` → serialize to canonical JSON (same shape Monaco uses).
  - `POST /api/rules/import`: zod-validate the top-level `{rule_sets: RuleSet[]}`; on success, upsert by `name` (or `id` if stable). Return summary `{imported, updated, skipped}`.
- Conflict policy: match on `name`; if name exists, update. Wrap in a single transaction.

### 5.12 Prometheus exposition (FR-V2-48, 49)

- Edit `src/observability/metrics.ts` (existing Counter / Gauge / Histogram primitives):
  - Add `toPrometheus(): string` per primitive.
  - Naming: snake_case, `harvester_` prefix. Label set must be small (< 8 cardinality on any label).
- `src/http/routes/metrics.ts`:
  ```ts
  server.get('/api/metrics', { preHandler: requireAuth }, async (req, reply) => {
    const accept = req.headers.accept ?? '';
    if (/text\/plain/.test(accept)) {
      const lines = [...registry.all().map(m => m.toPrometheus())];
      reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      return lines.join('\n') + '\n';
    }
    return reply.send({ ok: true, data: registry.snapshot() });
  });
  ```
- Exposition rules: `TYPE counter|gauge|histogram`; `HELP` optional but preferred; histograms emit `_bucket{le="…"}`, `_sum`, `_count`.
- Validate locally: `curl -H 'Accept: text/plain; version=0.0.4' /api/metrics | promtool check metrics` → no errors.

### 5.13 Phase 3 verification checklist

- [ ] Browser devtools: every response has `Content-Security-Policy` header; console shows no CSP violations on `/dashboard` and `/rules`.
- [ ] `localStorage.getItem('auth_token')` → null at all times.
- [ ] Refresh page: `GET /api/auth/refresh` fires; access token restored; user not logged out.
- [ ] Logout clears cookie; `POST /api/rules` with stale CSRF returns 403.
- [ ] Tab + Shift-Tab cycles within each modal; Esc closes; focus returns to opener.
- [ ] Disconnect network → EventSource reconnects with exponential delay ≤ 30 s, observable in devtools network tab.
- [ ] Stress-test: emit 10k log lines in a burst → DB batches in chunks; `log.dropped` counter stays zero under normal load, >0 under deliberate stress.
- [ ] Force `warned=1` then trigger snapshot → webhook for `account_warned` fires (test with `https://webhook.site`).
- [ ] Schedule editor: set Mon–Fri 09:00–17:00 window; save; evaluator skips a torrent outside window with `schedule_inactive` reason; why-skipped panel shows the human copy.
- [ ] Export → Import round-trip yields identical rule-sets (diff is zero).
- [ ] `curl -H 'Accept: text/plain; version=0.0.4' /api/metrics | promtool check metrics` → passes.
- [ ] `stats_daily` prune: insert synthetic row with `day < now - 2y`; run monthly job; row deleted.

---

## 6. Phase 4 — REMOVED FROM V2

Backtest / replay mode (former FR-V2-50, FR-V2-51, FR-V2-52) is **not in v2 scope**. Per user decision, v2 is feature-complete at the end of Phase 3.

Implementation notes that were planned for this phase (backtest endpoint, panel, evaluator reuse pattern) are archived from an earlier revision of this document. Do NOT:

- Create `src/rules/backtest.ts`.
- Create `web/src/components/rules/BacktestPanel.tsx`.
- Add `POST /api/rules/backtest` route.
- Implement ADR-055 (that ADR is also removed; see §7).

Do:

- Still extract `evaluateTorrent()` as a pure function if Phase 1 work touches `src/rules/evaluator.ts` — it is good hygiene regardless of backtest. But do NOT build a second caller for it.
- Preserve the `torrent_events` indexes (FR-V2-04) since they benefit `why-skipped` (FR-V2-39, Phase 3).

If backtest is revived post-v2, allocate new FR-V2-* IDs past the current ceiling; do not reuse FR-V2-50/51/52.

---

## 7. New ADRs (v2 additions)

Append to `old/ARCHITECTURE.md` ADR sequence. Numbering assumes last v1 ADR is 051.

### ADR-052 — SSE auth via short-lived one-shot ticket

- Context: bearer-in-querystring is the EventSource-friendly pattern but leaks via access logs and Referer.
- Decision: short-lived (60 s) opaque ticket, consumed once, minted by an authenticated HTTP call. SSE URL carries `?ticket=…` and nothing else.
- Consequence: one extra round-trip at SSE open; no bearer in logs. Tickets are in-memory (non-persistent) → process restart invalidates all; client reconnect path transparently re-mints.
- Alternatives considered: WebSocket with subprotocol auth (too heavy); event-id cookie (introduces CSRF + cross-SSE-tab state) — rejected.

### ADR-053 — `service_state` split into `desired` vs `system`

- Context: a single enum conflated user intent with operational status, so a preflight failure on boot after `pause` would overwrite the user's intent and silently resume on next boot.
- Decision: two fields. `desired` is user intent; `system` is current reality. Worker start gate reads `desired`; UI renders both.
- Consequence: small migration; UI banner can render "Paused (user) — system preflight_failed" simultaneously.
- Alternatives considered: event-sourced state table (overkill for two booleans).

### ADR-054 — CSP and Monaco coexistence

- Context: strict `script-src 'self'` breaks Monaco (which uses blob workers).
- Decision: self-host Monaco as ESM bundle; keep `'self'` only. If that turns out to be too invasive, relax to `script-src 'self'; worker-src 'self' blob:` and document.
- Consequence: bundle size up ~2 MB; no CDN on cold load.

### ADR-055 — REMOVED

Originally "Backtest reuses live evaluator". Removed with Phase 4 cut. ADR number reserved; do not reuse.

### ADR-056 — Per-day volume via LAG over per-day-max snapshot

- Context: M-Team `uploaded_bytes` is monotonically increasing; qBt `session_uploaded` resets every session.
- Decision: treat M-Team's cumulative counter as canonical; day delta = `MAX(per-day) - LAG(MAX(per-day))`. First day of series is inherently inaccurate (no LAG baseline) → clients render faded.
- Consequence: historical `stats_daily.{uploaded,downloaded}_bytes` rows from before migration are incorrect; documented as "chart from cutover forward".

### ADR-057 — Access tokens in memory, refresh in HttpOnly cookie

- Context: `localStorage` is XSS-readable.
- Decision: short-lived access token in JS module variable + longer-lived refresh token in `HttpOnly; SameSite=Strict` cookie scoped to `/api/auth`.
- Consequence: page refresh triggers one `/api/auth/refresh` round-trip; XSS cannot exfiltrate the refresh token. CSRF double-submit protects mutating routes.

---

## 8. Migration Scripts

### 8.1 `db/migrations/0003_profile_snapshot_extras.sql`

```sql
BEGIN TRANSACTION;

ALTER TABLE profile_snapshots ADD COLUMN warned         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile_snapshots ADD COLUMN leech_warn     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile_snapshots ADD COLUMN vip            INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile_snapshots ADD COLUMN seedtime_sec   INTEGER;
ALTER TABLE profile_snapshots ADD COLUMN leechtime_sec  INTEGER;

-- Indexes that were staged in Phase 0 0003a_indexes (consolidate here for the single-migration story):
CREATE INDEX IF NOT EXISTS idx_torrent_events_infohash
  ON torrent_events(infohash) WHERE infohash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_torrent_events_mteam_seen
  ON torrent_events(mteam_id, seen_at DESC);

COMMIT;
```

### 8.2 `db/migrations/0004_service_state_user_intent.sql`

```sql
BEGIN TRANSACTION;

-- Add desired column with sane default derived from existing state
ALTER TABLE service_state ADD COLUMN desired TEXT NOT NULL DEFAULT 'running';
UPDATE service_state SET desired = CASE WHEN state = 'paused' THEN 'paused' ELSE 'running' END;

-- Rename state → system (requires SQLite >= 3.25). If unavailable, use table rebuild:
-- CREATE TABLE service_state__new (...); INSERT INTO service_state__new SELECT ...; DROP; RENAME.
ALTER TABLE service_state RENAME COLUMN state TO system;

COMMIT;
```

### 8.3 `db/migrations/0005_auth_refresh_tokens.sql`

```sql
BEGIN TRANSACTION;

CREATE TABLE auth_refresh_tokens (
  id          TEXT PRIMARY KEY,
  hash        TEXT NOT NULL,
  user_id     INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  revoked_at  INTEGER,
  user_agent  TEXT
);
CREATE INDEX idx_auth_refresh_user ON auth_refresh_tokens(user_id);
CREATE INDEX idx_auth_refresh_expires ON auth_refresh_tokens(expires_at);

COMMIT;
```

### 8.4 Migration ordering

1. `0001_initial.sql` (v1)
2. `0002_ruleset_perf.sql` (v1)
3. `0003_profile_snapshot_extras.sql` (v2 Phase 0+1)
4. `0004_service_state_user_intent.sql` (v2 Phase 0)
5. `0005_auth_refresh_tokens.sql` (v2 Phase 3)

Recommendation: ship `0003` and `0004` together in the Phase 0 boundary even though `0003` contains columns the backend doesn't yet read (fields populated in Phase 1). Rationale: smaller migration count + avoids a migration release in the middle of each phase.

---

## 9. Cross-References

### 9.1 Source document → target section

- `old/TECH_DEBT.md` C1, H7 → §2.4
- `old/TECH_DEBT.md` C2 → §2.7
- `old/TECH_DEBT.md` C3 → §2.5
- `old/TECH_DEBT.md` H1, L3 → §3.2
- `old/TECH_DEBT.md` H2 → §3.3
- `old/TECH_DEBT.md` H3 → §3.4
- `old/TECH_DEBT.md` H4 → §2.2 + §3.6
- `old/TECH_DEBT.md` H5, M5 → §5.2, §5.3
- `old/TECH_DEBT.md` H6 → §3.5
- `old/TECH_DEBT.md` H8 → §5.4
- `old/TECH_DEBT.md` M1, M2, M3 → §3.12
- `old/TECH_DEBT.md` M4 → §2.6
- `old/TECH_DEBT.md` M6 → §4.2.3
- `old/TECH_DEBT.md` M7 → §4.2.2
- `old/TECH_DEBT.md` M8 → §4.9 (FR-V2-53)
- `old/TECH_DEBT.md` M9 → §4.9 (FR-V2-54)
- `old/TECH_DEBT.md` M10 → §3.9
- `old/TECH_DEBT.md` M11 → §2.3
- `old/TECH_DEBT.md` M12 → §5.7
- `old/TECH_DEBT.md` M13 → §5.6
- `old/TECH_DEBT.md` M14 → §4.9 (FR-V2-55)
- `old/TECH_DEBT.md` M15 → §4.8
- `old/TECH_DEBT.md` M16 → §4.9 (FR-V2-56)
- `old/TECH_DEBT.md` L1, L8 → §3.14
- `old/TECH_DEBT.md` L4, L6, L7 → §4.9
- `old/TECH_DEBT.md` L5 → §5.5
- `old/DASHBOARD_UI_HANDOFF.md` §B.2 → §4.8
- `old/DASHBOARD_UI_HANDOFF.md` §B.4.1 → §4.2.1
- `old/DASHBOARD_UI_HANDOFF.md` §B.4.2 → §4.3
- `old/DASHBOARD_UI_HANDOFF.md` §B.4.3 → §4.5 + §3.8
- `old/DASHBOARD_UI_HANDOFF.md` §B.4.4 → §4.4
- `old/DASHBOARD_UI_HANDOFF.md` §B.4.5 → §4.6 (RulePerformanceBar)
- `old/DASHBOARD_UI_HANDOFF.md` §B.4.6 → §4.6 (StateStripBar)
- `old/DASHBOARD_UI_HANDOFF.md` §B.4.7 → §4.6 (AccountHealthBanner)
- `old/DASHBOARD_UI_HANDOFF.md` §B.4.8 → DROPPED
- `old/DASHBOARD_UI_HANDOFF.md` §B.4.9 → §4.7
- `old/DASHBOARD_UI_HANDOFF.md` §B.4.10 → §4.7 (DiscountBadge) + §4.2.2
- `old/DASHBOARD_UI_HANDOFF.md` §B.10 → §4.8
- `old/DASHBOARD_UI_HANDOFF.md` §B.12 → §3.6 + §3.7 + §3.9
- `old/DASHBOARD_REVIEW.md` §3.2 → §4.7 (SpeedCard 60s)
- `old/DASHBOARD_REVIEW.md` §3.3 → §3.8 + §4.5
- `old/DASHBOARD_REVIEW.md` §3.4 → §4.7 (Ratio/GrabsChart)
- `old/DASHBOARD_REVIEW.md` §3.5 → §4.6
- `old/DASHBOARD_REVIEW.md` §3.6 → §3.7 + §4.6 (AccountHealthBanner)
- `old/DASHBOARD_REVIEW.md` §3.7 → §4.3 (SeedingTimeTile)
- `old/DASHBOARD_REVIEW.md` §3.9 → §4.2.2 + §4.7
- `old/DASHBOARD_REVIEW.md` §3.10 → §3.11
- `old/DASHBOARD_REVIEW.md` §3.11 → §4.6 (StateStripBar)
- `old/DASHBOARD_REVIEW.md` §4.2 → §3.9
- `old/DASHBOARD_REVIEW.md` §4.4 → §3.10 + §4.4
- `old/DASHBOARD_REVIEW.md` §6.1 → §3.7
- `old/STATUS.md` K1 → §3.13
- `old/STATUS.md` K4 → §2.8 + §3.6 (migration 0004)
- `old/STATUS.md` S1 → §5.9
- `old/STATUS.md` S9 → §5.12
- Brainstorm B1 → §2.8
- Brainstorm B2 → §5.8
- Brainstorm B3 → *(removed with Phase 4)*
- Brainstorm B4 → §5.10
- Brainstorm B5 → §5.12
- Brainstorm B6 → §5.11

### 9.2 PRD FR-V2 → target section

- FR-V2-01 → §2.5
- FR-V2-02 → §2.4
- FR-V2-03, 36, 37, 38 → §2.8
- FR-V2-04 → §2.2 + §3.6
- FR-V2-05 → §2.3
- FR-V2-06 → §2.6
- FR-V2-07, 08 → §2.7
- FR-V2-09 → §3.2
- FR-V2-10 → §3.3
- FR-V2-11 → §3.4
- FR-V2-12 → §3.5
- FR-V2-13 → §5.2
- FR-V2-14 → §5.3
- FR-V2-15 → §5.4
- FR-V2-16 → §4.2.1
- FR-V2-17 → §4.3
- FR-V2-18 → §4.3 (SeedingTimeTile)
- FR-V2-19 → §3.8 (backend) + §4.5 (frontend)
- FR-V2-20 → §4.4 + §3.10
- FR-V2-21 → §4.6
- FR-V2-22 → §4.6
- FR-V2-23 → §4.6
- FR-V2-24 → §4.7
- FR-V2-25 → §4.7 (SpeedCard)
- FR-V2-26 → §4.2.2 + §4.7
- FR-V2-27 → §4.8
- FR-V2-28 → §4.8
- FR-V2-29 → §4.2.3
- FR-V2-30 → §3.6 + §8.1
- FR-V2-31 → §3.7
- FR-V2-32 → §3.9
- FR-V2-33 → §3.10
- FR-V2-34 → §3.11
- FR-V2-35 → §3.9
- FR-V2-39, 40 → §5.8
- FR-V2-41, 42 → §5.9
- FR-V2-43, 44, 45 → §5.10
- FR-V2-46, 47 → §5.11
- FR-V2-48, 49 → §5.12
- FR-V2-50, 51, 52 → *(removed from v2 — Phase 4 cut; IDs reserved)*
- FR-V2-53 → §4.9
- FR-V2-54 → §4.9
- FR-V2-55 → §4.9
- FR-V2-56 → §4.9
- FR-V2-57 → §5.5
- FR-V2-58 → §4.9
- FR-V2-59 → §3.12
- FR-V2-60 → §3.12
- FR-V2-61 → §3.12
- FR-V2-62 → §5.6
- FR-V2-63 → §5.7
- FR-V2-64 → §3.13

### 9.3 Files touched (summary)

**New:**
- `src/util/fetchWithTimeout.ts`
- `src/http/routes/sse-ticket.ts`
- `src/http/routes/stats-profile-volume.ts`
- `src/http/middleware/csrf.ts`
- `src/webhooks/dispatcher.ts`
- `src/observability/prom.ts` (or extensions to `metrics.ts`)
- `src/migrations/rename-default-ruleset.ts`
- `db/migrations/0003_profile_snapshot_extras.sql`
- `db/migrations/0004_service_state_user_intent.sql`
- `db/migrations/0005_auth_refresh_tokens.sql`
- `web/src/components/ui/SegmentedControl.tsx`
- `web/src/lib/discount.ts`
- `web/src/lib/rejectionReasons.ts`
- `web/src/lib/reconnectingEventSource.ts`
- `web/src/hooks/useFocusTrap.ts`
- `web/src/auth/tokenStore.ts`
- `web/src/components/dashboard/{KpiStrip,KpiTile,SeedingTimeTile,DiskTile,VolumeButterflyChart,RulePerformanceBar,StateStripBar,AccountHealthBanner,SpeedCard,RatioChart,GrabsChart,StatusTile}.tsx`
- `web/src/components/rules/{RulesList,RuleEditor,DryRunDrawer,ScheduleEditor,ImportExportBar}.tsx`
- `web/src/components/settings/WebhooksPanel.tsx`
- `src/**/*.test.ts` (minimal suite)
- `vitest.config.ts`

**Modified:**
- `src/config/store.ts` (atomic write)
- `src/db/migrate.ts` (gap check)
- `src/http/server.ts` (bodyLimit, CSP hook, pino redact)
- `src/http/routes/service.ts` (pause/resume, SSE ticket consumer)
- `src/http/routes/logs.ts` (SSE ticket consumer)
- `src/http/routes/dashboard.ts` (DashboardSummary extensions)
- `src/http/routes/auth.ts` (refresh + logout, cookies)
- `src/http/routes/rules.ts` (zod, import/export)
- `src/http/routes/metrics.ts` (content-negotiation)
- `src/http/routes/torrents.ts` (events endpoint for why-skipped)
- `src/mteam/normalize.ts` (new fields)
- `src/workers/probe.ts` (write new columns)
- `src/workers/rollup.ts` (delta redefinition, prune job, TZ)
- `src/workers/downloader.ts` (fetchWithTimeout)
- `src/workers/manager.ts` (stagger)
- `src/qbt/client.ts` (fetchWithTimeout, single-flight login)
- `src/events/bus.ts` (MaxListeners)
- `src/util/retry.ts` (jitter)
- `src/util/time.ts` (may need a local-TZ helper export)
- `src/rules/evaluator.ts` (ensure pure-function export for testability + future reuse; backtest consumer itself is removed from v2)
- `src/logging/sink-sqlite.ts` (batched writes)
- `src/observability/metrics.ts` (prometheus export)
- `src/service/state.ts` (split desired/system)
- `src/service/boot.ts` (honor desired; rename migration)
- `shared/types.ts` (DashboardSummary, ServiceStatus, etc.)
- `web/src/pages/DashboardPage.tsx` (reduce to composition)
- `web/src/pages/RulesPage.tsx` (reduce to composition)
- `web/src/components/DiscountBadge.tsx` (tokens)
- `web/src/components/LoginModal.tsx` (focus trap)
- `web/src/components/torrents/TorrentDetailsDrawer.tsx` (why-skipped panel, focus trap)
- `web/src/hooks/{useServiceEvents,useLogStream}.ts` (ticket + reconnect)
- `web/src/styles/tokens.css` (contrast bumps, discount vars)

---

## 10. Appendix — Known open questions

- **A.1 Monaco + CSP:** final decision between self-host and `blob:` relaxation is deferred to Phase 3 implementation (ADR-054).
- **A.2 refresh-token TTL:** 7 days is the default; make configurable if user requests longer sessions.
- **A.3 Backtest upper bound:** removed (Phase 4 cut). If backtest is revived, target was 50k events → 2 s.
- **A.4 Webhook secret rotation:** out of scope for v2; webhook URLs are the only secret and live in config (0o600).
- **A.5 harvester_bytes_total computation:** depends on existence of `managed_by` field on `torrents`. If absent, implementation substitutes the sum of all tracked torrents and labels the DiskTile sub-bar accordingly. Confirm during §4.5.

---

## 11. References

- `PRD_V2_Update.md` — parent PRD.
- `old/PRD.md` — v1 baseline.
- `old/IMPLEMENTATION.md` — v1 build plan, file layout.
- `old/ARCHITECTURE.md` — v1 ADRs.
- `old/DASHBOARD_UI_HANDOFF.md` — component specs.
- `old/DASHBOARD_REVIEW.md` — dashboard rationale + SQL.
- `old/TECH_DEBT.md` — full audit (C1–L9).
- `old/STATUS.md` — what shipped in v1.
- `old/MTEAM_API.md` — API surface and field mappings.
- `old/UI_DESIGN.md` — design tokens.
