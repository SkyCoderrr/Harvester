# Harvester — Implementation Status & Delta

> **Doc ID:** STATUS.md
> **Version:** 1.0 (2026-04-19 session snapshot)
> **Purpose:** single source of truth for what's built today, how it differs from the plan in `IMPLEMENTATION.md`, and what's explicitly deferred.
> **Reading order:** skim §1 → read §2–§5 in the order of your concern.

---

## 1. Executive summary

| Phase | Spec scope | Current status |
|-------|------------|----------------|
| **Phase 0 — Spike** | Discover M-Team API shape, populate forbidden method list, measure Argon2 | ✅ **Complete.** See [`spike/SPIKE_REPORT.md`](../spike/SPIKE_REPORT.md). Live probes against production M-Team with the user's API key confirmed every field name, the UA trap, the genDlToken TTL behavior, and 2 missing discount enum values. |
| **Phase 1 — MVP** | Full backend + minimal UI, first-run wizard, grab loop, lifecycle | ✅ **Complete** end-to-end; verified live (15 torrents grabbed against real M-Team in the first poll cycle). Deviations in §3. |
| **Phase 2 — v1.0** | Schedule evaluator, dry-run, stats rollup, bulk actions, toasts, side drawer, Monaco editor, logs page | ✅ **Mostly complete.** Dry-run, stats rollup, bulk actions, toasts (with mute), side drawer, Monaco JSON editor, virtual-scroll logs with SSE tail all shipped. Schedule evaluator is implemented in `util/time.ts` but there's no UI; keyboard shortcuts and full test suite deferred. |
| **Phase 3 — v1.1** | LAN password auth + bind toggle | ✅ **Shipped.** argon2 + passwordPolicy + rateLimiter + verifyCache + Fastify preHandler, `/api/settings/lan-access`, `/api/service/restart`, LoginModal, PasswordStrengthMeter, LanFooterChip, Settings → Network with bind_host selector. Integration tests deferred. |
| **Beyond spec** | User-requested extensions | ✅ Transfer-speed sampling + stacked speed charts with log/linear toggle, dashboard KPI trend deltas, 4-bucket discount UI, file-ops log view with infohash cross-highlight, global CSS theme overrides for checkbox/number/select, `max_leechers` rule field, lifecycle timer counts from download-start. |

**Repo footprint today:** ~10.1k LoC across `src/` + `shared/` + `web/src/`; 34 HTTP endpoints; 2 migrations; 7 workers.

---

## 2. What shipped (by layer)

### 2.1 Backend

| Module | File(s) | Notes |
|--------|---------|-------|
| App paths / bootstrap | [`src/appPaths.ts`](../src/appPaths.ts), [`src/index.ts`](../src/index.ts) | Platform-aware `%APPDATA%` vs `~/.config`; graceful shutdown; `ensureWorkersStarted()` brings workers online after first-run without restart |
| Config | [`src/config/`](../src/config/) | Zod schema, atomic file write, reactive store; `bind_host` accepts any IPv4/IPv6 (relaxed from 2-value enum) |
| Errors | [`src/errors/index.ts`](../src/errors/index.ts) | 24 error codes + user-safe messages + HTTP-status map |
| DB | [`src/db/`](../src/db/) | WAL + migrations runner; 11 tables + `torrent_events_archive` + `transfer_snapshots` (added in 0002) |
| Logger | [`src/logger/`](../src/logger/) | pino + file-rotation + SQLite sink via `ProxyWritable` (see §3.1); secondary redactor replaces secrets substring-style |
| Event bus | [`src/events/bus.ts`](../src/events/bus.ts) | Typed domain events; every handler try/catch-wrapped |
| Metrics | [`src/observability/metrics.ts`](../src/observability/metrics.ts) | Counter/Gauge/Histogram; snapshot via `/api/metrics` |
| Util | [`src/util/`](../src/util/) | `iec`, `time` (incl. `isScheduleActive`), `normalize`, `disk`, `semver`, `regex`, `retry` |
| Rules | [`src/rules/`](../src/rules/) | Schema + evaluator + validate + migrate + defaults; schedule eval is live |
| M-Team client | [`src/mteam/client.ts`](../src/mteam/client.ts) | Raw fetch (no yeast.js), UA-forced, retries on `retryable` errors, envelope-aware error mapping |
| qBt client | [`src/qbt/client.ts`](../src/qbt/client.ts) | Cookie session + auto-reauth on 403; multipart `addTorrent`; new `getTransferInfo()` added |
| Services | [`src/services/`](../src/services/) | `serviceState` reducer with persistence; `preflight` with hard/soft failures |
| Auth | [`src/auth/`](../src/auth/) | argon2id, password policy (12+ chars, 3/4 classes, leet-aware denylist), per-IP sliding-window rate limit (localhost exempt), epoch-bumped verify cache |
| Workers | [`src/workers/`](../src/workers/) | 7 workers: poller, downloader, lifecycle, profileProbe, transferProbe, statsDailyRollup, emergencyMonitor, grabRetry |
| HTTP | [`src/http/`](../src/http/) | Fastify, 34 routes, SSE for `/service/events` + `/logs/stream`, auth preHandler scoped to `/api/*` (bypasses `/api/health` + `/api/first-run/*`) |

