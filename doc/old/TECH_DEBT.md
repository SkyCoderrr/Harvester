# Harvester — Tech Debt & Design Critique

> **Doc ID:** TECH_DEBT.md
> **Version:** 1.0 (2026-04-19 audit)
> **Scope:** full repo (~10.1k LoC across `src/`, `shared/`, `web/src/`; 34 HTTP routes; 7 workers; 2 migrations)
> **Method:** four parallel focused audits (auth/security · workers/clients · DB/HTTP/logger · frontend/UX), spot-checked against the actual source.
> **Companion docs:** [`STATUS.md`](STATUS.md) (what shipped), `IMPLEMENTATION.md` (plan).

Findings are scored against the framework in `plugins/engineering/tech-debt`:

`Priority = (Impact + Risk) × (6 − Effort)`   where each of **Impact**, **Risk**, and **Effort** is 1–5 (lower effort ⇒ higher priority). Items are grouped by severity; the remediation plan in §5 orders them by score.

Every item is linked to a real file path and line range that was read during the audit. Two findings surfaced by the subagents were dropped after verification (see §6) so the list below is trustworthy.

---

## 1. Executive summary

| Severity | Count | Representative items |
|---|---|---|
| **Critical** | 3 | No `fsync` in atomic config write; SSE token passed via `?token=` query string; bulk-action body unvalidated |
| **High** | 8 | Auth token in `localStorage`; no `fetch` timeout on qBt/downloader; SSE listener leak on client disconnect; concurrent-reauth race in qBt; missing `idx_torrent_events_infohash`; no retry jitter; uncleaned `config.json.tmp` on crash; focus trap + Esc missing in modals |
| **Medium** | 14 | Poll-cycle reentrancy risk; clock-drift timing; TZ-naive daily rollup; TanStack Query refetch races; god-components (`DashboardPage` 917 LoC, `RulesPage` 667 LoC); no body-size limit; CSRF vectors on state-changing endpoints; duplicated discount-color maps; stats_daily has no pruning; dashboard delta computed from two un-atomic queries; WCAG-AA contrast on log-level chips; ARIA gaps (columnheader, live-region on toasts, aria-current on nav); empty/error states lack recovery hints; migration version-gap unchecked |
| **Low / info** | 9 | Argon2 params untested on target HW; `ip.startsWith('127.')` rate-limit exemption is over-broad but not exploitable without raw sockets; timers not `.unref()`'d; Monaco accessibility unverified; responsive <1024px not graceful; misc cleanup effects |

**Takeaway.** The shipping-blocker class (the 3 Critical + top ~5 High) is small and clustered around three themes: *input validation at the trust boundary*, *timeouts/leaks in long-lived workers and SSE*, and *hash-of-infohash lookups on a non-indexed column*. Everything else is maintenance quality and UX polish. Total remediation surface for all Critical + High is estimated at **~4–6 engineering days**.

---

## 2. Critical (P0 — fix before next release)

### C1. Atomic config write is not actually atomic — no `fsync`

**Impact 4 · Risk 5 · Effort 1 · Priority 45** ✓ verified

`src/config/write.ts:21–31`. The function comment claims *"write to `config.json.tmp`, fsync, then rename"* but the code path is `writeFileSync(tmp, …); … renameSync(tmp, final);` with no `fsync` on the tmp file descriptor or the directory. On a crash between `writeFileSync` and the next page-cache flush, the rename can land with the old inode still pointing at stale contents, leaving the config silently corrupt on next boot. Lines 31 and 41–45 also don't clean up a dangling `.tmp` if `rename` throws (important on Windows, where the rename can fail with `EPERM`/`EBUSY` and orphan a file that the next write can't create).

Fix: open `tmp` with `fs.openSync`, write through the fd, `fs.fsyncSync(fd)`, `fs.closeSync(fd)`, then `renameSync`, then `fsyncSync` of the directory on POSIX. Wrap the whole block in `try/finally` that unlinks `tmp` on error.

### C2. SSE auth token is accepted as a query-string parameter

**Impact 4 · Risk 5 · Effort 2 · Priority 40** ✓ verified

