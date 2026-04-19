# Harvester — Product Requirements Document (PRD)

> **Doc ID:** PRD.md
> **Version:** 1.0 (authoritative for v1 scope)
> **Audience:** Downstream AI authors (UI design, design handoff, architecture, implementation). Not human-facing.
> **Format:** Dense, precise, unambiguous. Redundancy preferred to ambiguity.
> **Cross-refs:** `UI_DESIGN.md`, `UI_HANDOFF.md`, `ARCHITECTURE.md`, `IMPLEMENTATION.md`.
> **Source material:** `mteam-autopilot-initial-plan.md` (uploaded) + brainstorm decisions captured below.

---

## 0. Document Conventions

- **P0** = must-ship in v1. **P1** = v1.1 fast-follow. **P2** = v2+ architectural-hook only, not implemented in v1.
- **MUST / MUST NOT / SHOULD / MAY** are RFC-2119 keywords.
- All timestamps are unix seconds unless suffixed `_ms`.
- All byte sizes are IEC (GiB, MiB). All transfer rates are IEC per second (MiB/s).
- All regex is PCRE, Unicode-aware (`u` flag), case-insensitive unless specified.
- `null` and missing fields in API responses MUST be treated identically by the filter.
- Time zone for user-visible dates: system local. Time zone for stored data: UTC.

---

## 1. Product Summary

**Name:** Harvester. Finalized. Use verbatim in UI, logs, package name, window title.

**One-line pitch:** Local-only, Windows-first service that watches M-Team for new freeleech / 2x-free torrents, filters them against user rules, dispatches to qBittorrent, and manages their lifecycle to accumulate upload credit without paid-download debt.

**Shape:** Node.js 20 LTS background process + SQLite + React SPA served over HTTP at `http://127.0.0.1:<port>`. User launches via `start.bat` / `start.sh`. No service install, no tray icon, no auto-start in v1.

**Not shipped in v1:** Tauri wrapper, LAN binding, auth, Telegram hooks, Prometheus metrics, multi-tracker, multi-qBittorrent, mobile/remote UI.

---

## 2. Problem Statement

M-Team's ratio economy punishes passive users: tier thresholds at 4/8/12/16 weeks post-registration, minimum ratio rises with total download volume, failure triggers a 5-day warning then account deletion. The only economically positive way to grow ratio is to grab freeleech and 2x-free torrents while the swarm is still leecher-heavy — typically the first 30–180 minutes of a torrent's life. Manual monitoring does not scale. Existing tools (`MTeam-Genie`, `FreeTorrents-MTeam`) are CLI-only, Linux-server-first, or Telegram-only, none fit a Windows desktop user who wants a visual control surface.

Cost of not solving: user abandons account or manually hovers on the site. Both are bad outcomes.

---

## 3. Personas

### 3.1 Primary — "Ratio-Conscious Windows User" (RCWU)
- OS: Windows 10/11 desktop.
- Technical: Can install Node.js, run a `.bat` file, read a dashboard. Cannot be expected to use git, write JSON by hand, or read stack traces.
- Context: Already has qBittorrent running locally on `127.0.0.1:8080`. Already has M-Team API key provisioned under Lab → Access Token. Runs PC overnight. Has ≥ 500 GB free on target drive.
- Goal: Leave Harvester running; wake up to higher ratio, no ban notifications.
- Anti-goals: Does not want to search M-Team from our UI. Does not want to manage individual torrents. Does not want to learn a DSL.

### 3.2 Secondary — "Home Server Self-Hoster" (HSSH)
- OS: Windows/Linux NAS or mini-PC.
- Runs headless. Visits UI from a LAN browser occasionally.
- **v1 behavior for HSSH:** Phase 1–2 binds `127.0.0.1` only. Phase 3 (v1.1) ships LAN binding + password auth (see §7.9) so HSSH can reach the UI from another LAN host (desktop, phone on wifi) without SSH/RDP tunneling. Still no cloud/internet exposure, still single-user.

### 3.3 Out-of-scope for v1
- New M-Team registrants (need to pass newbie threshold manually before automation is safe).
- Casual users who do not know what a share ratio is.
- Mobile users. Multi-user deployments. SaaS tenancy.

---

## 4. Goals

G3 from source plan is replaced because "ratio ≥ 3.0 while downloading only freeleech" is mathematically trivial (denominator is roughly fixed). Replaced with upload throughput metrics.

| # | Goal | Measurable outcome | Measurement window |
|---|------|--------------------|--------------------|
| G1 | Detect and grab qualifying torrents fast | ≥ 95% of torrents that match an enabled rule-set are grabbed within 180 s of their M-Team publication timestamp | rolling 7 days |
| G2 | Never download a paid torrent unintentionally | 0 grabs where `discount ∉ {FREE, _2X_FREE, _2X, PERCENT_50, PERCENT_30}` when the rule-set's discount whitelist does not include that value | over tool lifetime |
| G3 (NEW) | Sustain positive upload throughput | Median user's 7-day rolling upload average ≥ 5 GiB/day while the service is active and the account tier permits | 30-day observation |
| G4 | Visibility | User can answer "what's happening right now" in ≤ 2 clicks from any page | usability review |
| G5 | Safety | 0 account warnings/bans attributable to Harvester across the user base | tool lifetime |
| G6 (NEW) | Emergency ratio preservation | When site ratio drops within 0.2 of the account-tier minimum, Harvester MUST pause polling and notify. No user intervention required to trigger. | 100% of threshold crossings |

---

## 5. Non-Goals (v1)

| # | Non-goal | Rationale |
|---|----------|-----------|
| N1 | General-purpose BitTorrent client | qBittorrent is the engine; we orchestrate |
| N2 | Multi-tracker support | M-Team only in v1; adapter abstraction deferred to v2 |
| N3 | Torrent search/browse UI | User searches on M-Team site; we only run the automated pipeline |
| N4 | Cloud / public-internet / multi-user access | No cloud, no multi-user. LAN access IS supported in v1 via password auth (Phase 3, §7.9) — it is explicitly NOT a non-goal. |
| N5 | Cloud / SaaS | Runs on user's own machine |
| N6 | Tracker-rule editor or evader | Honor M-Team rules verbatim |
| N7 | Auto-start on Windows boot / system service / tray icon | v1 ships manual launch via script; `pm2` / service wrapping is user's choice |
| N8 | Multi-account, multi-profile | Single M-Team account per install; multiple installs if needed |
| N9 | In-app updater | Manual update (git pull / re-download) in v1 |
| N10 | Telemetry, analytics, crash reporting | Never. No phone-home, ever. |
| N11 | Bilingual UI | English only in v1. Regex engine MUST still be Unicode-aware for title matching |

---

## 6. User Stories