### 2.2 Frontend

`web/src/` — React 18 + Vite 5 + TanStack Query + Zustand + Tailwind 3 + recharts + @tanstack/react-virtual + @monaco-editor/react.

| Page / component | Notes |
|------------------|-------|
| `App.tsx` (sidebar, topbar, footer) | Manual refresh button (spinning `RefreshCw`), pause-grabs button with tooltip clarifying scope, LanFooterChip when LAN bound |
| `FirstRunPage` | 3-step wizard: M-Team test → qBt test → save path → complete |
| `DashboardPage` | KPI strip (6 tiles with delta pills), ratio/bonus area chart, stacked download/upload mini-charts with linear/log toggle, grabs-by-day stacked bar, tier card, downloads table |
| `TorrentsPage` | Bulk checkboxes + toolbar (pause/resume/remove-with-data), side drawer with M-Team payload + transitions, qBt-style row layout |
| `RulesPage` | Form/JSON toggle, Monaco JSON editor with schema validation, 4-bucket discount UI (FREE / 50% off / 30% off / NORMAL), size range + presets, swarm limits (min/max seeders + leechers), free-window hours, dry-run panel against last 200 events |
| `LogsPage` | Virtual-scroll (5000-row ring buffer), SSE live-tail, level chips, component dropdown, search, **File-ops** filter chip, infohash cross-highlight on hover, export-to-jsonl, expandable row detail |
| `SettingsPage` | M-Team info, qBt info, poller interval, lifecycle hours, **LAN access** (bind_host + password + strength meter), **Notifications** (7 categories with mute toggles) |
| `LoginModal` | Opens automatically on 401; persists token in localStorage |
| `ToastContainer` | 4 kinds (info/success/warn/error), inline "Mute {category}" button, auto-dismiss with level-tuned TTL |

### 2.3 Data layer

**Tables (migrations 0001 + 0002):**
- `torrent_events` — decision history (GRABBED / SKIPPED_* / RE_EVALUATED_* / ERROR)
- `rule_sets` + `rule_sets_archive` — rule versions
- `poll_runs` — per-poll run telemetry
- `grab_queue` — retry queue (pruned at 10 min)
- `logs` — structured log rows
- `stats_daily` — rolled-up daily KPIs
- `lifecycle_peer_state` — zero-peers tracking per infohash
- `profile_snapshots` — ratio + bonus time series (15 min samples)
- `service_state` — singleton row with current reducer state
- `transfer_snapshots` — global dl/up speed (60 s samples, 7-day retention; added by 0002)

### 2.4 HTTP endpoints

All under `/api`; `ApiResponse<T>` envelope.

