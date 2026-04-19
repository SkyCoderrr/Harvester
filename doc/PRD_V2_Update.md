# Harvester — PRD v2 Update (Roadmap & Scope Delta)

> **Doc ID:** PRD_V2_Update.md
> **Version:** 2.0 (delta on PRD.md v1.0)
> **Date:** 2026-04-19
> **Audience:** Downstream AI authors. Not human-facing.
> **Format:** Dense, precise, AI-targeted. Redundancy preferred to ambiguity.
> **Authority:** Adds new product requirements on top of `old/PRD.md`. Where this doc and `old/PRD.md` agree, both are authoritative; where they conflict, this doc wins.
> **Companion doc:** `V2_Implementation.md` (file-level engineering plan that consumes this PRD).
> **Source material:** `old/STATUS.md` (post-v1 snapshot), `old/TECH_DEBT.md` (audit), `old/DASHBOARD_REVIEW.md` (rationale), `old/DASHBOARD_UI_HANDOFF.md` (component spec), brainstorm session 2026-04-19.

---

## 0. Document Conventions

- **P0** = ship in next release; blocks user trust or correctness.
- **P1** = fix in the same wave as P0; high-value resilience or feature.
- **P2** = fold into adjacent feature work; non-urgent.
- **P3** = parked but tracked.
- **MUST / MUST NOT / SHOULD / MAY** are RFC-2119 keywords.
- All TECH_DEBT IDs (`C*`, `H*`, `M*`, `L*`) preserved verbatim from `old/TECH_DEBT.md`.
- All DASHBOARD IDs use `D*` (this doc's own scheme; cross-walk in §11).
- All STATUS §4 IDs use `S*`; brainstorm IDs use `B*`; STATUS §5 known limitations use `K*`.
- Every requirement has at least one `Source:` link to `old/*` for provenance.
- No new global formatting changes from v1.

---

## 1. Scope and Authority

### 1.1 What this doc covers

PRD v2 captures every change that has surfaced AFTER v1 ship and that is approved for execution:

1. Tech-debt remediation per `old/TECH_DEBT.md` (Critical, High, Medium, Low — full set).
2. Dashboard v2 redesign per `old/DASHBOARD_UI_HANDOFF.md` + `old/DASHBOARD_REVIEW.md`.
3. Phase-2 polish items deferred in `old/STATUS.md §4` that remain in scope.
4. Brainstorm-derived feature additions (pause-state fix, why-skipped panel, webhook notifications, Prometheus, rule-set import/export).

### 1.2 What this doc does NOT cover

Out of scope for v2 — confirmed dropped:

| ID | Item | Reason |
|----|------|--------|
| `S2` | Keyboard shortcuts (`g d`, `g t`, `/`, `?`) | User decision: not valued. |
| `S3`–`S8` | Full integration suite, Playwright E2E, bench tests, auth integration tests, 100k-row perf test | Single-user tool; minimal backend unit tests are sufficient. |
| `S10` | Multi-user / RBAC | Single-user product. |
| `S11`, `L9` | Mobile / sub-1024 px responsive | Desktop-only product. |
| `D8` | `CommunityContextLine` + `communityProbe` worker + `community_snapshots` table | P3 in handoff; deferred indefinitely. |
| `K2` | Pre-new-logger grab history backfill | Accept as-is; message-text fallback already works. |
| `K3` | Monaco bundle size | Code-split already in place; further work not justified. |
| `K5` | SSE heartbeat proxy compatibility | Loopback works; no proxy environment to support. |
| `L2` | Rate-limiter `127.0.0.0/8` exemption | Verified safe per RFC 6890. |
| `B3` | Backtest / replay mode for rule sets | Deferred post-v2 (user decision — Phase 4 removed). Brainstorm B3 remains a documented future idea. |

### 1.3 Authority precedence

1. `V2_Implementation.md` cites this doc; this doc cites `old/PRD.md` v1.0 as baseline.
2. Where v2 changes a v1 contract (new fields on `DashboardSummary`, new endpoints, new tables), v2 wins.
3. Where v1 defines a behavior v2 does not mention, v1 wins (no silent removals).

---

## 2. Summary of Changes vs PRD v1

### 2.1 New product capabilities

| Capability | Source | Impact |
|------------|--------|--------|
| Upload/download volume visibility (KPI tiles + butterfly chart) | DASHBOARD_REVIEW §3.1, §4 | Closes the largest data-on-disk-but-not-shown gap in v1. |
| Account health alerting (warned / leech-warn banner) | DASHBOARD_REVIEW §3.6, HANDOFF §B.4.7 | Protects user from M-Team account warnings. |
| Per-rule performance visualization | DASHBOARD_REVIEW §3.5, HANDOFF §B.4.5 | Surfaces existing-but-unused `/api/stats/ruleset-performance`. |
| State-distribution strip bar | DASHBOARD_REVIEW §3.11, HANDOFF §B.4.6 | Surfaces existing-but-unused `/api/stats/torrent-states`. |
| Time-window controls on ratio + grabs charts | DASHBOARD_REVIEW §3.4, HANDOFF §B.4.9 | Unlocks data already retained server-side. |
| Truthful disk visualization (dual-bar) | DASHBOARD_REVIEW §3.3, HANDOFF §B.4.3 | Removes a known misleading visual from v1. |
| Seeding-time KPI tile | DASHBOARD_REVIEW §3.7 | Concretizes the abstract `bonus_points` accumulation. |
| "Why skipped?" rationale panel in torrent drawer | Brainstorm B2 | Turns observability → explanation. |
| Webhook notifications (Discord / Telegram / ntfy) | Brainstorm B4 | Reaches user when web UI is closed. |
| Rule-set JSON import/export | Brainstorm B6 | Backup, share, version-control rules. |
| Schedule editor UI in RulesPage | STATUS §4 (S1) | Backend evaluator already live; only UI missing. |
| Prometheus exposition format on `/api/metrics` | STATUS §4 (S9), Brainstorm B5 | Standard home-lab integration. |
| Pause-state persistence across restart | STATUS §5 (K4), Brainstorm B1 | Trust bug — fix MUST land before any release. |

### 2.2 New non-functional requirements

| Capability | Source |
|------------|--------|
| All mutating routes MUST be `zod`-validated. | TECH_DEBT C3 |
| All outbound HTTP MUST be timeout-bounded. | TECH_DEBT H1 |
| All SSE-bearing endpoints MUST use a short-lived ticket; long-lived bearer tokens MUST NOT appear in `?token=` parameters. | TECH_DEBT C2 |
| `config.json` write MUST `fsync` the file descriptor and the directory. | TECH_DEBT C1 |
| All retry schedules MUST include random jitter. | TECH_DEBT H6 |
| All modals MUST trap focus and close on `Esc`. | TECH_DEBT H8 |
| `torrent_events.infohash` MUST have a (partial) covering index. | TECH_DEBT H4 |
| Frontend SHOULD enforce a strict CSP and SHOULD NOT store long-lived tokens in `localStorage`. | TECH_DEBT H5 |
| Mutating routes SHOULD enforce double-submit CSRF tokens (paired with H5). | TECH_DEBT M5 |
| Service state MUST distinguish user-intent pause from system-pause and MUST persist user-intent across restart. | STATUS K4 / Brainstorm B1 |

### 2.3 Removed / deprecated

| Item | Status | Reason |
|------|--------|--------|
| `DISCOUNT_COLOR.PERCENT_30` constant | Removed | MTEAM_API §3.3 confirms the value does not exist. |
| `?token=<bearer>` SSE auth path | Removed (replaced by ticket) | TECH_DEBT C2. |
| `DiskTile` v1 single-bar percentage | Removed (replaced by dual-bar) | DASHBOARD_REVIEW §3.3. |
| `Speed — 60m` 10s refetch | Changed to 60s | DASHBOARD_REVIEW §3.2. |
| `DashboardPage.tsx` 917-LoC monolith | Split into `web/src/components/dashboard/*` | TECH_DEBT M6. |
| `RulesPage.tsx` 667-LoC monolith | Split into `web/src/components/rules/*` | TECH_DEBT M6. |

---

## 3. New Goals (Extends PRD v1 §4)

| # | Goal | Measurable outcome |
|---|------|--------------------|
| **G7** | Dashboard fidelity: every persisted profile/transfer/event field that has user value MUST have a UI surface. | All fields in DASHBOARD_REVIEW §2.2 "Data available but not shown" surfaced or explicitly waived. |
| **G8** | Trust-boundary integrity: every mutating endpoint validates its body and rejects invalid payloads with `VALIDATION_FAILED` (400) before side effects. | 0 mutating routes accept un-zod'd bodies. |
| **G9** | Long-running connection safety: 0 SSE listener leaks under 1000 reconnect cycles; 0 wedged workers under qBt/M-Team unreachability. | Manually verified via repeated lid-close + Wi-Fi flap; integration not required. |
| **G10** | Service-state honesty: a user-paused service MUST remain paused across crash + restart unless the user explicitly resumes. | 100% of pause-then-restart cycles preserve `paused` state. |
| **G11** | Out-of-band notification: user-affecting events (warned account, ratio emergency, grab failures over threshold) MAY be delivered via webhook even when the SPA is closed. | Configurable per-category; mute toggles persist. |

PRD v1 goals G1–G6 remain authoritative. (G12 backtest-empiricism removed from v2 — see §1.2.)

---

## 4. New Non-Goals (Extends PRD v1 §5)

| # | Non-goal | Rationale |
|---|----------|-----------|
| N12 | Mobile-responsive layouts (< 1024 px). | Desktop-only product. |
| N13 | Multi-user / RBAC / per-user settings. | Single-user product. |
| N14 | Full E2E test suite (Playwright). | Single-user; manual smoke + minimal backend unit tests cover the risk. |
| N15 | Multi-tracker support. | M-Team-only product. Adapter abstraction deferred indefinitely. |
| N16 | Community context line / `communityProbe` worker. | P3 in handoff; nice-to-have only. Drop until further notice. |
| N17 | Auto-start on Windows boot. | Manual launch only (inherited from v1 N7). |
| N18 | Cloud / SaaS / hosted variant. | Local-only (inherited from v1 N4/N5). |
| N19 | Backtest / rule-set replay mode. | Deferred post-v2; dropped with Phase 4 removal. |

---

## 5. New User Stories (Extends PRD v1 §6, US-13+)

| ID | Story | Priority |
|----|-------|----------|
| US-13 | As an RCWU, I want to see how much I uploaded and downloaded today, so I can verify the tool is earning. | P0 |
| US-14 | As an RCWU, I want a 14-day mirrored chart of upload vs. download volume, so I can visually verify share ratio. | P0 |
| US-15 | As an RCWU, I want a banner when my account is warned or leech-warned, so I never miss a pre-ban signal. | P0 |
| US-16 | As an RCWU, I want a per-rule performance view, so I can tell which of my rules are firing. | P1 |
| US-17 | As an RCWU, I want a compact state-distribution bar, so I can see at a glance how many torrents are downloading vs. seeding vs. stalled. | P1 |
| US-18 | As an RCWU, I want time-window toggles on the ratio and grabs charts (7d / 30d / 90d), so I can see longer trends. | P1 |
| US-19 | As an RCWU, I want the disk usage bar to show both my Harvester share AND total disk usage, so it isn't misleading. | P0 |
| US-20 | As an RCWU, I want a "seeding time" KPI tile, so I can see the lifetime time-on-share that drives bonus accrual. | P2 |
| US-21 | As an RCWU, when I open a torrent in the drawer and it was skipped, I want to see WHY it was skipped, so I can adjust rules without grepping logs. | P1 |
| US-22 | As an RCWU, I want to schedule rule sets to be active only at certain hours/days, with a UI editor (not just JSON). | P2 |
| US-23 | As an RCWU, I want to receive Discord/Telegram/ntfy notifications when something noteworthy happens, so I don't have to keep the web UI open. | P2 |
| US-24 | *(removed from v2 — backtest mode; now N19.)* | — |
| US-25 | As an RCWU, I want to export and re-import my rule sets as JSON files, so I can back them up. | P2 |
| US-26 | As an RCWU/HSSH, when I pause grabs and then restart Harvester, I want grabs to remain paused, so my intent is honored. | P0 |
| US-27 | As an HSSH, I want a Prometheus-format `/metrics` endpoint, so I can scrape Harvester from my home-lab Grafana. | P2 |

---

## 6. Functional Requirements (FR-V2-*)

This section adds requirements; v1 FRs in `old/PRD.md` remain authoritative.

### 6.1 Trust-boundary & data integrity (P0)

- **FR-V2-01** Every POST/PUT/DELETE route MUST `zod.parse(req.body)` before any side effect. ZodError MUST be translated into `400 VALIDATION_FAILED` via the existing `ApiResponse` envelope. (Source: `old/TECH_DEBT.md` C3.)
- **FR-V2-02** `writeConfig` MUST `fsync(fd)` on the temp file and `fsync(dirFd)` on POSIX before unlinking the old. On any error in the write/rename path, the temp file MUST be unlinked. (Source: TECH_DEBT C1, H7.)
- **FR-V2-03** `service_state` MUST persist a distinct `user_intent: 'running' | 'paused'` field that is NOT overwritten by preflight on boot. Boot logic MUST honor `user_intent === 'paused'` and skip worker startup. (Source: STATUS K4 / Brainstorm B1.)
- **FR-V2-04** `torrent_events` MUST have a partial covering index on `infohash WHERE infohash IS NOT NULL` and a composite index on `(mteam_id, seen_at DESC)`. (Source: TECH_DEBT H4.)
- **FR-V2-05** `db/migrate.ts` MUST refuse to start if the applied migration sequence has gaps. (Source: TECH_DEBT M11.)
- **FR-V2-06** Fastify root `bodyLimit` MUST be set explicitly (256 KB default) with per-route override on `/api/rules*` (1 MB) for large rule-set JSON. (Source: TECH_DEBT M4.)

### 6.2 Auth & long-lived connection safety (P0/P1)

- **FR-V2-07** Long-lived bearer tokens MUST NOT appear in URL query strings, `Referer` headers, server access logs, or browser history. (Source: TECH_DEBT C2.)
- **FR-V2-08** SSE connections MUST be authorized via a short-lived (≤60 s) one-shot opaque ticket minted by an authenticated `POST /api/sse-ticket` and consumed by `?ticket=…` on the SSE URL. The Fastify request logger MUST scrub `ticket=*` from `req.url` before persisting. (Source: TECH_DEBT C2.)
- **FR-V2-09** All outbound `fetch` in `src/qbt/client.ts` and `src/workers/downloader.ts` MUST go through a `fetchWithTimeout` helper with sensible defaults (15 s connect, 30 s total). Timer MUST be `.unref()`'d. (Source: TECH_DEBT H1, L3.)
- **FR-V2-10** `qbt.ensureSession()` MUST single-flight via a module-level promise to prevent concurrent re-auth. Apply same pattern to the 403-recovery path. (Source: TECH_DEBT H2.)
- **FR-V2-11** SSE handlers in `src/http/routes/service.ts` and `src/http/routes/logs.ts` MUST `bus.off(...)` on `reply.raw.on('close', …)` AND on any write-failure catch. The `bus` MaxListeners cap MUST be removed (or set to `Infinity`); leak detection moves to a metrics counter. (Source: TECH_DEBT H3.)
- **FR-V2-12** All retry schedules in `src/util/retry.ts` MUST include `+ random(0, base)` jitter. All worker timer loops MUST stagger their first tick by ±15%. (Source: TECH_DEBT H6.)
- **FR-V2-13** Frontend SHOULD load with a strict `Content-Security-Policy` header (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`). Auth token SHOULD be moved out of `localStorage` to in-memory + `sessionStorage` (tab-scoped) with a silent re-login on refresh. (Source: TECH_DEBT H5.)
- **FR-V2-14** Mutating routes SHOULD enforce a double-submit CSRF token paired with the auth-token-relocation work in FR-V2-13. (Source: TECH_DEBT M5.)
- **FR-V2-15** All modals (`LoginModal`, torrent drawer, rules dry-run drawer) MUST trap focus and close on `Esc`. Focus MUST be restored to the previously focused element on close. (Source: TECH_DEBT H8.)

### 6.3 Dashboard v2 (P0/P1)

This section delegates to `old/DASHBOARD_UI_HANDOFF.md` for component specs; only the DELTA from `old/DASHBOARD_UI_HANDOFF.md` is enumerated below.

- **FR-V2-16** New shared primitive: `<SegmentedControl>` (handoff §B.4.1) MUST be added to `web/src/components/ui/`. `SpeedCard`'s inline linear/log toggle MUST be migrated to use it. (Source: HANDOFF §B.4.1.)
- **FR-V2-17** New KPI tiles `UPLOADED` and `DOWNLOADED` (handoff §B.4.2) MUST appear in the strip with 24-h delta pills. Strip grid MUST grow to 8 tiles, wrapping 4×2 at `lg`. (Source: HANDOFF §B.4.2.)
- **FR-V2-18** New KPI tile `SEEDING TIME` MUST be included in the strip (DASHBOARD_REVIEW §3.7). At `xl/2xl` the strip is 9 tiles; at `lg` it wraps 5+4 or 4+5. Final placement is at the engineer's discretion within `V2_Implementation §4.2.4`. (Source: DASHBOARD_REVIEW §3.7. **Delta from handoff §B.2** which specifies 8 tiles.)
- **FR-V2-19** `DiskTile` (handoff §B.4.3) MUST render the dual-bar visual (full-disk used + Harvester share). Backend `freeGib()` MUST be extended to `diskStats(): {freeGib, totalGib, usedGib}`. (Source: HANDOFF §B.4.3.)
- **FR-V2-20** `VolumeButterflyChart` (handoff §B.4.4) MUST be added with `7d|14d|30d|90d` window. Backed by new endpoint `GET /api/stats/profile-volume?days=N` whose SQL is specified in `V2_Implementation §3.7`. (Source: HANDOFF §B.4.4, REVIEW §4.4.)
- **FR-V2-21** `RulePerformanceBar` (handoff §B.4.5) MUST be added; wires existing `/api/stats/ruleset-performance`. Click-through MUST navigate to `/rules#id={ruleId}`. (Source: HANDOFF §B.4.5.)
- **FR-V2-22** `StateStripBar` (handoff §B.4.6) MUST be added between the KPI strip and the chart grid; wires existing `/api/stats/torrent-states`. (Source: HANDOFF §B.4.6.)
- **FR-V2-23** `AccountHealthBanner` (handoff §B.4.7) MUST render above the KPI strip when `warned || leech_warn` is true. Banner MUST be dismissable; dismissal MUST be keyed by `(condition-hash, snapshot-ts)`. (Source: HANDOFF §B.4.7.)
- **FR-V2-24** `RatioChart` MUST gain a `1h|24h|7d|30d` `<SegmentedControl>`; `GrabsChart` MUST gain a `7d|14d|30d|90d` `<SegmentedControl>`. Hooks MUST hoist the window value into state and include it in the TanStack Query key. (Source: HANDOFF §B.4.9, TECH_DEBT M9.)
- **FR-V2-25** `SpeedCard` `refetchInterval` MUST be changed from 10 s to 60 s. (Source: REVIEW §3.2.)
- **FR-V2-26** `DiscountBadge` MUST use CSS variables (no raw hex); `PERCENT_30` MUST be removed everywhere. The discount-color map MUST live in a single shared module `web/src/lib/discount.ts`. (Source: HANDOFF §B.4.10, TECH_DEBT M7.)
- **FR-V2-27** Dashboard 12-column grid layout per HANDOFF §B.2 MUST be applied as the final step after all individual components are in place. (Source: HANDOFF §B.2.)
- **FR-V2-28** `IconBtn` in DownloadsTable rows MUST set `aria-label` in addition to `title`. (Source: HANDOFF §B.10, TECH_DEBT M15.)
- **FR-V2-29** `DashboardPage.tsx` MUST be split into `web/src/components/dashboard/*` (one file per major widget). Page file MUST be < 300 LoC. Same applies to `RulesPage.tsx` → `web/src/components/rules/*`. (Source: TECH_DEBT M6.)

### 6.4 Backend data layer (P0/P1)

- **FR-V2-30** Migration `0003_profile_snapshot_extras.sql` MUST add the columns `warned INTEGER NOT NULL DEFAULT 0`, `leech_warn INTEGER NOT NULL DEFAULT 0`, `vip INTEGER NOT NULL DEFAULT 0`, `seedtime_sec INTEGER`, `leechtime_sec INTEGER` to `profile_snapshots`. (Source: HANDOFF §B.12, REVIEW §3.6, §3.7.)
- **FR-V2-31** `normalizeMTeamProfile` MUST extract the new fields from the raw payload and write them on every snapshot. (Source: REVIEW §6.1.)
- **FR-V2-32** `DashboardSummary` (in `shared/types.ts`) MUST gain `uploaded_bytes_total`, `uploaded_bytes_24h`, `uploaded_bytes_delta_24h`, the same three for downloaded, plus `disk_total_gib`, `account_warned`, `account_leech_warn`, `account_vip`, `seedtime_sec`, `seedtime_sec_delta_24h`. All fields MUST be additive + nullable. (Source: HANDOFF §B.12, REVIEW §4.2.)
- **FR-V2-33** New endpoint `GET /api/stats/profile-volume?days=N` MUST exist with the SQL given in `V2_Implementation §3.7` (uses `LAG()` window function over the per-day max of `uploaded_bytes/downloaded_bytes`). (Source: REVIEW §4.4.)
- **FR-V2-34** `statsDailyRollup` MUST redefine `stats_daily.{uploaded,downloaded}_bytes` as **per-day deltas** computed from `profile_snapshots`, NOT from qBt's session-cumulative counters. (Source: REVIEW §3.10.)
- **FR-V2-35** `dashboard.summary` route MUST compute the 24h grab delta as a single `SELECT CASE WHEN ... THEN 1 ELSE 0 END` aggregate (not two separate queries). (Source: TECH_DEBT M10.)

### 6.5 Pause-state persistence (P0 — trust)

- **FR-V2-36** `serviceState` MUST persist `{ desired: 'running' | 'paused', system: 'running' | 'paused' | 'preflight_failed', reason: string }`. The boot path MUST NOT overwrite `desired`. Preflight failure sets `system` only. (Source: STATUS K4, Brainstorm B1.)
- **FR-V2-37** `POST /api/service/pause` MUST set `desired = 'paused'`. `POST /api/service/resume` MUST set `desired = 'running'`. `POST /api/service/restart` MUST preserve `desired`. (Source: derived from FR-V2-36.)
- **FR-V2-38** Worker manager MUST NOT start any worker while `desired === 'paused'`. (Source: derived.)

### 6.6 "Why skipped?" panel (P1)

- **FR-V2-39** Torrent detail drawer MUST display the most recent `rejection_reason` for the torrent (if any), the matched/unmatched rule-set names, and a timestamp. Source rows: `torrent_events WHERE infohash = ? OR mteam_id = ? ORDER BY seen_at DESC LIMIT 5`. (Source: Brainstorm B2; relies on FR-V2-04 index for performance.)
- **FR-V2-40** Where `rejection_reason` is set, the panel MUST resolve a human-readable explanation from a static lookup map (e.g., `min_seeders_not_met → "Below min seeders threshold (rule: ${ruleName})"`). (Source: Brainstorm B2; lookup keys derived from `src/rules/evaluator.ts`.)

### 6.7 Schedule editor UI (P2)

- **FR-V2-41** RulesPage MUST gain a `<ScheduleEditor>` accordion mapping to the existing `Schedule` shape consumed by `src/util/time.ts::isScheduleActive`. UI MUST support: weekday selection (Mon–Sun), time ranges per day, multiple ranges per day, and a "Always active" toggle. (Source: STATUS S1.)
- **FR-V2-42** Backend evaluator changes MUST NOT be necessary; the schedule shape is already supported.

### 6.8 Webhook notifications (P2)

- **FR-V2-43** New settings panel `Notifications → Webhooks` MUST allow per-category webhook URLs across the 7 toast categories already defined in v1. Supported targets: Discord webhook, Telegram bot, ntfy.sh topic. (Source: Brainstorm B4.)
- **FR-V2-44** Backend `webhookDispatcher` MUST subscribe to the same `bus` events that drive in-app toasts and send formatted payloads via outbound HTTP using `fetchWithTimeout`. (Source: Brainstorm B4.)
- **FR-V2-45** Webhook delivery MUST NOT block the originating event handler. Failures MUST be logged but not retried more than 3× with exponential backoff. (Source: derived.)

### 6.9 Rule-set import/export (P2)

- **FR-V2-46** RulesPage MUST gain "Export" (downloads JSON) and "Import" (file upload) buttons. Import MUST validate against the existing zod rule schema before upsert. (Source: Brainstorm B6.)
- **FR-V2-47** Export format MUST be the canonical rule-set JSON already used by the Monaco editor (no transformation). (Source: derived.)

### 6.10 Prometheus exposition (P2)

- **FR-V2-48** `GET /api/metrics` MUST gain a content-negotiation switch: `Accept: text/plain; version=0.0.4` returns Prometheus exposition format; default and `Accept: application/json` continue to return the existing snapshot JSON. (Source: STATUS S9, Brainstorm B5.)
- **FR-V2-49** Existing Counter / Gauge / Histogram primitives in `src/observability/metrics.ts` MUST gain a `.toPrometheus()` serialization. Naming: snake_case, `harvester_` prefix. Histograms emit `_bucket`, `_sum`, `_count`. (Source: derived; standard prom-client convention.)

### 6.11 Backtest / replay mode — REMOVED FROM V2

FR-V2-50, FR-V2-51, FR-V2-52 are removed from v2 scope per user decision (Phase 4 cut). The IDs are reserved — do not reuse. If backtest returns in a future release, author new FR-V2-* IDs beyond the current range.

### 6.12 Frontend resilience & polish (drive-by)

- **FR-V2-53** All chart components MUST wrap data + gradient IDs in `useMemo` to avoid recreation on every render. (Source: TECH_DEBT M8.)
- **FR-V2-54** TanStack Query queries MUST set `staleTime` (typically equal to `refetchInterval`) and `structuralSharing: true`; queries inside React.StrictMode MUST be cancellable on unmount via AbortController. (Source: TECH_DEBT M9.)
- **FR-V2-55** All log-level chips and discount-tag backgrounds MUST clear WCAG AA contrast (≥ 4.5:1 for text). The `--text-muted` token MAY be bumped to `#a1a1aa` to reach this. (Source: TECH_DEBT M14.)
- **FR-V2-56** Empty and error states MUST contain one sentence of recovery guidance. (Source: TECH_DEBT M16.)
- **FR-V2-57** SSE EventSource reconnect MUST use capped exponential backoff with jitter (not browser-default no-backoff). (Source: TECH_DEBT L5.)
- **FR-V2-58** Bulk-action toast SHOULD report per-item success/failure (not aggregate ok before checking). (Source: TECH_DEBT L6.)

### 6.13 Concurrency & TZ (drive-by)

- **FR-V2-59** Poll loop MUST lock the interval at tick start and schedule the next tick from `lastTickEnd + interval`, not from the moment of trigger. (Source: TECH_DEBT M1.)
- **FR-V2-60** All elapsed-timing measurements MUST use `performance.now()`; wall-clock timestamps continue to use `Date.now()`. (Source: TECH_DEBT M2.)
- **FR-V2-61** `todayLocal()` in `statsDailyRollup` MUST use `date-fns-tz` with the configured user TZ (matching `src/util/time.ts:85`). (Source: TECH_DEBT M3.)

### 6.14 Logger & DB hygiene (P2)

- **FR-V2-62** SQLite log sink MUST batch writes (100 lines or 250 ms, whichever first) inside `BEGIN/COMMIT`. Buffer overflow MUST emit `log.dropped` metric. (Source: TECH_DEBT M13.)
- **FR-V2-63** `stats_daily` rows older than 2 years MAY be pruned by a monthly job. (Optional; 3.7 KB/year footprint.) (Source: TECH_DEBT M12.)
- **FR-V2-64** Initial rule-name migration: rule-sets named `default` MUST be renamed to `FREE and 2X_FREE` on first boot after the change. Version-gated; no-op after first run. (Source: STATUS K1.)

---

## 7. Phased Plan

**Phases 0–3 are all mandatory for v2.** Each phase is independently shippable — a phase produces a release candidate; user smoke-tests; if green, the next phase begins. v2 is feature-complete when Phase 3 exit criteria are green. Phase 4 was removed from scope.

### Phase 0 — Stop-ship class (~2 ideal days) — **mandatory**

Lands trust + correctness fixes that are dangerous to defer.

**In scope:**
- C1 atomic config + H7 (FR-V2-02)
- C2 SSE ticket (FR-V2-07, FR-V2-08)
- C3 zod validation on all mutating routes (FR-V2-01)
- B1 / K4 pause-state persistence (FR-V2-03, FR-V2-36, FR-V2-37, FR-V2-38)
- H4 `0003_indexes` migration (FR-V2-04)
- M11 migration gap check (FR-V2-05)
- M4 Fastify `bodyLimit` (FR-V2-06)

**Exit criteria:**
- A simulated mid-write crash leaves config intact (manual test).
- `?token=<bearer>` no longer accepted on any SSE route; bearer scrubbed from `req.url`.
- Every mutating route returns 400 `VALIDATION_FAILED` for malformed input.
- After `pause → kill -9 → restart`, service starts in `paused` state.
- `EXPLAIN QUERY PLAN` on infohash lookups shows index use.
- Process refuses to start if migration sequence has gaps.

### Phase 1 — Backend resilience + dashboard data layer (~3 ideal days) — **mandatory**

Lands the backend changes the dashboard depends on, plus general resilience.

**In scope:**
- H1 `fetchWithTimeout` (FR-V2-09)
- H2 single-flight login (FR-V2-10)
- H3 SSE listener cleanup (FR-V2-11)
- H6 retry jitter + worker stagger (FR-V2-12)
- D15 `diskStats()` (FR-V2-19 backend)
- D16 normalize warned/leech_warn/vip/seedtime/leechtime (FR-V2-31)
- D17 migration `0003_profile_snapshot_extras` (FR-V2-30)
- D18 extend `DashboardSummary` (FR-V2-32)
- D19 new `/api/stats/profile-volume` (FR-V2-33)
- D20 mirror types in `shared/types.ts`
- D21 redefine `stats_daily` deltas (FR-V2-34)
- M1 poll-cycle reentrancy (FR-V2-59)
- M2 performance.now (FR-V2-60)
- M3 TZ-aware rollup (FR-V2-61)
- M10 single-query delta (FR-V2-35)
- L1 argon2 bench (drive-by)
- L3 .unref() timers (drive-by)
- L8 MTEAM_FORBIDDEN_METHOD wording (drive-by)
- K1 rule name migration (FR-V2-64)
- **Backend unit tests** (minimal): evaluator, grab loop, `writeConfig`, auth password verify, `fetchWithTimeout`. ~10–15 tests total.

**Exit criteria:**
- All new `DashboardSummary` fields populate in a freshly probed account.
- `GET /api/stats/profile-volume?days=14` returns 14 rows with correct deltas.
- qBt forced to hang (kill -STOP) wedges no worker; 30 s later the worker error-paths.
- Dual concurrent qBt requests result in exactly one login call.
- After full outage simulation, retry timing variance is observable (jitter present).
- Backend unit tests pass.

### Phase 2 — Dashboard v2 frontend (~3 ideal days) — **mandatory**

Implements the dashboard redesign.

**In scope:**
- M6 split DashboardPage + RulesPage (refactor concurrent with extraction) (FR-V2-29)
- M7 shared `web/src/lib/discount.ts` (FR-V2-26)
- D1 `<SegmentedControl>` primitive (FR-V2-16)
- D2 Upload/Download KPI tiles (FR-V2-17)
- D3 `DiskTile` dual-bar (FR-V2-19)
- D4 `VolumeButterflyChart` (FR-V2-20)
- D5 `RulePerformanceBar` (FR-V2-21)
- D6 `StateStripBar` (FR-V2-22)
- D7 `AccountHealthBanner` (FR-V2-23)
- D9 `DiscountBadge` tokenization (FR-V2-26)
- D10 `SpeedCard` refactor + 60 s refetch (FR-V2-25, FR-V2-16)
- D11 `RatioChart` time-window (FR-V2-24)
- D12 `GrabsChart` time-window (FR-V2-24, FR-V2-26)
- D13 12-col grid re-layout (FR-V2-27)
- D14 IconBtn aria-label (FR-V2-28)
- D22 Seeding time KPI tile (FR-V2-18)
- M8 memoize recharts (FR-V2-53)
- M9 TanStack Query staleTime (FR-V2-54)
- M14 contrast bumps (FR-V2-55)
- M15 ARIA drop-ins (FR-V2-15 modal trap goes to Phase 3; this is just `aria-current`, `role=status`, `scope=col`)
- M16 empty/error recovery copy (FR-V2-56)
- L4 dead useEffect removal (drive-by)
- L6 toast failure mapping (FR-V2-58)
- L7 Monaco a11y verification (drive-by)

**Exit criteria:**
- All 9 KPI tiles render with correct values on a primed account.
- DiskTile renders both bars; near-full disk turns red.
- VolumeButterflyChart populates with 14 d data; window switcher works.
- AccountHealthBanner appears when `warned=1` is forced in the DB; dismisses; reappears on next snapshot.
- DashboardPage and RulesPage source files each < 300 LoC.
- No remaining hardcoded discount-color hex anywhere.
- Light + dark visual parity confirmed by spot check.

### Phase 3 — Auth hardening + UX features (~3 ideal days) — **mandatory**

Lands the security closure work and the highest-value brainstorm features that fit in small chunks.

**In scope:**
- H5 + M5 CSP + token relocation + CSRF (FR-V2-13, FR-V2-14)
- H8 useFocusTrap on three modals (FR-V2-15)
- M13 batched SQLite log sink (FR-V2-62)
- M12 stats_daily prune (optional) (FR-V2-63)
- L5 EventSource backoff (FR-V2-57)
- B2 Why-skipped panel in torrent drawer (FR-V2-39, FR-V2-40)
- S1 Schedule editor UI (FR-V2-41, FR-V2-42)
- B4 Webhook notifications (FR-V2-43, FR-V2-44, FR-V2-45)
- B6 Rule-set import/export (FR-V2-46, FR-V2-47)
- S9 / B5 Prometheus exposition (FR-V2-48, FR-V2-49)

**Exit criteria:**
- CSP header present on every response; in-browser console shows no CSP violations.
- Token survives in memory only; new tab requires re-login (or refresh-token flow).
- Tab + Shift-Tab cycles within each modal; Esc closes; focus restored on close.
- Webhook configured for `grab_success` to a Discord URL fires on next grab; payload renders correctly.
- `GET /api/metrics` with `Accept: text/plain` returns valid Prom exposition (passes `promtool check metrics`).
- Schedule editor saves and the evaluator honors the schedule.
- Why-skipped panel shows the rejection reason for any skipped torrent in the drawer.

### Phase 4 — REMOVED FROM V2

Previously scoped as backtest/replay mode. Removed per user decision; not shipping in v2. V2 is considered feature-complete at the end of Phase 3.

---

## 8. Acceptance Criteria

A v2 release is acceptance-ready when **all four phases (0, 1, 2, 3) are shipped green** — they are all mandatory for v2:

1. All P0 FRs (§6.1, §6.5, P0 portions of §6.3, §6.4) ship green per phase exit criteria.
2. All P1 FRs (remainder of §6.3 + §6.6) ship green.
3. All P2 FRs (§6.7–§6.10, §6.14) ship green.
4. All P3 FRs that remain in scope (§6.2 auth hardening) ship green.
5. Phase 0–2 backend unit tests pass.
6. Manual smoke checklist passes:
   - First-run wizard completes against live M-Team + qBt.
   - Pause + restart preserves paused state.
   - Dashboard renders correctly with `warned=0` and `warned=1` test states.
   - Rule edit + dry-run flow works.
   - Logs page tails live entries.
   - Schedule editor saves a rule-set with a Mon–Fri 9am–5pm window and the evaluator honors it.
   - Webhook for `grab_success` fires to a test Discord URL.
   - `GET /api/metrics` with `Accept: text/plain` passes `promtool check metrics`.
7. No regression in v1 G1–G6.

Phases are shippable individually as release candidates (user smoke-tests between phases), but v2 is not considered complete until Phase 3 exit criteria are met. Phase 4 (formerly backtest) is removed from v2 scope.

---

## 9. Dependencies / Sequencing

```
Phase 0 ──► Phase 1 ──► Phase 2
                  │
                  └────► Phase 3
```
(Phase 4 removed.)

Hard dependencies:

| Item | Depends on |
|------|------------|
| D2, D7, D22 | D17 (migration 0003) → D16 (normalizer) → D18 (DashboardSummary) |
| D3 | D15 (diskStats) |
| D4 | D19 (profile-volume endpoint) → D1 (SegmentedControl) |
| D5, D11, D12, D10 | D1 (SegmentedControl) |
| D9, D12 | M7 (shared discount lib) |
| D13 (grid re-layout) | D2, D3, D4, D5, D6, D7 (all components exist first) |
| H5 | M5 (paired) |
| B2 | H4 (infohash index for performance) |
| B4, FR-V2-49 (webhooks payload) | H1 (fetchWithTimeout) |

Soft dependencies (prefer to do together):

- M6 (component split) is most efficient when extracting each component as part of D2…D7 work, not as a standalone refactor.
- M7 (shared discount lib) is most efficient when D9/D12 land.
- M14/M15/M16 (a11y/contrast/copy) drive-by during Phase 2.
- L4/L6/L7 drive-by during Phase 2.
- L1/L3/L8 drive-by during Phase 1.

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration 0003 fails on a real DB with corrupt rows | Low | High | Migration runs inside transaction; gap check (M11) prevents partial state. |
| SSE ticket flow regresses in-browser SPA on token refresh | Medium | Medium | Phase 0 manually tested with extended-uptime browser tab + Wi-Fi flap. |
| `D21` redefinition of `stats_daily.{uploaded,downloaded}_bytes` invalidates historical rows | High (intentional) | Low | Documented in code; chart renders from cutover date forward. |
| Webhook secrets in config.json are user-readable | Medium | Low | Config file is `0o600`; document in NOTIFICATIONS section that webhook URLs grant write access to the destination. |
| Pause-state migration on existing DBs | Medium | Medium | Migration default value: `desired = 'running'` for legacy rows; user must explicitly pause to opt into new behavior. |
| CSP breaks Monaco | Medium | Medium | Monaco is loaded from CDN today; either inline its loader, self-host it, or relax `script-src` to include the CDN. Decision deferred to Phase 3. |

---

## 11. Cross-walk: D-IDs ↔ Source Doc Sections

| D-ID | Source |
|------|--------|
| D1 | HANDOFF §B.4.1 |
| D2 | HANDOFF §B.4.2, REVIEW §4.1 |
| D3 | HANDOFF §B.4.3, REVIEW §3.3 |
| D4 | HANDOFF §B.4.4, REVIEW §4.4 |
| D5 | HANDOFF §B.4.5, REVIEW §3.5 |
| D6 | HANDOFF §B.4.6, REVIEW §3.11 |
| D7 | HANDOFF §B.4.7, REVIEW §3.6 |
| D8 | HANDOFF §B.4.8, REVIEW §3.8 — **dropped (N16)** |
| D9 | HANDOFF §B.4.10, REVIEW §3.9 |
| D10 | HANDOFF §B.4.9, REVIEW §3.2 |
| D11 | HANDOFF §B.4.9, REVIEW §3.4 |
| D12 | HANDOFF §B.4.9, REVIEW §3.4, §3.9 |
| D13 | HANDOFF §B.2 |
| D14 | HANDOFF §B.10 |
| D15 | HANDOFF §B.4.3, §B.12 backend, REVIEW §3.3 |
| D16–D20 | HANDOFF §B.12, REVIEW §3.6, §3.7, §4.2 |
| D21 | REVIEW §3.10 |
| D22 | REVIEW §3.7 (additive beyond HANDOFF) |

---

## 12. References

- `old/PRD.md` v1.0 — baseline product requirements.
- `old/STATUS.md` — what shipped through v1.
- `old/TECH_DEBT.md` — full audit, all C/H/M/L items.
- `old/DASHBOARD_REVIEW.md` — dashboard rationale + SQL.
- `old/DASHBOARD_UI_HANDOFF.md` — dashboard component spec.
- `old/UI_DESIGN.md` — token + component library.
- `old/UI_HANDOFF.md` — v1 frontend handoff.
- `old/ARCHITECTURE.md` — ADRs.
- `old/IMPLEMENTATION.md` — v1 build plan.
- `old/MTEAM_API.md` — API surface used.
- `V2_Implementation.md` — engineering plan that consumes this PRD.

*End of PRD_V2_Update.md.*