### 6.1 RCWU stories (primary)

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As an RCWU, I want to paste my M-Team API key and qBt credentials once and see the connection validate before polling starts, so I know it will actually work. | P0 |
| US-02 | As an RCWU, I want Harvester to auto-grab any new FREE or 2X-FREE torrent within my size range without me configuring anything else, so I get value out of the box. | P0 |
| US-03 | As an RCWU, I want a dashboard that shows current ratio, today's upload, active grabs, and disk free, so I can glance and leave. | P0 |
| US-04 | As an RCWU, I want completed torrents to be auto-removed once they've served their purpose, so my disk doesn't fill. | P0 |
| US-05 | As an RCWU, I want a single red button that stops all polling immediately, so I can halt the tool instantly when something looks wrong. | P0 |
| US-06 | As an RCWU, I want a live log tail, so I can see what Harvester is doing right now. | P0 |
| US-07 | As an RCWU, I want the tool to detect when my ratio is dangerously close to the tier minimum and auto-pause, so I don't get a warning. | P0 |
| US-08 | As an RCWU, I want to edit my rules in a form with validated inputs, so I can tweak behavior without writing JSON. | P0 |
| US-09 | As an RCWU, I want to see historical upload per day and ratio trajectory in charts, so I can verify the tool is earning. | P1 |
| US-10 | As an RCWU, I want a "dry-run" button that shows what would have been grabbed over the last 200 seen torrents under a proposed rule change, so I can tune rules safely. | P1 |
| US-11 | As an RCWU, I want keyboard shortcuts (`g d`, `g t`, `g l`, `/`), so I can move fast. | P1 |
| US-12 | As an RCWU, I want toast notifications for grabs and errors with mute controls, so I am not spammed. | P1 |

### 6.2 HSSH stories (secondary)

| ID | Story | Priority |
|----|-------|----------|
| US-20 | As an HSSH, I want Harvester to run headlessly with no UI interaction required after first config, so I can leave it on a NAS. | P0 |
| US-21 | As an HSSH, I want a `/api/health` endpoint that returns 200 when healthy, so I can wire it to my own monitoring. | P1 |

### 6.3 Edge / negative stories

| ID | Story | Priority |
|----|-------|----------|
| US-30 | As any user, if qBittorrent goes offline mid-run, Harvester MUST queue grab attempts and retry with backoff, not silently drop them. | P0 |
| US-31 | As any user, if the M-Team API returns ≥ 3 consecutive errors, Harvester MUST back off exponentially up to a 30-min cap and surface the error in the dashboard. | P0 |
| US-32 | As any user, if the `.torrent` URL returned by `genDlToken` has already been consumed, Harvester MUST NOT retry with the same token; it MUST fetch a fresh one. | P0 |
| US-33 | As any user, if two rule-sets match the same torrent, Harvester MUST grab exactly once and tag the torrent with both rule-set names. | P0 |
| US-34 | As any user, when the computer wakes from sleep, Harvester MUST reconcile missed poll cycles and resume without duplicate grabs. | P0 |

---

## 7. Functional Requirements

### 7.1 Poller (P0)

**FR-PO-01** Poller MUST call `POST /api/torrent/search` with `{ mode: "normal", pageSize: 50, sortBy: "createdDate desc" }` at a user-configurable interval, default 90 s, hard floor 60 s enforced in config loader (MUST reject config where `poll_interval_sec < 60`).

**FR-PO-02** Poller MUST dedupe seen torrents by `mteam_id` via the `torrent_events` table. On first sight, insert a row regardless of decision.

**FR-PO-03** Poller MUST re-evaluate torrents that were previously `SKIPPED_RULE` if **all** of:
- `now - seen_at < 3600` seconds (1 hour re-eval window),
- `discount_end_ts - now > 600` seconds (still ≥ 10 min free left),
- fewer than 3 prior re-evaluations for this `mteam_id`.

Each re-evaluation inserts a new `torrent_events` row with `decision = RE_EVALUATED_GRABBED | RE_EVALUATED_SKIPPED`.

**FR-PO-04** On ≥ 3 consecutive API errors, poller MUST enter exponential backoff: `delay = min(30min, base * 2^n)` where `base = poll_interval_sec`, `n` = consecutive-error count. Backoff resets on first success.

**FR-PO-05** Poller MUST record each cycle in `poll_runs` with `started_at`, `finished_at`, `torrents_seen`, `torrents_grabbed`, `error`.

**FR-PO-06** On wake from sleep: if `now - last_poll_at > poll_interval_sec * 3`, poller MUST immediately run one catch-up cycle without waiting for the next scheduled tick.

**FR-PO-07** Poller MUST gracefully handle Unicode torrent titles (CJK, emoji). No Latin-1 fallback. All DB writes in UTF-8.

### 7.2 Rule Engine (P0)

**FR-RE-01** Rule combination semantics:
- **Within a rule-set:** all rule conditions are AND'd. Torrent matches iff every specified condition is true.
- **Across rule-sets:** enabled rule-sets are OR'd. Torrent is grabbed iff any enabled rule-set matches.
- If multiple rule-sets match, torrent is grabbed once; all matching rule-set names are recorded in `matched_rule` (comma-separated, deterministic order by rule-set ID ascending).

**FR-RE-02** Rule schema v1 (`rules_json` column):

```json
{
  "schema_version": 1,
  "discount_whitelist": ["FREE", "_2X_FREE"],
  "min_free_hours_remaining": 4.0,
  "size_gib_min": 1.0,
  "size_gib_max": 80.0,
  "category_whitelist": null,
  "min_seeders": null,
  "max_seeders": null,
  "min_leechers": null,
  "leecher_seeder_ratio_min": null,
  "title_regex_include": null,
  "title_regex_exclude": null,
  "free_disk_gib_min": 100,
  "first_seeder_fast_path": {
    "enabled": true,
    "max_age_minutes": 10
  },
  "qbt_category": "mteam-auto",
  "qbt_tags_extra": [],
  "qbt_save_path": null,
  "qbt_upload_limit_kbps": null,
  "schedule": null,
  "lifecycle_overrides": null
}
```

Every field except `schema_version` and `discount_whitelist` is nullable; `null` means "no constraint."

**`schedule` field (Phase 2, FR-RE-07):** when non-null, restricts when this rule-set is eligible to match. Shape:

```json
"schedule": {
  "timezone": "system",                  // "system" | IANA zone name (e.g. "America/Toronto")
  "windows": [
    { "days": ["mon","tue","wed","thu","fri"], "start": "22:00", "end": "08:00" },
    { "days": ["sat","sun"], "start": "00:00", "end": "23:59" }
  ]
}
```

- `days` MUST be a non-empty subset of `["mon","tue","wed","thu","fri","sat","sun"]`.
- `start` and `end` are `HH:MM` in 24-hour clock.
- If `end < start`, the window wraps past midnight (e.g. 22:00–08:00 covers 22:00–23:59 on the listed day AND 00:00–08:00 on the next day).
- Multiple windows are OR-combined; torrent is eligible iff *any* window is currently active.
- Rule-sets without `schedule` (i.e. `null`) are always eligible — the common case.
- `lifecycle_overrides` (optional, P1) overrides §7.4 removal defaults per rule-set; schema in §7.4.7.

**FR-RE-03** Evaluation order per rule-set (short-circuit on first failure, record the first failing condition in `rejection_reason`):