```
GET  /health                          (no auth)
POST /first-run/status | save | complete   (no auth)
GET  /dashboard/summary
GET  /torrents | /torrents/:id
POST /torrents/:id/action | /torrents/bulk-action
GET  /rules | /rules/:id
POST /rules | /rules/validate | /rules/:id/dry-run
PUT  /rules/:id
DELETE /rules/:id
GET  /logs
GET  /logs/stream                     (SSE; accepts ?token= in LAN mode)
GET  /service/state | /service/events (SSE)
POST /service/pause | /service/resume | /service/restart
GET  /stats/profile-snapshots
GET  /stats/grabs-by-day
GET  /stats/torrent-states
GET  /stats/transfer-snapshots
GET  /stats/ruleset-performance
GET  /stats/daily
GET  /settings
PUT  /settings
POST /settings/test/mteam | /settings/test/qbt
POST /settings/lan-access | /settings/lan-access/disable
GET  /metrics
```

---

## 3. Deviations from the plan

These are all implementation-level; none changes the user-facing contract beyond what's noted.

### 3.1 Logger: `ProxyWritable` instead of construction-time sink registration

**Plan (IMPL §4.5):** Declare the SQLite sink at boot and pass it to `pino.multistream()`.
**Reality:** `pino.multistream` snapshots the streams array at construction. The DB isn't open until after migrations run, which require the logger — chicken-and-egg. My first attempt pushed to the array post-construction; pino ignored it, so the `logs` table was empty for the entire MVP phase.
**Fix:** `ProxyWritable` class registered at boot; `logger.attachDbSink(db, bus)` arms it after the DB + bus are ready. Tested — rows now populate as expected. Also wired `bus` through so SSE `/api/logs/stream` gets `log.entry` events.

### 3.2 Clients consume `ConfigStore`, not a frozen `AppConfig`

**Plan (IMPL §4.8, §4.9):** `createMTeamClient(config: AppConfig, …)` — frozen at boot.
**Reality:** Taking a frozen config meant first-run credential entry didn't propagate to the live client; `test/mteam` kept rejecting the just-saved key. Clients now take `ConfigStore` and re-read config on each call. Cheap (getter only) and eliminates the restart requirement after first-run.

### 3.3 Downloader fetches `.torrent` bytes itself

**Plan (IMPL §4.11 downloader):** Hand `urls: tokenUrl` to `qbt.torrents/add` and let qBittorrent fetch it.
**Reality:** qBittorrent's libtorrent URL fetcher hits the same UA-check trap `api.m-team.cc` uses against default curl (302 → `www.google.com`). About 4/15 grabs failed on the first live test with a qBt "add torrent failed" toast.
**Fix:** Harvester downloads the `.torrent` file with the configured UA, validates it's a bencoded dict (starts with `d`, length ≥ 64), and uploads the bytes via multipart. Same fix applied to `drainQueued`.

### 3.4 Grab-verify failure records `ERROR`, not silent `GRABBED`

**Plan:** Insert `torrent_events` row with `decision='GRABBED'` before verify; update infohash on verify success.
**Reality:** With the old flow, verify-failed torrents would be permanently stuck with `decision='GRABBED'` and `infohash=null`, and the poller would never retry them.
**Fix:** Only insert `GRABBED` after verify succeeds. On failure, insert a separate row with `decision='ERROR'` + `rejection_reason='grab_verify_failed'`. The poller's `canReEval` was widened to accept `ERROR` so the next poll retries.

### 3.5 Lifecycle timer counts from `qBt.added_on`, not `seeding_time`

**Plan (IMPL §4.11 lifecycle):** `seedSec = t.seeding_time ?? (now - first_seen_at)`.
**Reality:** qBt's `seeding_time` only ticks while a torrent is seeding. For a torrent that took 10h to download + 62h to seed, the old formula waited for 72h of *seeding* on top — up to 82h real time. User wanted the lifecycle to count total elapsed time since the torrent was added.
**Fix:** `lifeSec = now - (t.added_on || state.first_seen_at)`. The config field is still named `seed_time_hours` for back-compat, but the logic is now "total hours from add".

