# Harvester Code Review and Tech Debt Audit

Date: 2026-04-19

Scope: backend (`src`), shared types/schema (`shared`), frontend (`web/src`), runtime scripts/config flow, and available automated checks.

## Checks run

- `npm run test`: passed, 26/26 tests.
- `npm run lint`: failed with 5 existing issues in `src/auth/middleware.ts`, `src/http/server.ts`, `src/util/semver.ts`, `src/util/time.ts`, and `src/workers/downloader.ts`.
- `npm run typecheck`: passed for backend and frontend.
- `npm run build`: passed, but Vite reported an `854.07 kB` main chunk warning.
- `npm run test:e2e`: failed because no Playwright tests exist.

## Findings

### P1. Failed grabs are counted and broadcast as successful grabs

Files: `src/workers/poller.ts:79-87`, `src/workers/poller.ts:107-117`, `src/workers/downloader.ts:210-244`

`poller.tick()` increments `grabbed` and emits `torrent.decision = GRABBED` after `await downloader.enqueue(...)`. The downloader swallows any `HarvesterError`, emits `torrent.grab.failed`, and usually resolves instead of rejecting. That means qBittorrent outages, auth failures, malformed torrent downloads, and similar handled failures are still counted in `poll_runs.torrents_grabbed` and surfaced to the UI as successful grab decisions.

Recommendation: make `enqueue()` return an explicit result enum such as `grabbed | queued_retry | skipped_dup | failed`, and only increment `grabbed` plus emit `GRABBED` when the add/verify path actually succeeds.

### P1. Worker startup is not singleflight, so duplicate worker sets can be started

Files: `src/index.ts:77-120`, `src/http/routes/service.ts:26-36`, `src/services/serviceState.ts:117-124`

`ensureWorkersStarted()` only checks `workerSet` before awaiting preflight. If a second caller enters before the first preflight finishes, both calls can pass the guard and both can call `startWorkers()`. The most realistic trigger is boot-time preflight racing with a user-initiated resume.

Recommendation: wrap `ensureWorkersStarted()` in a shared `startupInflight` promise, exactly the way qBittorrent login is single-flighted in `src/qbt/client.ts`.

### P1. Service state can report `RUNNING` even when no workers are running

Files: `src/http/routes/service.ts:26-36`, `src/http/routes/firstRun.ts:56-64`, `src/index.ts:94-119`

Both `/api/service/resume` and `/api/first-run/complete` move the service state to `RUNNING` before preflight proves that workers can start. If preflight then fails, the API and UI still report `RUNNING` even though nothing was started.

Recommendation: split “desired intent” from “actual runtime state” in the route handlers. Only dispatch `START` after preflight succeeds and worker creation completes.

### P1. Config updates can leave runtime state and disk state out of sync

Files: `src/config/store.ts:28-43`, `src/config/store.ts:45-59`

`createConfigStore.update()` and `.replace()` assign `current = parsed.data` before `writeConfig()` succeeds. If the atomic write fails, the process keeps running with the new in-memory config while `config.json` still contains the old config.

Recommendation: validate first, write second, then swap `current` and emit the change event only after the write succeeds.

### P2. The allowed-client safety gate never resets to false on a disallowed qBittorrent version

Files: `src/index.ts:95-105`, `src/services/serviceState.ts:139-142`

Preflight only dispatches `ALLOWED_CLIENT_ACK` when the qBittorrent version is allowed. It never dispatches `ALLOWED_CLIENT_WARN` when the version becomes disallowed. Because `allowed_client_ok` is also persisted, a previously-healthy install can keep a stale `true` bit and continue grabbing after the qBittorrent version falls outside the supported range.

Recommendation: dispatch `ALLOWED_CLIENT_WARN` whenever preflight returns `allowed_client: false`, and derive the poller gate from the current preflight result rather than a stale persisted flag.

### P2. Queued grab retries do not preserve rule-specific qBittorrent behavior and skip verification

Files: `src/workers/downloader.ts:86-103`, `src/workers/downloader.ts:227-233`, `src/workers/downloader.ts:247-273`, `src/workers/downloader.ts:309-321`, `shared/types.ts:86-91`

The normal add path already ignores `qbt_category`, `qbt_save_path`, `qbt_upload_limit_kbps`, and extra tags by hardcoding `deriveCategory()` and returning `null` for save path and upload limit. The retry path is worse: it only keeps a comma-joined rule name, falls back to the default save path, skips duplicate detection, and skips post-add verification entirely.

Recommendation: persist a full grab job payload in `grab_queue` and make both the live path and retry path share the same add/verify implementation.

### P2. `/api/service/restart` exits the process without graceful shutdown