1. `discount ∈ discount_whitelist`
2. `(discount_end_ts - now) / 3600 ≥ min_free_hours_remaining`
3. `size_gib_min ≤ size_bytes/2^30 ≤ size_gib_max`
4. `category ∈ category_whitelist` (if set)
5. Swarm conditions (if set): `seeders ≥ min_seeders`, `seeders ≤ max_seeders`, `leechers ≥ min_leechers`, `leechers/max(seeders,1) ≥ leecher_seeder_ratio_min`
6. `title_regex_include.test(name)` (if set)
7. `!title_regex_exclude.test(name)` (if set)
8. `free_disk_gib(qbt_save_path || default) ≥ free_disk_gib_min`

**FR-RE-04** First-seeder fast path: if `first_seeder_fast_path.enabled && torrent_age_minutes < first_seeder_fast_path.max_age_minutes && discount ∈ {FREE, _2X_FREE}`, steps 5 (swarm) are skipped. Steps 1–4 and 6–8 still apply.

**FR-RE-05** Dry-run evaluates a candidate rule-set against the last 200 rows of `torrent_events` (any decision), and returns a list of `{mteam_id, name, would_grab, failing_condition}` without writing to DB.

**FR-RE-06** Rule schema migration: any rule-set loaded with `schema_version < current` MUST be upgraded by the migrator at startup; original `rules_json` is archived to `rule_sets_archive` table before replacement.

**FR-RE-07** Scheduled rule windows (P0, Phase 2). If a rule-set's `schedule` is non-null, the engine MUST evaluate window eligibility FIRST — before the 8-step evaluation order of FR-RE-03. If no active window covers `now` (in the configured timezone), the rule-set is treated as non-matching for this torrent with `rejection_reason = 'schedule_closed'`. The rest of the 8-step short-circuit pipeline does not run for this rule-set. Other rule-sets still evaluate independently. A rule-set with `schedule = null` is unaffected. Dry-run (FR-RE-05) MUST provide a "Simulate at time T" option that overrides `now` so users can verify schedule behavior without waiting.

### 7.3 Downloader (P0)

**FR-DL-01** For a matched torrent, downloader MUST:
1. Call `qBt /api/v2/torrents/info?hashes=all` and check whether `name` or `magnet_uri` collides with any existing qBt torrent (best-effort dedup, since infohash may be unavailable pre-grab — see FR-DL-05).
2. Call M-Team `POST /api/torrent/genDlToken` with the `mteam_id`. Treat the returned URL as single-use with unknown TTL; consume immediately.
3. `POST qBt /api/v2/torrents/add` with multipart body, fields:
   - `urls`: the genDlToken URL (newline-separated if ever multiple)
   - `category`: rule-set's `qbt_category` (default `mteam-auto`)
   - `tags`: `rule:<name1>,rule:<name2>,...,discount:<DISCOUNT>,harvester`
   - `paused`: `false`
   - `savepath`: rule-set's `qbt_save_path` (if set)
   - `upLimit`: `qbt_upload_limit_kbps * 1024` if set
4. Wait up to 5 s, then re-query `qBt /api/v2/torrents/info` filtered by tag `harvester` and verify the added torrent appears. If not, log warning; do not retry the add (double-add risk).
5. Insert `torrent_events` row with `decision = GRABBED`, store full M-Team payload in `raw_payload`.

**FR-DL-02** If qBt is unreachable (connection refused, 5xx, timeout > 10 s): queue the grab in an in-memory retry queue with exponential backoff (initial 30 s, cap 10 min). Queue persisted to `grab_queue` table on process exit and restored on startup. Token in queue expires after 10 minutes of queuing; after expiry, discard and log.

**FR-DL-03** Allowed client version check: on startup and every 6 h, call `qBt /api/v2/app/version`. If the returned version does not satisfy the M-Team whitelist (encoded as a semver range in config, default `>=4.0.0 <=5.1.4` and not the Enhanced-Edition fork detectable via `/api/v2/app/buildInfo`), set global status `ALLOWED_CLIENT_WARN` and suppress new grabs. User MUST acknowledge a warning banner to override.

**FR-DL-04** If the `discount_whitelist` for the matched rule-set excludes the torrent's current discount (possible due to discount flips between search and grab), abort grab and insert `decision = SKIPPED_FLIPPED`.

**FR-DL-05** **Infohash-before-grab is NOT assumed available.** Pre-grab dedup uses M-Team `mteam_id` via `torrent_events.mteam_id` check AND qBt name+size collision check. Post-grab, infohash from qBt is backfilled into `torrent_events.infohash`.

### 7.4 Lifecycle Manager (P0)

**FR-LC-01** Runs every 300 s (5 min), wakes also on user action or process start. Queries qBt for all torrents with tag `harvester`.

**FR-LC-02** Default removal rule (also the factory default for new users):

```
remove_with_data IF (
  seed_time_seconds ≥ 259200  -- 72 h
  OR (peers_connected == 0 FOR continuous_seconds ≥ 3600)  -- 0 peers for 60 min
)
```

`peers_connected` = `num_incomplete + num_complete` from qBt. "FOR continuous" is tracked via `lifecycle_peer_state` table: on each check, if `peers_connected == 0`, update `zero_peers_since`; else clear. Threshold reached iff `now - zero_peers_since ≥ 3600`.

**FR-LC-03** Safety override: if the torrent's discount flipped to paid AND progress < 100%, lifecycle MUST immediately pause and then remove-with-data, regardless of other criteria. Rationale: never finish-leeching a paid-state torrent.

**FR-LC-04** Lifecycle MUST NOT touch qBt torrents that lack the `harvester` tag. Period.

**FR-LC-05** Lifecycle actions MUST be logged to `logs` with level INFO, component `lifecycle`, and the torrent's infohash + name.

**FR-LC-06** User can override the default per-rule via `rules_json.lifecycle_overrides` (P1, schema defined in §7.4.7).

**FR-LC-07** Removal default is **remove + data** (not pause, not remove-metadata-only). Configurable in global settings.

### 7.5 Emergency Mode (P0, G6)

**FR-EM-01** Every 15 min, Harvester MUST call `POST /api/member/profile` and persist `uploaded_bytes`, `downloaded_bytes`, current ratio, and account tier (if exposed by API).

**FR-EM-02** Tier threshold table hardcoded in config (user overridable):

| Account age (weeks) | Min ratio |
|---------------------|-----------|
| 0–4 | 0.0 |
| 4–8 | 1.0 |
| 8–12 | 2.0 |
| 12–16 | 3.0 |
| 16+ | 4.0 |

*(Final values MUST be verified against M-Team wiki during Phase 0 spike; placeholders above are indicative. If verification reveals different thresholds, update config defaults, not code.)*

**FR-EM-03** If `current_ratio < tier_min + 0.2`, Harvester MUST:
1. Set global status = `EMERGENCY_PAUSED`.
2. Stop the poller (no new grabs).
3. NOT touch existing qBt torrents. Seeding continues.
4. Surface a red banner on all UI pages.
5. Write a WARN log every 15 min until ratio recovers or user manually resumes.

**FR-EM-04** Resume conditions: ratio rises to `tier_min + 0.4` (hysteresis) OR user clicks "Resume anyway" in UI (writes `logs` entry at WARN level).

### 7.6 Web UI (P0) — see §10 for detailed spec, §12 for API