### 3.6 Discount UI exposes 4 buckets, not 7 raw enums

**Plan:** Pills for each of 7 discount values.
**Reality:** Economic grouping (user only cares about download cost; upload-boost variants are always a bonus) is clearer. UI buckets + backend mapping:

| UI bucket | Backend values |
|-----------|----------------|
| `FREE` | `FREE`, `_2X_FREE` |
| `50% off` | `PERCENT_50`, `_2X_PERCENT_50` |
| `30% off` | `PERCENT_70` |
| `NORMAL` | `NORMAL`, `_2X` |

Power users can still access any combination via the Monaco JSON editor.

### 3.7 Discount enum has 7 values, not 6

**Plan (IMPL §3.1):** 6 values (`FREE`, `_2X_FREE`, `_2X`, `PERCENT_50`, `PERCENT_30`, `NORMAL`).
**Reality (spike):** production OpenAPI exposes 7 (`NORMAL`, `PERCENT_70`, `PERCENT_50`, `FREE`, `_2X_FREE`, `_2X`, `_2X_PERCENT_50`). `PERCENT_30` doesn't exist. The codebase + shared types reflect the real 7.

### 3.8 `sortField` + `sortDirection`, not `sortBy`

**Plan:** `sortBy: 'createdDate desc'` — a single field.
**Reality:** Two separate fields per OpenAPI + live confirmation: `sortField: 'CREATED_DATE'` + `sortDirection: 'DESC'`.

### 3.9 `genDlToken` is time-bounded, not single-use

**Plan:** *"single-use with unknown TTL; consume immediately."*
**Reality (spike §7):** Returns a deterministic signed URL valid for ≤ 10 minutes. Identical URL is returned for repeat calls within the same clock-second. Fetching the URL multiple times within TTL works. Code treats it as refresh-on-need with a 10-minute safe upper bound.

### 3.10 `infoHash` is null in `/torrent/search` responses

**Plan (OQ-2, still open):** Use infohash from search if available.
**Reality (spike §8):** 0/50 rows had `infoHash` populated. System relies on qBt post-add lookup for the hash. OQ-2 closed.

### 3.11 Frontend API client: no `Content-Type` on empty bodies

**Plan:** Always send `Content-Type: application/json`.
**Reality:** Fastify's default JSON parser rejects `Content-Type: application/json` with an empty body as `FST_ERR_CTP_EMPTY_JSON_BODY`. The client omits the header when there's no body.

### 3.12 Workers auto-start after first-run without restart

**Plan (IMPL §4.1):** Workers start only if preflight succeeds at boot.
**Reality:** First-run completion runs preflight + starts workers in the same request, so the user doesn't need to restart the process after entering credentials.

### 3.13 `bind_host` accepts any IP

**Plan:** Enum `'127.0.0.1' | '0.0.0.0'`.
**Reality:** Relaxed to a valid-IPv4/IPv6 regex. The LAN-access settings UI has a text field that defaults to `0.0.0.0` and can be set to a specific NIC (e.g. `192.168.2.13`) for defense-in-depth. Refinement requires a password whenever `bind_host` isn't loopback (127.0.0.1 or ::1).

### 3.14 `max_leechers` rule field added

**Plan:** `min_leechers` + `leecher_seeder_ratio_min` only.
**Reality:** `max_leechers` added to schema + evaluator + UI for symmetry with `min/max_seeders`. `leecher_seeder_ratio_min` stays in the schema for back-compat but the UI no longer exposes it (user preference).

### 3.15 Dashboard evolved from spec

Per user feedback during the session:
- "Active torrents" donut + "Disk free" gauge → replaced by a **stacked download/upload area chart** and a **disk used/free KPI tile**. Active vs Stalled is now a 2-tile split in the strip, not a pie.
- KPI tiles gained **trend pills** (ratio/bonus delta 1h, grabs delta 24h) with colored arrows.
- **Manual refresh** button added to the TopBar.