Files: `src/http/routes/service.ts:39-48`, `src/index.ts:199-229`

The restart route bypasses the normal shutdown flow and calls `process.exit(0)` from a timer. That skips `workerSet.stopAll()`, `app.close()`, `db.close()`, `stopWebhooks()`, and any pending batched log flush in the SQLite sink.

Recommendation: route restart requests through the existing shutdown path, then let the supervisor relaunch the process.

### P2. Historical `stats_daily` rows can record the wrong end-of-day ratio and bonus values

Files: `src/workers/statsDailyRollup.ts:101-110`

`rollup(date)` always uses `getLatestProfileSnapshot(db)` for `ratio_end_of_day` and `bonus_points_end_of_day`, even when it is filling yesterday’s row. Once the date rolls over, rerunning yesterday’s rollup stores today’s latest values into yesterday’s record.

Recommendation: fetch the latest snapshot at or before the end of the target date, not the latest snapshot in the whole table.

### P2. Settings connectivity tests use unbounded `fetch()` calls

Files: `src/http/routes/settings.ts:178-205`, `src/http/routes/settings.ts:207-231`

The interactive “test M-Team” and “test qBittorrent” helpers use raw `fetch()` instead of `fetchWithTimeout()`. A dead host or half-open network path can hang the request indefinitely and leave the settings UI waiting forever.

Recommendation: move both helpers onto the shared timeout-bounded HTTP helper and reuse the same error normalization as the real clients.

### P2. `bind_host` validation accepts invalid IP addresses

Files: `src/config/schema.ts:13-16`

The regex allows syntactically numeric IPv4 strings like `999.999.999.999`. That value passes validation, gets persisted, and only fails later when the process tries to listen on restart.

Recommendation: replace the regex with real IP parsing, or at least bound IPv4 octets to `0-255` and validate IPv6 separately.

### P2. SQLite log retention ignores the configured retention window

Files: `src/config/schema.ts:92-97`, `src/logger/sqliteSink.ts:99-107`

The config exposes `logging.retain_days`, defaulting to 14, but the SQLite sink hard-prunes logs older than 7 days after every 500 writes. That makes the persisted log history shorter than the configured policy and impossible to tune from settings.

Recommendation: thread `retain_days` into the sink and use it consistently for database pruning.

### P3. The dashboard’s `active_count` does not match its own contract

Files: `shared/types.ts:147-153`, `src/http/routes/dashboard.ts:23-40`, `src/http/routes/dashboard.ts:95-105`

The shared type says `active_count` means “currently transferring data (downloading + uploading)”, but the implementation only increments `active` for `downloading` and excludes actively uploading torrents.

Recommendation: either count uploading torrents in `active_count` or rename the field to `active_downloading_count` and update the frontend copy to match.

### P3. The frontend still stores the LAN access secret in `localStorage`

Files: `web/src/store/auth.ts:13-31`, `src/http/server.ts:111-123`

The LAN password is persisted as a long-lived bearer token in `localStorage`. The current CSP still allows `'unsafe-inline'` scripts and styles. React escapes most UI content correctly, so this is a hardening issue rather than an immediate exploit, but the blast radius of any future XSS is still higher than necessary.

Recommendation: move auth storage to in-memory plus `sessionStorage`, keep login silent across refresh only when needed, and tighten the CSP as far as Monaco/Recharts will allow.

## Additional tech debt

- `createLoopWorker()` still schedules the next run from tick completion, so long ticks drift the effective cadence. `src/workers/loopWorker.ts:33-65`
- Rule-set fields for qBittorrent category, save path, extra tags, upload limits, and lifecycle overrides exist in the shared schema but are not implemented end-to-end in the worker pipeline. `shared/types.ts:82-91`, `src/workers/downloader.ts:309-321`
- The frontend build currently ships an `854.07 kB` main chunk. `MonacoJsonEditor` is split, but the rest of the dashboard remains largely monolithic at route level.
- There is no end-to-end regression suite. `npm run test:e2e` reports “No tests found”.
- Lint is not clean, which weakens the signal of CI for real regressions.

## Recommended change order

1. Fix the grab accounting contract between `poller` and `downloader`.
2. Single-flight worker startup and stop reporting `RUNNING` before preflight succeeds.
3. Make config writes transactional from the caller’s point of view.
4. Fix the allowed-client gate so disallowed qBittorrent versions cannot keep grabbing.
5. Unify the live and queued add paths so retry behavior preserves rule semantics and verification.
6. Make restart graceful and thread `retain_days` into log pruning.
7. Fix the historical stats rollup and `bind_host` validation.
8. Add a small Playwright smoke suite covering first-run, login, pause/resume, rules save, and logs tailing.