**FR-UI-01** Single-page React app, served from `/` by the Node HTTP server.
**FR-UI-02** All data over HTTP + SSE. No WebSockets in v1.
**FR-UI-03** Dark mode first-class and default; light mode toggle present but secondary.
**FR-UI-04** Default bind is `127.0.0.1` and requires no auth. If the user sets a non-empty `lan_access_password` in settings (Phase 3 feature), Harvester rebinds to `0.0.0.0` on config save and enforces bearer-token auth on every non-health endpoint per §7.9 FR-AUTH. Unset password → localhost-only. There is no other configuration path that exposes Harvester on the network — `bind_address` config key without a password is rejected at load time.

### 7.7 Observability (P0)

**FR-OB-01** Structured JSON logs: file (`./logs/harvester-YYYY-MM-DD.jsonl`, rotated daily, 14-day retention) + SQLite tail buffer (last 10k entries). UI reads from SQLite; file is for forensics.

**FR-OB-02** Log redaction: any value matching the user's configured M-Team API key, qBt password, or any substring after `Cookie: `/`Authorization: ` header labels MUST be replaced with `***REDACTED***` before write. Redactor MUST run inside the logger, not at the call site.

**FR-OB-03** Metrics counters (in-memory, exposed via `/api/metrics` as JSON):
- `poll.runs.total`, `poll.runs.errors`
- `poll.torrents.seen`, `poll.torrents.grabbed`, `poll.torrents.skipped.{reason}`
- `qbt.calls.total`, `qbt.calls.errors`, `qbt.calls.duration_ms.{p50,p95,p99}`
- `mteam.calls.total`, `mteam.calls.errors`, `mteam.calls.duration_ms.{p50,p95,p99}`
- `lifecycle.removed.total`, `lifecycle.errors`

### 7.8 Safety Guards (P0, non-negotiable)

**FR-SG-01** Hard floor 60 s poll interval. UI input MUST reject `< 60`.

**FR-SG-02** Global kill switch (red button in UI, also `POST /api/service/pause`). Stops poller; does NOT touch qBt; does NOT stop lifecycle (seeded torrents still respected). Toggle returns to `running` only on explicit user action.

**FR-SG-03** Pre-flight check on startup, blocks poller start until all pass:
- M-Team API key valid (`POST /api/member/profile` returns 200).
- qBt reachable and credentials valid (login cookie obtained).
- qBt version satisfies allowed-client range.
- Configured default save path exists and is writable.
- Free disk ≥ 10 GiB (soft warn; hard fail if < 1 GiB).

**FR-SG-04** Duplicate-submission prevention (per FR-DL-01 and FR-DL-05).

**FR-SG-05** Emergency mode (§7.5).

### 7.9 LAN Access + Authentication (P0, Phase 3)

LAN access is gated entirely by a single setting: `lan_access_password`. Absent/empty = localhost-only (original v1 behavior). Non-empty = bind `0.0.0.0` AND require bearer-token auth on every non-health API route.

**FR-AUTH-01** Binding rule:
- `lan_access_password` empty OR null → HTTP server MUST bind `127.0.0.1` only. Refuse any attempt to change `bind_address` in config.
- `lan_access_password` non-empty → HTTP server MUST bind `0.0.0.0`. No other values are valid.
- Switching between modes requires a server restart; UI SHOULD surface a "restart required" banner and a one-click restart endpoint (`POST /api/service/restart`, P0 Phase 3).

**FR-AUTH-02** Password complexity (enforced at save time, both API and UI):
- Minimum 12 characters.
- MUST include at least 3 of: lowercase, uppercase, digit, symbol.
- MUST NOT equal any of: the M-Team API key, the qBt password, the strings `password`, `harvester`, `admin`, or their leet-variants (regex-based denylist).
- Rejection returns a structured validation error; UI shows inline message per §10.

**FR-AUTH-03** Storage: password is stored as an Argon2id hash (params: `memoryCost=65536 KiB, timeCost=3, parallelism=4`) in `config.json` under `lan_access_password_hash`. Plaintext is NEVER persisted, logged, or returned by any API endpoint. On read, API returns `{ lan_access_enabled: true|false, lan_access_password_set: true|false }` — never the hash or plaintext.

**FR-AUTH-04** Auth middleware applies to every `/api/*` route EXCEPT `/api/health` (unauthenticated liveness for LAN monitoring). Middleware logic:
1. If `lan_access_password_hash` is unset → allow (localhost-only mode).
2. Else → read header `Authorization: Bearer <token>`. If missing → 401 `{ok:false, error:"unauthenticated"}`.
3. Token is the plaintext password. Middleware verifies against stored hash via Argon2id.
4. On success, continue. On failure, increment `auth_failures` counter and return 401.

**FR-AUTH-05** Rate limiting: 10 failed auth attempts from a single remote IP within a 5-minute sliding window triggers a 5-minute lockout for that IP (`429 Too Many Requests`, `Retry-After: 300`). Lockout state is in-memory, resets on process restart, logged at WARN with level `auth`. Successful auth from the locked IP during lockout still fails. Localhost (`127.0.0.1`, `::1`) is NEVER rate-limited.

**FR-AUTH-06** Session model: **stateless**, no server-side sessions or cookies. Every request sends the bearer token. The SPA, on first load over LAN, MUST prompt for password via a blocking modal, then hold the password in JavaScript memory (not `localStorage`, not `sessionStorage`, not IndexedDB — explicit security choice) and inject `Authorization: Bearer <pwd>` on every fetch via TanStack Query defaults. Closing the tab = logging out.

**FR-AUTH-07** SSE endpoints (`/api/logs/stream`, `/api/service/events`) MUST accept auth via query parameter `?token=<password>` in addition to the header, because `EventSource` cannot set custom headers. Token in query param MUST be redacted from logs and from browser history via URL replacement after stream open. Query-param auth is only honored on SSE paths.

**FR-AUTH-08** Security posture banner (UI): when LAN auth is enabled, Settings page MUST show a yellow warning block containing verbatim:
> LAN access uses a password but does NOT encrypt traffic (plain HTTP). Only enable this on a trusted local network. Do NOT port-forward Harvester to the public internet.

**FR-AUTH-09** TLS is explicitly **not in scope** for v1. Plain HTTP over LAN is the designed state. Users who need encryption are expected to tunnel (SSH, Tailscale, etc.) or wait for a future release.

**FR-AUTH-10** Failure modes:
- Lost password: user MUST edit `config.json` manually to clear `lan_access_password_hash`, then restart. Documented in the in-app Settings help text.
- Config-file corruption: Harvester refuses to start and prints the problem; user fixes the file.

---

## 8. Compliance Requirements (P0, non-negotiable — maps to source §11.1)