### 3.16 `transfer_snapshots` + `transferProbe` worker (beyond spec)

Added to support the speed chart. 60-second sampling of `qBt /api/v2/transfer/info`. 7-day retention. Table created in migration 0002.

### 3.17 Logger wires `bus` into the SQLite sink

**Plan (§4.5):** SQLite sink is passive.
**Reality:** The sink emits `log.entry` domain events so the SSE `/api/logs/stream` endpoint can forward rows live. Without this, the virtual-scroll logs page has no way to tail.

---

## 4. What's explicitly deferred

### From Phase 2

| Item | Reason | Effort to complete |
|------|--------|-----|
| Schedule accordion UI in rule editor | Low frequency use; backend evaluator is live so JSON-editor users can use it today | 0.5 day |
| Keyboard shortcuts (`g d`, `g t`, `g r`, `g l`, `g s`, `/`, `?`) | Polish, not functional | 0.5 day |
| Full integration test suite (§9.2 of IMPL) | Would be ~1 week of Vitest work | 3–5 days |
| E2E tests (§9.3) — Playwright specs for first-run, kill-switch, dry-run, schedule | Depends on qBt fixture + stubbed M-Team | 2–3 days |
| Bench tests (§9.4) — evaluator throughput, poll cycle DB timing, argon2 | Not a hard requirement | 1 day |

### From Phase 3

| Item | Reason | Effort |
|------|--------|-----|
| Integration tests for auth (allow / deny / lockout / SSE-query-param) | Would need Fastify inject harness | 1 day |
| Playwright `e2e/lan-auth.spec.ts` | End-to-end LAN login flow | 1 day |
| 100k-row virtual-scroll perf test on Logs page | Has no functional regression risk today | 0.5 day |

### From the original PRD (never specced in detail)

- Prometheus `/metrics` endpoint compatibility (current endpoint returns Harvester's internal snapshot JSON, not Prometheus exposition format)
- Multi-user / RBAC
- Mobile-responsive layouts below 1024px (dashboard is desktop-first)

---

## 5. Known limitations & caveats

1. **Initial rule name migration:** the factory default was renamed from `default` to `FREE and 2X_FREE` in `defaults.ts`, but rule-sets seeded before this commit retain their original name. Rename via the inline editor.
2. **Pre-new-logger grab history:** the downloader's file-op log entries (with `op: create` meta) were added late; grabs that happened before the fix show as simple `INFO downloader grab success` without the `op` tag. The Logs page falls back to message-text matching for those rows.
3. **Bundle size:** main JS bundle is ~700 KB (200 KB gzip); Monaco editor is code-split into its own chunk (~19 KB + CDN-loaded Monaco core ≈ 2 MB on first Rules-JSON view).
4. **Preflight on pause-across-restart:** the persisted `service_state` is overwritten to `RUNNING` on successful preflight at boot. A user who paused grabs and then restarted the process will find grabs resumed. Intentional for now; revisit if confusing.
5. **SSE heartbeat:** the service + logs streams send a `: hb` comment every 15 s. Some proxy configurations may strip these; direct loopback access is the fallback.

---

## 6. How to pick up where this left off

1. Read this doc + [`spike/SPIKE_REPORT.md`](../spike/SPIKE_REPORT.md) + [`MTEAM_API.md`](MTEAM_API.md).
2. `npm install && (cd web && npm install) && npm run build`.
3. `scripts\start.bat` (Windows) or `./scripts/start.sh` (POSIX).
4. Open `http://127.0.0.1:5173`. If config exists and first-run completed, the dashboard loads; otherwise the first-run wizard.
5. For Phase-2 polish work: start with the schedule UI (`web/src/pages/RulesPage.tsx` — add a `ScheduleEditor` component alongside the existing fields). Backend schedule evaluator is already in `src/util/time.ts::isScheduleActive`.
6. For Phase-3 test coverage: `tests/integration/auth-*.test.ts` — Fastify provides `app.inject()` for request-level testing without a live listener.

*End of STATUS.md.*