`src/auth/middleware.ts:140–156` (extractToken) allows `?token=…` on SSE routes because browsers can't set `Authorization` headers on `EventSource`. Consequences:

* Query strings appear in `Referer` headers on any link click, in browser history, in reverse-proxy access logs, and in `req.url` logged by the Fastify request hook at `src/http/server.ts` (~line 89).
* `web/src/pages/LogsPage.tsx` and SSE endpoints in `src/http/routes/service.ts:27–74` + `src/http/routes/logs.ts` all pass the long-lived auth token this way.
* Combined with CSRF (see M5), an attacker who tricks the user into loading a crafted HTML snippet can exfiltrate the token and embed it in a cross-site `EventSource(…)` or `<img src="…?token=…">`.

Fix: issue a **short-lived, scope-limited SSE ticket** (JWT or opaque handle, TTL ≈ 60s, one-shot or bound to the stream) from an authenticated `POST /api/sse-ticket` endpoint, and accept only that ticket in `?token=…`. Scrub the main bearer token from `req.url` in the logger before it's stored.

### C3. Bulk-action and first-run request bodies are not validated

**Impact 3 · Risk 5 · Effort 2 · Priority 32** ✓ verified

`src/http/routes/torrents.ts:79–90` casts `req.body as { infohashes?, ids?, action }` with no zod parse; `action` is typed as a union but at runtime is a free string. `src/http/routes/firstRun.ts:21–31` does the same with the first-run patch. Because these routes write to qBt and to the config, an unvalidated payload can:

* Trigger `remove_with_data` from any caller that provides the word (relies on the auth gate alone for safety).
* Cast arbitrary strings into `hashes.join('|')` for qBt, which tolerates anything but will happily forward to libtorrent.
* Accept extra fields that silently bypass schema guards.

Fix: every mutating route should `zod.parse(req.body)`. For `bulk-action`: `z.object({ infohashes: z.array(z.string().regex(/^[0-9a-f]{40}$/)).optional(), ids: z.array(z.string()).optional(), action: z.enum(['pause','resume','recheck','remove','remove_with_data']) })` with a `.refine()` requiring at least one of the two arrays. Register `fastify.setErrorHandler` to translate `ZodError` → 400 via the existing `ApiResponse` envelope and `VALIDATION_FAILED` error code.

---

## 3. High (P1 — fix in the next sprint)

### H1. `fetch` has no timeout in the qBt client and the downloader

**Impact 4 · Risk 4 · Effort 2 · Priority 32** ✓ verified

`src/qbt/client.ts:86–101` (login) and `:203–220` (`doRequest`) call `fetch` without an `AbortController` or `signal`. A hung qBt (crash, FD exhaustion, firewall drop) wedges the poller / downloader indefinitely; the rest of the workers keep running but `ensureSession` never returns. The downloader's `fetchTorrentFile` is similarly uncovered. The M-Team client *does* time out (AbortController at `src/mteam/client.ts:~87`).

Fix: extract a `fetchWithTimeout(url, init, ms)` helper into `src/util/http.ts`; use it in both clients. 15s connect + 30s total is a reasonable default. `clearTimeout` in `finally`. Prefer `.unref()` on the timer to avoid holding the process open at shutdown.

### H2. Concurrent re-auth race in the qBt client

**Impact 3 · Risk 4 · Effort 1 · Priority 35** ✓ verified

`src/qbt/client.ts:141–160`. `ensureSession` does `if (!sid) await login();` — not atomic. Under concurrent requests (poller's `listTorrents` + lifecycle probe during a 403 window), two callers both see `sid === null` and both call `login()`, racing on the `SID=` header. Symptoms: spurious `QBT_AUTH_FAILED` if qBt rate-limits back-to-back logins, metric double-counting, and (with qBt's real "IP ban after 5 fails") a self-inflicted lockout.

Fix: single-flight the login via a module-level promise.

```ts
let loginInFlight: Promise<void> | null = null;
async function ensureSession() {
  if (sid) return;
  if (!loginInFlight) {
    loginInFlight = login().finally(() => { loginInFlight = null; });
  }
  await loginInFlight;
}
```