**FR-CP-01** Default bind is `127.0.0.1`. `0.0.0.0` is allowed ONLY when `lan_access_password_hash` is set and the underlying plaintext passed the §7.9 FR-AUTH-02 complexity check at save time. Harvester MUST refuse to start if it detects a hash present but hash-verification misconfigured. Binding any non-loopback interface without auth is never allowed in v1. (§7.6 FR-UI-04, §7.9.)
**FR-CP-02** API key stored in `config.json` at 0600 permissions on POSIX; on Windows, file is placed under `%APPDATA%\Harvester\` with default ACL. Key is never transmitted anywhere other than the M-Team API host over HTTPS.
**FR-CP-03** Never call yeast.js methods that throw `UnimplementedMethodError`. Do not shim those endpoints with raw HTTP.
**FR-CP-04** Allowed-client enforcement: FR-DL-03.
**FR-CP-05** Poll-rate floor: FR-SG-01.
**FR-CP-06** First-run user acknowledgment modal: user MUST click "I understand the risks and have read M-Team's rules" before `config.json` is written for the first time.

---

## 9. Data Model (authoritative — supersedes source §7.2)

All tables reside in a single SQLite file at `%APPDATA%\Harvester\harvester.db` (Windows) or `~/.config/harvester/harvester.db` (POSIX).

```sql
-- SCHEMA VERSION TRACKING
CREATE TABLE schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

-- TORRENT EVENTS (one row per decision; re-evaluations create new rows)
CREATE TABLE torrent_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  mteam_id         TEXT    NOT NULL,
  infohash         TEXT,                                -- backfilled post-grab
  name             TEXT    NOT NULL,
  size_bytes       INTEGER NOT NULL,
  discount         TEXT    NOT NULL,                    -- FREE | _2X_FREE | _2X | PERCENT_50 | PERCENT_30 | NORMAL
  discount_end_ts  INTEGER,
  seeders          INTEGER,
  leechers         INTEGER,
  category         TEXT,
  created_date_ts  INTEGER,                             -- from M-Team payload, used for age calc
  raw_payload      TEXT NOT NULL,                       -- full JSON for audit
  seen_at          INTEGER NOT NULL,
  decision         TEXT    NOT NULL
                   CHECK (decision IN (
                     'GRABBED', 'SKIPPED_RULE', 'SKIPPED_DUP', 'SKIPPED_FLIPPED',
                     'RE_EVALUATED_GRABBED', 'RE_EVALUATED_SKIPPED',
                     'ERROR'
                   )),
  matched_rule     TEXT,                                -- comma-separated rule-set names if GRABBED
  rejection_reason TEXT,                                -- first failing condition if SKIPPED_RULE
  re_eval_count    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_torrent_events_mteam_id ON torrent_events(mteam_id);
CREATE INDEX idx_torrent_events_seen_at  ON torrent_events(seen_at);
CREATE INDEX idx_torrent_events_decision ON torrent_events(decision);

-- RULE SETS
CREATE TABLE rule_sets (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT UNIQUE NOT NULL,
  enabled        INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  schema_version INTEGER NOT NULL DEFAULT 1,
  rules_json     TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- ARCHIVED (pre-migration) RULE SETS
CREATE TABLE rule_sets_archive (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  original_rule_set_id INTEGER NOT NULL,
  schema_version       INTEGER NOT NULL,
  rules_json           TEXT NOT NULL,
  archived_at          INTEGER NOT NULL
);

-- POLLER RUN HISTORY
CREATE TABLE poll_runs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at       INTEGER NOT NULL,
  finished_at      INTEGER,
  torrents_seen    INTEGER,
  torrents_grabbed INTEGER,
  error            TEXT
);

-- GRAB RETRY QUEUE (persisted to survive restart)
CREATE TABLE grab_queue (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  mteam_id       TEXT NOT NULL,
  rule_set_name  TEXT NOT NULL,
  enqueued_at    INTEGER NOT NULL,
  attempts       INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error     TEXT
);

-- STRUCTURED LOGS (tail buffer, cap 10_000 rows)
CREATE TABLE logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,
  level     TEXT NOT NULL CHECK (level IN ('DEBUG','INFO','WARN','ERROR')),
  component TEXT NOT NULL,
  message   TEXT NOT NULL,
  meta_json TEXT
);
CREATE INDEX idx_logs_ts ON logs(ts DESC);

-- DAILY ROLLUP FOR CHARTS (lifecycle writes once/day)
CREATE TABLE stats_daily (
  date              TEXT PRIMARY KEY,                   -- YYYY-MM-DD (user local)
  grabbed_count     INTEGER NOT NULL DEFAULT 0,
  uploaded_bytes    INTEGER NOT NULL DEFAULT 0,
  downloaded_bytes  INTEGER NOT NULL DEFAULT 0,
  active_torrents_peak INTEGER NOT NULL DEFAULT 0,
  ratio_end_of_day  REAL,
  bonus_points_end_of_day INTEGER
);

-- PER-TORRENT LIFECYCLE STATE
CREATE TABLE lifecycle_peer_state (
  infohash         TEXT PRIMARY KEY,
  first_seen_at    INTEGER NOT NULL,
  zero_peers_since INTEGER,                             -- null when peers > 0
  last_checked_at  INTEGER NOT NULL
);

-- SITE PROFILE SNAPSHOTS (every 15 min)
CREATE TABLE profile_snapshots (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             INTEGER NOT NULL,
  uploaded_bytes INTEGER NOT NULL,
  downloaded_bytes INTEGER NOT NULL,
  ratio          REAL NOT NULL,
  bonus_points   INTEGER,
  account_tier   TEXT,
  raw_payload    TEXT
);
CREATE INDEX idx_profile_snapshots_ts ON profile_snapshots(ts DESC);

-- GLOBAL SERVICE STATE (single-row table; upserts only)
CREATE TABLE service_state (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  status              TEXT NOT NULL CHECK (status IN
                      ('RUNNING','PAUSED_USER','PAUSED_EMERGENCY','PAUSED_BACKOFF','STOPPED')),
  last_poll_at        INTEGER,
  consecutive_errors  INTEGER NOT NULL DEFAULT 0,
  allowed_client_ok   INTEGER NOT NULL DEFAULT 0 CHECK (allowed_client_ok IN (0,1)),
  updated_at          INTEGER NOT NULL
);
```

**DB maintenance:** nightly VACUUM at 04:00 local. `torrent_events` older than 90 days pruned to `torrent_events_archive` (same schema, no index on payload); archive is kept forever or until user deletes. `logs` rows older than 14 days deleted.

---

## 10. UI Requirements (authoritative)

Detailed design belongs in `UI_DESIGN.md` and `UI_HANDOFF.md`; this section is the requirement contract those docs MUST satisfy.

### 10.1 Information architecture

```
/                    Dashboard (default)
/torrents            Table
/torrents/:id        Side-drawer (URL deeplink to row)
/rules               Rule-set list + editor
/rules/:id           Rule-set edit view (form + JSON tabs)
/logs                Live tail
/stats               Historical charts
/settings            API keys, qBt, paths, kill switch, client check
/first-run           First-launch wizard (gated until complete)
```

### 10.2 Pages — required content

#### Dashboard `/`
- Top row: 6 KPI tiles — **Ratio** (tier-colored), **Uploaded today**, **Downloaded today**, **Active torrents** (leeching|seeding split), **Grabs (24h)**, **Free windows expiring ≤ 1h**. 7th tile: **Disk free (GiB)**.
- Global status banner: green/yellow/red depending on `service_state.status`.
- Two-column body:
  - Left: activity feed — tail of last 50 `logs` rows, color-coded by level, auto-updating via SSE.
  - Right: sparkline ratio (30 d) + sparkline upload bytes/day (30 d), each with numeric tooltip on hover.
- Footer status bar (all pages): poller state, last poll N seconds ago, qBt connection, M-Team API status, allowed-client status.

#### Torrents `/torrents`
- Tabs: **All | Active | Seeding | Completed | Removed | Errored**.
- Data table columns: Name, Size (GiB), Discount (badge), Added (relative), State (qBt state), Ratio, Up (MiB), Down (MiB), Peers (S/L), Free Left (hms), Actions.
- Per-column inline filter; multi-column sort (shift-click).
- Bulk actions: Pause, Resume, Force-recheck, Remove, Remove + Data.
- Row click → side drawer with: full M-Team payload (prettified), full state-transition log for the torrent, "Open on M-Team" link (new tab), "Remove+data" button.

#### Rule-sets `/rules`
- List of rule-sets as cards with enabled toggle, rule-set name, short summary line ("FREE only, 1–80 GiB, ≥4h free"), and last-edited relative.
- "New rule-set" button → form view, pre-filled with default values.
- Edit view has two tabs:
  - **Form** (default): all fields from §7.2 FR-RE-02 rendered as labeled inputs with helper text and inline validation. Includes a collapsible **Schedule** accordion (closed by default; opens if `schedule` is non-null). When enabled, renders: timezone selector (default "system"), and a window list where each row has a 7-day weekday pill selector + start-time + end-time inputs, with add/remove row buttons. Adjacent windows are OR'd. Tooltip clarifies midnight wrap.
  - **JSON** (power user): Monaco editor with JSON Schema validation live.
- "Dry run" button on every rule-set: runs FR-RE-05 and renders a table of the last 200 torrents with columns: Name, Decision (would_grab / would_skip), Reason. Optional "Simulate at time" date-time picker feeds a synthetic `now` into the evaluator (per FR-RE-07) so users can preview schedule-gated rules without waiting.

#### Logs `/logs`
- Virtual-scrolled list, 60 fps at 10k rows.
- Filters: level (multi-select), component (multi-select), time range (preset pills: 15 min, 1h, 6h, 24h, all; plus custom), free-text search.
- "Live tail" toggle (default on). When on, new entries stream via SSE and viewport auto-scrolls to bottom unless user has scrolled up.
- "Export" button → download filtered set as `.jsonl`.

#### Stats `/stats`
- **Ratio over time** line chart: window pills 7d / 30d / 90d / all. Y axis logarithmic toggle. Horizontal dashed line at current tier minimum.
- **Upload bytes per day** bar chart + overlay of grabs/day.
- **Rule-set performance** stacked bar: daily upload per rule-set for last 30 d. Table below with columns: Rule-set, Total grabs, Total uploaded, Total downloaded, Avg ratio.

#### Settings `/settings`
Sections:
- **Service**: big red Kill Switch. Current status with "Resume" button when paused.
- **M-Team**: API key (masked, show-on-click + rotate button). Test-connection button.
- **qBittorrent**: host, port, user, password (masked). Test-connection button. Current version. Allowed-client check result with override toggle (disabled unless user typed "I ACCEPT" into a confirmation field).
- **Poller**: interval (slider, 60–600 s, default 90 s). Backoff cap (read-only 30 min).
- **Downloads**: default save path (directory picker via text input — Node has no native picker; user pastes path. Show a "Validate" button that checks existence+writability).
- **Lifecycle**: default removal rule block — seed-time-hours input, zero-peers-minutes input, remove-with-data toggle.
- **Emergency**: tier thresholds table (user-editable), ratio-buffer field (default 0.2).
- **Network / LAN access** (Phase 3): toggle "Enable LAN access." When on, shows password field (min-12 complexity meter, confirm-password field, show/hide toggle). Save applies FR-AUTH-02 validation. Below the field: yellow warning block with FR-AUTH-08 text. Shows detected local IPs (`ipconfig`/`ifconfig`-equivalent) and the URL the user should bookmark on their phone/laptop (e.g. `http://192.168.1.42:5173`). Displays a "Restart required" banner after toggling; provides a one-click restart button. When LAN access is on, a small yellow lock chip appears in the footer status bar on every page ("LAN").
- **About**: version, license (MIT), open-source link.

#### First-run wizard `/first-run`
- Step 1: Welcome + risk acknowledgment (required click).
- Step 2: M-Team API key input + Test.
- Step 3: qBt connection + Test + Allowed-client check.
- Step 4: Default download path.
- Step 5: Install the factory default rule-set? (Yes/No).
- Step 6: Done → redirect to `/`.

### 10.3 Cross-cutting