Apply the same pattern to the re-auth path at line 155–158.

### H3. SSE endpoints leak bus listeners on client disconnect

**Impact 3 · Risk 4 · Effort 2 · Priority 28**

`src/http/routes/service.ts:27–51` and `:54–74` register `deps.bus.on(...)` and `deps.bus.onAny(...)` but, if `reply.raw.write()` throws on a half-closed socket, the catch path doesn't `bus.off(...)`. Every reconnect (Wi-Fi flap, Chrome tab sleep, laptop lid close) leaves an orphan listener. `src/events/bus.ts:~46` caps at 100; once exceeded, Node emits `MaxListenersExceededWarning` and handlers are silently degraded.

Fix: bind the `off` handle before the first write and call it from `reply.raw.on('close', off)` *and* from any write-failure catch. Also, remove the hard 100 cap on the bus (or raise to `Infinity`); instrument via the metrics counter instead, logging a warning above a threshold so the leak is visible but never silently fatal.

### H4. Missing index on `torrent_events.infohash`

**Impact 3 · Risk 3 · Effort 1 · Priority 30** ✓ verified

`db/migrations/0001_init.sql:33–35` creates indexes on `mteam_id`, `seen_at`, `decision`. `src/db/queries.ts` and `src/http/routes/torrents.ts` repeatedly look rows up by `infohash` (detail view, bulk-action resolution, dry-run cross-ref, file-ops log cross-highlight). Table will grow unbounded (one row per grab + one per SKIP + one per ERROR). Full-scan cost is tolerable today but will be the first thing to regress past ~100k rows.

Fix: a new migration `0003_index_infohash.sql` with `CREATE INDEX IF NOT EXISTS idx_torrent_events_infohash ON torrent_events(infohash) WHERE infohash IS NOT NULL;` (partial index — most `SKIPPED_*` rows have null infohash). While there, add `idx_torrent_events_mteam_seen (mteam_id, seen_at DESC)` for the poller's re-eval path.

### H5. Auth token stored in `localStorage` — XSS exfiltrates session

**Impact 3 · Risk 4 · Effort 3 · Priority 21** ✓ verified

`web/src/store/auth.ts:13–37` reads/writes `harvester:auth-token` to `localStorage`. Any XSS (Monaco editor, recharts, any future markdown) gets the token in one line. The app has no CSP header, no Trusted Types.