- **Keyboard shortcuts:** `g d`, `g t`, `g r`, `g l`, `g s` (stats), `g S` (settings), `/` (focus current page's search field), `?` (shortcut cheat sheet), `esc` (close drawer/modal).
- **Time rendering:** relative with absolute on hover (`title` attribute). Uses user's local TZ for display.
- **Sizes:** always IEC (GiB, MiB). Never MB/GB.
- **Badges for discount:** color mapping fixed — `FREE` green, `_2X_FREE` purple, `_2X` blue, `PERCENT_50` yellow, `PERCENT_30` amber, `NORMAL` gray.
- **Toasts:** for GRABBED, REMOVED, ERROR, EMERGENCY_PAUSED. User can mute by category. Toasts auto-dismiss in 5 s except ERROR/EMERGENCY (manual dismiss).
- **Empty states:** every list has a documented empty state (see `UI_DESIGN.md`).
- **Error states:** every fetchable area has a retryable error state.
- **Loading states:** skeleton shimmers, no spinners for primary content.
- **Offline state:** if SSE connection drops > 5 s, show a subtle yellow chip in the footer status bar; attempt reconnect with backoff. Do NOT block the whole UI.
- **Dark mode:** default. Toggle in settings. Persisted in `localStorage` — NOTE: artifacts-restriction on storage APIs does not apply; this is a real Node-hosted SPA, not a Claude artifact.

---

## 11. Success Metrics (v1 post-launch)

### Leading indicators (evaluated at 7, 14, 30 days post-launch)
- **Adoption:** % of users who complete first-run wizard / % who installed.
  - Measurement: we do NOT phone home. User-reported via optional GitHub feedback.
- **Activation:** at least one GRABBED event within 24 h of first-run completion. Self-reported.
- **Reliability:** uptime-while-running ≥ 99% as reported by `poll_runs` completeness (computed client-side, visible on Stats page).

### Lagging indicators
- **Upload throughput:** 7-day rolling upload ≥ 5 GiB/day for active users (G3).
- **Ratio trajectory:** positive 30-day slope for users running tool ≥ 30 days (G3 companion metric).
- **Safety:** zero reported bans attributable to Harvester (G5).

### Telemetry policy
- NEVER phone home.
- All metrics above are local; users can opt-in to share a `metrics-export.json` manually when filing issues.

---

## 12. HTTP + SSE API Surface (authoritative)

Every endpoint rooted at `http://127.0.0.1:<port>/api`. Content-Type `application/json` except where specified. All responses include `{ "ok": true|false, "data": ..., "error": ... }` envelope unless SSE.

| Method | Path | Purpose | Req body | Resp 200 body |
|--------|------|---------|----------|---------------|
| GET | `/api/health` | Liveness/readiness | — | `{status, uptime_sec, service_status, last_poll_at}` |
| GET | `/api/dashboard/summary` | KPI tiles | — | `{ratio, uploaded_today, downloaded_today, active_leeching, active_seeding, grabs_24h, expiring_1h, disk_free_gib, bonus_points, tier, tier_min_ratio}` |
| GET | `/api/torrents?state=&limit=&cursor=&q=` | Paginated list | — | `{items: Torrent[], next_cursor}` |
| GET | `/api/torrents/:id` | Detail + history | — | `{torrent, transitions: Transition[], mteam_payload}` |
| POST | `/api/torrents/:id/action` | pause / resume / recheck / remove / remove_with_data | `{action}` | `{ok, new_state}` |
| POST | `/api/torrents/bulk-action` | Bulk op | `{ids: string[], action}` | `{results: {id, ok, error}[]}` |
| GET | `/api/rules` | List | — | `{items: RuleSet[]}` |
| POST | `/api/rules` | Create | `RuleSetInput` | `{id}` |
| GET | `/api/rules/:id` | One | — | `RuleSet` |
| PUT | `/api/rules/:id` | Update | `RuleSetInput` | `RuleSet` |
| DELETE | `/api/rules/:id` | Delete | — | `{ok}` |
| POST | `/api/rules/:id/dry-run` | Dry run | — | `{items: DryRunRow[]}` |
| GET | `/api/rules/validate` | Validate JSON | `{rules_json}` | `{ok, errors: []}` |
| GET | `/api/logs?level=&component=&from=&to=&q=&limit=&cursor=` | Paginated logs | — | `{items: LogRow[], next_cursor}` |
| GET | `/api/logs/stream` (SSE) | Live log tail | — | `event: log\ndata: <LogRow>\n\n` |
| GET | `/api/stats/daily?from=&to=` | Series | — | `{items: StatsDaily[]}` |
| GET | `/api/stats/ruleset-performance?from=&to=` | Per rule-set | — | `{items: RuleSetPerf[]}` |
| GET | `/api/settings` | Read | — | `Settings` (API key MASKED) |
| PUT | `/api/settings` | Write | `SettingsInput` | `Settings` |
| POST | `/api/settings/test/mteam` | Test API key | `{api_key?}` | `{ok, profile?, error?}` |
| POST | `/api/settings/test/qbt` | Test qBt creds | `{host,port,user,pass}` | `{ok, version?, error?}` |
| POST | `/api/service/pause` | Kill switch | — | `{status}` |
| POST | `/api/service/resume` | Un-pause | — | `{status}` |
| GET | `/api/metrics` | JSON counters | — | `{counters, gauges}` |
| POST | `/api/first-run/complete` | Mark wizard done | `{acknowledged:true}` | `{ok}` |
| GET | `/api/service/state` | Full state | — | `{service_state, preflight: {mteam, qbt, allowed_client, disk}, emergency, lan: {enabled, listening_on}}` |
| GET | `/api/service/events` (SSE) | Dashboard live updates (status, KPI deltas) | — | `event: ...\ndata: ...` |
| POST | `/api/service/restart` | Graceful restart (required after LAN toggle) | — | `{ok}` — server terminates after response flush; supervisor (`start.bat`/`pm2`) restarts |
| POST | `/api/settings/lan-access` | Enable/disable + set password | `{enabled, password?}` | `{ok, requires_restart:true}` (password validated per FR-AUTH-02, then hashed and stored) |
| POST | `/api/settings/lan-access/disable` | Clear password, revert to localhost | — | `{ok, requires_restart:true}` |
| POST | `/api/auth/verify` | Client-side "is my token still valid" check for re-login prompts | — | `{ok}` (401 if bad) |

**Auth middleware note:** Every endpoint above EXCEPT `/api/health` is subject to FR-AUTH-04. `/api/logs/stream` and `/api/service/events` additionally accept `?token=` per FR-AUTH-07.

**Stable TypeScript interfaces** for every entity defined above are authoritatively specified in `IMPLEMENTATION.md §3` (data contracts).

---

## 13. Phased Plan (authoritative for v1)

### Phase 0 — Spike (1 week)
- Confirm every M-Team API field in this doc against live Swagger.
- Confirm `genDlToken` TTL and single-use behavior.
- Confirm M-Team tier-ratio thresholds (FR-EM-02).
- Confirm infohash exposure in `torrent/search` response (FR-DL-05).
- Confirm yeast.js off-limits method list.
- Throwaway CLI: poll → hardcoded filter → grab via qBt. Measure latency.
- Deliverable: `SPIKE_REPORT.md` with confirmed/rejected assumptions.

### Phase 1 — MVP (3–4 weeks)
- Scope: Poller + Rule Engine (single rule-set) + Downloader + SQLite + Dashboard + Torrents + Settings + First-run wizard + Kill switch + Allowed-client check + Emergency mode + Lifecycle manager (hardcoded default rule) + Logs page (basic).
- Excluded: Rule-set editor (single hardcoded rule only in Phase 1), Stats page, dry-run, multi-rule-set, bulk actions.
- Ships as: Node + SPA in one git repo. `start.bat` + `start.sh`. Manual `npm install`.

### Phase 2 — v1.0 (3–4 weeks)
- Rule-set editor (form + JSON tabs), multi-rule-set OR semantics, dry-run (incl. "Simulate at time" per FR-RE-07), re-evaluation logic.
- **Scheduled rule windows** (FR-RE-07): rule JSON `schedule` field, form accordion, evaluator gate, dry-run time override.
- Stats page with Recharts.
- Logs page SSE live tail + filter/search/export.
- Bulk actions on Torrents page.
- Keyboard shortcuts.
- Toasts with mute.

### Phase 3 — v1.1 (2–3 weeks)
- **LAN binding + password auth** (§7.9 FR-AUTH): Argon2id-hashed `lan_access_password`, bind toggle, bearer-token middleware, SSE query-param auth, rate limiter, complexity validator, Settings UI network section, footer LAN chip, restart endpoint.
- Log redaction hardening (FR-OB-02) — add password-hash detection to redaction regex list.
- Integration test suite against a mock M-Team server (`msw` recorded fixtures).
- Performance: virtual-scroll logs tested with 100k rows.
- `start.bat` + `start.sh` installer convenience.

**v1 ship state:** Phase 1 + Phase 2 + Phase 3 together constitute "v1.1 GA." Every P0 FR in this PRD ships. There is no feature cut between MVP and GA — only ordering.

### Phase 4 — v2 candidates (deferred)
- Tauri wrapper (single-binary installer, tray icon).
- Telegram hook (push notifications for grabs, emergency, errors).
- Tracker adapter abstraction (second private tracker support).
- Prometheus `/metrics` endpoint.
- Multi-qBittorrent instance.

**Dropped from roadmap (user-confirmed):** Run-as-Windows-service / auto-start. Users who need it can use `nssm` / `pm2` externally; Harvester will not ship wrapping code for it.

---

## 14. Open Questions (minimal — most were answered in brainstorm)

| # | Question | Who answers | Blocking? |
|---|----------|-------------|-----------|
| OQ-1 | Final M-Team tier-ratio thresholds — FR-EM-02 placeholders must be verified | Engineering (Phase 0) | Yes |
| OQ-2 | Does `torrent/search` response include infohash? (affects FR-DL-05) | Engineering (Phase 0) | No (fallback exists) |
| OQ-3 | genDlToken single-use + TTL behavior | Engineering (Phase 0) | Yes |
| OQ-4 | Does yeast.js expose `profile` or is it behind `UnimplementedMethodError`? | Engineering (Phase 0) | Yes |
| OQ-5 | ~~"9 peer for 60 mins"~~ — CONFIRMED as "0 peers for 60 min" by user. FR-LC-02 stands as written. | User | Resolved |

All other prior "open questions" in source §13 are resolved: MIT license, no telemetry, no Telegram in v1, codename is Harvester, single-account, conservative default rule-set per FR-RE-02 factory defaults, no SLA commitment.

### 14.1 Concurrency policy (user-confirmed: high-bandwidth fiber, no ISP cap)

Harvester imposes **no hard cap** on concurrent active torrents. qBittorrent's own `max_active_downloads` / `max_active_torrents` settings govern. Harvester MUST:
- Surface a soft-advisory banner in the Dashboard if the count of `harvester`-tagged torrents in qBt exceeds 100 simultaneously (threshold configurable in settings, default 100). Banner is yellow, not red; non-blocking.
- Never throttle or defer grabs internally. Throttling is the user's responsibility via qBt settings.

This decision is safe for the primary user (8 Gbps fiber, no usage cap) and conservative enough to flag runaway configs.

---

## 15. Acceptance Criteria Summary (machine-checkable, for IMPLEMENTATION.md test matrix)

- [ ] Given a FREE torrent matching default rule, when it appears in poll, then it is GRABBED within 180 s.
- [ ] Given a NORMAL (paid) torrent, when it appears in poll, then it is SKIPPED_RULE with reason `discount_whitelist`.
- [ ] Given two enabled rule-sets both matching the same torrent, when it appears, then exactly one qBt add occurs and `matched_rule` contains both names.
- [ ] Given a rule-set SKIPPED a torrent because `leechers < min_leechers`, when the same torrent is polled again within 60 min and now has `leechers ≥ min_leechers`, then a RE_EVALUATED_GRABBED event fires.
- [ ] Given qBt offline, when a grab would occur, then a `grab_queue` row is inserted; on qBt recovery within 10 min, the grab executes exactly once.
- [ ] Given qBt on disallowed version (e.g., 5.1.5), when startup runs, then service enters `ALLOWED_CLIENT_WARN` and blocks grabs until user override.
- [ ] Given a seeding torrent with our `harvester` tag reaching `seed_time ≥ 72h`, when lifecycle runs, then torrent is removed-with-data.
- [ ] Given a seeding torrent whose discount flipped to paid while progress < 100%, when lifecycle runs, then torrent is removed-with-data immediately.
- [ ] Given site ratio drops within 0.2 of tier minimum, when profile poll runs, then poller stops, status becomes EMERGENCY_PAUSED, red banner shows on all pages.
- [ ] Given poll interval set to 30 in settings UI, when user saves, then save is rejected with validation error "min 60".
- [ ] Given the M-Team API returns 500 three times, when the fourth poll would fire, then backoff delays next poll to ≥ `base * 8`.
- [ ] Given first-run has not completed, when user navigates to any page other than `/first-run`, then they are redirected to `/first-run`.
- [ ] Given user clicks kill switch, when poller is mid-cycle, then the current cycle finishes but no new cycle starts.
- [ ] Given a log line contains the user's API key, when written to file or DB, then the API key is `***REDACTED***`.
- [ ] Given a rule-set with `schedule.windows = [{days:["sat","sun"],start:"00:00",end:"23:59"}]`, when a matching torrent appears on Tuesday 10 AM, then the rule-set is SKIPPED with `rejection_reason='schedule_closed'`; on Saturday 10 AM, it is evaluated normally.
- [ ] Given a rule-set schedule wraps midnight (`start:"22:00", end:"08:00"`), when evaluated at 23:30, then it is active; at 04:00 the next day, it is active; at 09:00, it is not.
- [ ] Given LAN access disabled (default), when a request arrives at `/api/torrents` on `0.0.0.0`, then the server is not even listening on non-loopback and the request cannot reach Harvester.
- [ ] Given LAN access enabled and password set, when a request arrives at `/api/torrents` without `Authorization` header, then response is 401 `{ok:false,error:"unauthenticated"}`.
- [ ] Given LAN access enabled, when 10 requests in 5 min from `192.168.1.50` all fail auth, then the 11th request from the same IP is rejected 429 with `Retry-After: 300` and a WARN log is emitted; requests from `127.0.0.1` in the same window are unaffected.
- [ ] Given LAN access enabled, when SSE request `/api/logs/stream?token=<pwd>` arrives with a valid token in query string, then it is accepted; when the same path with no token arrives, then 401.
- [ ] Given password `Password1234` is submitted to `/api/settings/lan-access`, when validated, then it is rejected because the `admin/password/harvester` denylist matches `password` substring.
- [ ] Given password is set and user calls `GET /api/settings`, when inspecting response, then no password field nor hash field is present — only `{lan_access_enabled, lan_access_password_set}`.
- [ ] Given user toggles LAN access from off to on, when save succeeds, then response includes `requires_restart:true` and the server continues on its current binding until `POST /api/service/restart` is called.
- [ ] Given a dry-run request with `simulate_at="2026-01-01T03:00:00-05:00"`, when the rule-set has a `22:00–08:00` schedule, then returned items reflect schedule evaluation at that simulated time, not at real-world now.

---

## 16. Glossary (inherited + extended from source §15)

| Term | Definition |
|------|------------|
| PT | Private Tracker |
| Ratio | `uploaded_bytes / downloaded_bytes` as reported by M-Team |
| Freeleech / FREE | `discount = FREE`: download bytes not counted against ratio |
| 2X_FREE | `discount = _2X_FREE`: download not counted, upload counted 2× |
| Discount window | Interval before `discount_end_ts` during which a torrent carries a non-NORMAL discount |
| Grab | Submitting a torrent to qBt via `/torrents/add` |
| Brushing (刷流) | Running many short-lifetime torrents to accumulate upload |
| Swarm | All peers on a given torrent |
| 魔力值 | "Bonus points" on M-Team; earned by seeding |
| Infohash | SHA-1 of the torrent info dict; identifies a torrent uniquely in qBt |
| Harvester | Product name. This tool. |
| qBt | qBittorrent |
| RCWU | Ratio-Conscious Windows User (primary persona) |
| HSSH | Home Server Self-Hoster (secondary persona) |
| tier minimum | The minimum ratio enforced by M-Team for the user's account age bucket |
| LAN access | Binding Harvester to `0.0.0.0` with a password-gated bearer-token auth layer. Opt-in via Settings → Network. See §7.9 |
| Scheduled rule window | Time-of-week gate on a rule-set; torrent is ineligible for that rule-set outside the configured window. See §7.2 FR-RE-07 |

---

*End of PRD. Authoritative. Downstream docs (UI_DESIGN, UI_HANDOFF, ARCHITECTURE, IMPLEMENTATION) MUST NOT contradict this file; if they do, this file wins.*