Fix ordered by effort: (a) cheapest — add a strict CSP at `src/http/server.ts` (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'`), serve `frame-ancestors 'none'`, and a `Strict-Transport-Security` stub if TLS lands. (b) medium — keep the token in memory + sessionStorage tab-scoped, with a silent re-login prompt on refresh. (c) proper — move to a short-lived access token + rotating refresh token in an HttpOnly, `SameSite=Strict` cookie (coupled with CSRF tokens on mutating routes; see M5).

### H6. No retry jitter — post-outage thundering herd

**Impact 3 · Risk 3 · Effort 1 · Priority 30**

`src/util/retry.ts` (`withRetry`) uses a deterministic exponential schedule (e.g. 1 s / 2 s / 4 s) with no jitter, and all 7 workers in `src/workers/*` run on fixed intervals without stagger. When M-Team or qBt has a 5-minute outage, every worker wakes and hits retry 1 at the same wall-clock millisecond the service comes back. For a single-user tool this is only mildly wasteful today, but it interacts badly with M-Team's real rate limits.

Fix: `delay = base * factor^(i-1) + random(0, base)` in `util/retry.ts`; also add a ±15 % random jitter to each worker's initial start in `src/workers/index.ts`.

### H7. `config.json.tmp` orphans on failed rename

**Impact 2 · Risk 4 · Effort 1 · Priority 24** ✓ verified

`src/config/write.ts:31`. Same file as C1; distinct symptom. On Windows, `renameSync` fails if anti-virus is holding the target briefly, leaving `config.json.tmp` on disk. The next `writeConfig` call writes over `tmp` fine, but scripted cleanup and backup tools get confused by the orphan, and the user sees a mystery file.

Fix: wrap the block from line 22 onward in `try { … } catch (err) { try { fs.unlinkSync(tmp); } catch {} throw err; }`. Folded into C1's fsync fix for zero extra effort.

### H8. Modal focus trap + Escape key missing

**Impact 2 · Risk 3 · Effort 2 · Priority 20** (accessibility WCAG 2.1 AA 2.1.1, 2.4.3)

`web/src/components/LoginModal.tsx` and the torrent detail drawer in `web/src/pages/TorrentsPage.tsx:278–391`. `autoFocus` on the password input fires once on mount; Tab walks out of the modal into the obscured page behind; Esc does nothing. Screen-reader users can't escape the modal without mouse.

Fix: a small `useFocusTrap(ref, { restoreTo: previouslyFocused, onEscape: onClose })` hook in `web/src/lib/a11y.ts`. Apply to `LoginModal`, the torrent drawer, and the rule dry-run drawer.

---

## 4. Medium (P2 — fix alongside feature work)

These are listed compactly; each has a concrete file reference. Fold into sprints as they touch adjacent code.

| # | File : line | Category | Issue | Suggested fix |
|---|---|---|---|---|
| M1 | `src/workers/loopWorker.ts:33–61` | Concurrency | Poll-cycle reentrancy if a tick exceeds `intervalMs()` and the interval changes mid-flight | Lock interval at tick start; schedule off `lastTickEnd + interval` |
| M2 | `src/workers/loopWorker.ts:38, 48`; `src/workers/emergencyMonitor.ts:55`; `src/services/serviceState.ts:53,85` | Clock | `Date.now()` used for elapsed timing; breaks under NTP step | `performance.now()` for deltas; keep `Date.now()` for persisted timestamps |
| M3 | `src/workers/statsDailyRollup.ts:78–84` | TZ | `todayLocal()` uses system TZ, not user-configured tz | Reuse `date-fns-tz` like `src/util/time.ts:85` |
| M4 | `src/http/server.ts` (Fastify init) | DoS | No explicit `bodyLimit`; default 1 MB is silent | `bodyLimit: 256 * 1024` on the server + per-route override on `/api/rules` |
| M5 | all POST/PUT/DELETE routes | CSRF | Bearer-header model plus `?token=` on SSE is CSRF-susceptible once an XSS or malicious tab exists | Double-submit CSRF token on mutating routes; or move to SameSite cookie (pairs with H5) |
| M6 | `web/src/pages/DashboardPage.tsx` (917 LoC), `RulesPage.tsx` (667 LoC) | Maintainability | God-components: KpiTile, DeltaPill, RatioChart, SpeedChart, TierCard, DownloadsTable all inlined | Extract into `web/src/components/dashboard/*` and `web/src/components/rules/*`; keep page files under 300 LoC |
| M7 | `web/src/pages/DashboardPage.tsx:34–43` and `web/src/pages/TorrentsPage.tsx:10–19` | Duplication | `DISCOUNT_COLOR` defined twice | Extract to `web/src/lib/discount.ts`; re-export from both |
| M8 | `web/src/pages/DashboardPage.tsx:293–350, 495–533` | Perf | Recharts `AreaChart` data + gradient IDs recreated every render | `useMemo` data; hoist gradient IDs |
| M9 | `web/src/pages/DashboardPage.tsx:46–50` | Data race | KPI strip refetch every 10 s without `staleTime`; out-of-order responses possible | `staleTime: 10_000` + `structuralSharing` + AbortController on unmount |
| M10 | `src/http/routes/dashboard.ts:37–39` | Correctness | 1d and 2d grab counts computed in two separate queries; rows inserted between them skew the delta | Single `SELECT CASE WHEN … THEN 1 ELSE 0 END` aggregate |
| M11 | `src/db/migrate.ts:29–39` | Safety | No gap check between applied and available migrations | Track max applied; refuse to start on gap |
| M12 | `src/workers/statsDailyRollup.ts` | Growth | `stats_daily` has no TTL. 10-year-old rows persist | Prune rows > 2 years in monthly job (or just ignore — 3.7 KB/year is free) |
| M13 | `src/logger/sqliteSink.ts:25–78` | Durability | Synchronous `insertLog` per line; blocks pino if DB is locked; no batch; no drop counter | Buffer 100 lines or 250 ms, insert in a single `BEGIN/COMMIT`; emit `log.dropped` metric if buffer overflows |
| M14 | `web/src/pages/LogsPage.tsx:195–204`; `web/src/pages/DashboardPage.tsx:850–863` | Contrast (WCAG AA) | Unselected level chips ≈ 4.2:1, `DiscountTag` with 10 % bg opacity ≈ 4.0:1 | Bump muted-text token from `#71717a` → `#a1a1aa`; for tags, use Tailwind `/20` bg with full-opacity text |
| M15 | `web/src/App.tsx:94–110`; `web/src/components/ToastContainer.tsx:21–68`; dashboard/torrents `<th>` | A11y | Missing `aria-current="page"` on nav, no `role="status"/aria-live` on toasts, no `scope="col"` on table headers | Drop-in attrs; no behavior change |
| M16 | `web/src/pages/DashboardPage.tsx:679–684`; `web/src/pages/LogsPage.tsx:387–397`; `web/src/pages/FirstRunPage.tsx:97–148` | UX | Empty/error states don't tell the user what to try next | Add one sentence of recovery guidance per state |

---

## 5. Low / informational

| # | File | Note |
|---|---|---|
| L1 | `src/auth/argon2.ts:8–13` | Argon2 params untested on target hardware. Not a vulnerability (argon2.verify is constant-time and `parallelism=4` on a single-core is degraded but still fine for local LAN). Action: run a 200-sample bench at boot into logs; adjust `memoryCost` only if median < 200 ms. |
| L2 | `src/auth/rateLimiter.ts:66–75` | `isLocalhost` treats all `127.0.0.0/8` as loopback. Per RFC 6890 this is correct; exploit requires raw-socket privileges on the same host. No change needed. |
| L3 | `src/mteam/client.ts`, `src/qbt/client.ts` | Timeout timers are not `.unref()`'d — can delay graceful shutdown by a few seconds. Trivial fix. |
| L4 | `web/src/components/MonacoJsonEditor.tsx:38` | `useEffect(() => () => undefined, [])` is a no-op. Remove. |
| L5 | `web/src/pages/LogsPage.tsx:57–85` | EventSource reconnect has no exponential backoff; on flaky networks produces a reconnect storm. Add capped backoff + jitter. |
| L6 | `web/src/pages/TorrentsPage.tsx:38–55` | Bulk-action toast reports success before checking per-item `ok:false`. Map failures to individual toasts before the refetch. |
| L7 | `web/src/components/MonacoJsonEditor.tsx:42–68` | Monaco a11y not verified. Run axe-core manually; consider a "plain textarea" fallback behind a setting. |
| L8 | `src/errors/index.ts:63` | `MTEAM_FORBIDDEN_METHOD` → 500 is fine for an internal bug signal, but the `user_message` should say "this Harvester build is calling an endpoint we've confirmed M-Team 404s — please file a bug." |
| L9 | `<1024px` layouts | `STATUS.md §4` already flags this as out of scope. No action unless mobile enters scope. |

---

## 6. Findings dropped after verification

Subagent audits initially flagged these; we read the code and they don't hold up:

1. **"Timing attack in `verifyPassword` silent catch."** `argon2.verify` is constant-time with respect to password comparison. The `try/catch { return false }` in `src/auth/argon2.ts:19–24` only swallows malformed-hash errors — an infra-level case, not a password oracle. Noted as low under L1.
2. **"Rate limiter bypass via `startsWith('127.')`."** This is correct per RFC 6890 and unexploitable without a raw-socket LAN attacker; downgraded to L2.
3. **"LogFilter LIKE injection."** `src/db/queries.ts:368–370` uses parameterised LIKE with user input. Wildcards in `f.q` produce broader matching, not injection. Safe as-is.

---

## 7. Phased remediation plan

A small team (or solo-dev) can ship the P0 + top-6 P1 in **≈5 engineering days** without pausing Phase-2 polish work. Effort is in ideal coding days; all items are reversible by revert.

### Phase A — Stop-ship class (~1.5 days)

1. **C1/H7 — atomic config write with fsync + tmp cleanup** — 2 h. Single file (`src/config/write.ts`) + 2 unit tests (success, mid-write crash simulated via rename-monkey-patch).
2. **C2 — SSE ticket endpoint** — 4 h. New `POST /api/sse-ticket` returning a 60-s opaque handle; update `extractToken` to accept tickets only; update `web/src/api/client.ts` + `LogsPage`/service-events consumers to mint a ticket before opening `EventSource`. Delete the `?token=<bearer>` branch.
3. **C3 — zod on mutating routes** — 4 h. A `validate<T>(schema)` helper that attaches a `preValidation` hook; apply to `torrents/bulk-action`, `torrents/:id/action`, `first-run/*`, `rules*`, `settings*`. Wire `ZodError → 400 VALIDATION_FAILED`.

### Phase B — Resilience & safety (~2 days)

4. **H1 — `fetchWithTimeout`** rolled into qBt client + downloader. 3 h.
5. **H2 — single-flight login** in qBt client. 1 h.
6. **H3 — SSE listener cleanup** on every close path. 2 h.
7. **H4 — `0003_index_infohash.sql` + `idx_torrent_events_mteam_seen`**. 1 h (index itself) + smoke test.
8. **H6 — retry jitter + worker start stagger**. 1 h.
9. **M11 — migration gap check**. 1 h, trivial.
10. **M4 — Fastify `bodyLimit`**. 15 min.

### Phase C — Frontend refactor + a11y (~1.5 days)

11. **H8 — `useFocusTrap` hook** used in three modals. 3 h.
12. **M6 — split DashboardPage + RulesPage** into `components/dashboard/*` and `components/rules/*`. 4 h (the big chunk).
13. **M7/M8/M9 — recharts memoization, shared colors, `staleTime`**. 2 h, same diff.
14. **M14 + M15 — contrast bump + ARIA attributes**. 2 h.
15. **M16 — empty/error-state copy pass** with the email-editor skill for tone. 1 h.

### Phase D — Opportunistic (fold into feature work)

16. **H5 — CSP + move token out of `localStorage`** when next auth touch happens; pair with **M5 — CSRF** in the same PR. Estimated 1–2 days combined.
17. **M13 — batched SQLite log sink** when next logger touch happens. 3 h.
18. **M10, M12, M2, M3, L-items** — drive-by fixes on any PR that lands near the code.

### Out of scope for this doc

The items already listed in `STATUS.md §4` (schedule UI, keyboard shortcuts, integration test suite, e2e specs, bench tests, Prometheus format, mobile layouts) remain deferred for the same reasons stated there. They aren't tech debt — they're explicit Phase-2 / Phase-3 polish.

---

## 8. Business justification, in one paragraph each

* **Phase A.** C1 protects first-run credentials and all subsequent settings writes from crash-at-the-wrong-millisecond corruption. C2 removes the only path where a long-lived admin token can leak into referrer logs or a reverse-proxy's access log. C3 closes the trust-boundary gap that currently relies solely on the auth cookie.
* **Phase B.** The qBt and downloader timeouts prevent a hung indexer or paused qBt process from silently stalling the whole grab loop — this is the failure mode that will produce the first "why didn't it grab last night?" support thread. The SSE listener leak and missing infohash index are latent capacity cliffs that are invisible today and painful at 50k+ events; cheaper to fix now than to debug a memory or CPU spike later.
* **Phase C.** Accessibility and component-size work pays back continuously: every future feature on the Rules or Dashboard page lands in a file you can fully page in, and the three modals stop being a paper-cut for keyboard users and screen readers.
* **Phase D.** CSP + cookie-based auth is the right long-term auth posture; pair it with the next intentional auth change rather than doing it standalone. Batched SQLite log sink is an optimisation whose win scales with log volume — do it the next time you touch the logger.

---

*End of TECH_DEBT.md.*
