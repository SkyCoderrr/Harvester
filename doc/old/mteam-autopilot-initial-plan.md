# MTeam AutoPilot — Initial Product Concept & First Draft Plan

> **Status:** Initial concept for PM handoff
> **Author:** Sky (engineering)
> **Intended audience:** Product management, detailed spec authors
> **Document type:** Dense handoff brief; not user-facing
> **Working codename options:** AutoPilot, BrushPilot, Yeast, Harvester, Tracker-Tender (TBD by PM)

---

## 1. Executive Summary

A local service that watches the M-Team private tracker for newly-released torrents that carry a free or bonus-upload discount, filters them against user-defined rules, and automatically dispatches them to a local qBittorrent instance for downloading and seeding — with the sole goal of accumulating upload credit (share ratio / bonus points) without accruing download debt. A companion single-page web UI provides real-time visibility into the pipeline: what's queued, what's seeding, bandwidth consumed, ratio trajectory, and audit logs.

Analogous projects exist (`MTeam-Genie`, `FreeTorrents-MTeam`) but none combine a modern web dashboard with a rules engine and a lifecycle manager in one package. This product aims to fill that gap for intermediate-to-advanced PT users on M-Team specifically.

---

## 2. Problem Statement

Maintaining a healthy ratio on M-Team (and surviving the site's mandatory ratio thresholds past registration milestones at 4/8/12/16 weeks) requires consistent attention to new-torrent discount windows. Useful torrents are time-gated — the best upload opportunity is the first 30–180 minutes of a popular free torrent's life, when the swarm is leecher-heavy and seeder-light. Manually monitoring the site does not scale; existing automation tools are either CLI-only, Telegram-only, or assume Linux server deployment, none of which fit a Windows desktop user who wants a visual control surface.

---

## 3. Goals & Non-Goals

### Goals

| # | Goal | Measurable outcome |
|---|------|---------------------|
| G1 | Automatically detect and grab free-discount torrents matching user rules | ≥ 95% of qualifying torrents grabbed within 120 s of publication |
| G2 | Never download a non-free torrent unintentionally | 0 non-free downloads over a 30-day audit |
| G3 | Maintain share ratio ≥ 3.0 with the service running alone | Ratio trajectory positive over any 7-day rolling window |
| G4 | Visibility into pipeline state, bandwidth, ratio, logs | User can answer "what's happening right now" in ≤ 2 clicks |
| G5 | Be safe to run: respect site rate limits and compliance rules | 0 account warnings/bans attributable to this tool |

### Non-Goals

- **Not a general-purpose BitTorrent client.** qBittorrent is the download engine; we orchestrate, we do not download.
- **Not a multi-tracker tool** in v1. M-Team only. Abstracting the tracker adapter is a v2 concern.
- **Not a torrent search/browse UI.** Users search and manually download on the M-Team site; we only handle the automated pipeline.
- **Not a remote/mobile app** in v1. Localhost web UI only.
- **Not a cloud/SaaS product.** Runs locally on the user's machine. No multi-user accounts.
- **Not a torrent editor or tracker-rule editor.** We honor M-Team's site rules; we do not evade them.

---

## 4. Target User & Personas

**Primary persona — "The Ratio-Conscious PT User"**
Windows desktop user, technically literate, already runs qBittorrent, already has an M-Team account (with API key provisioned under Lab → Access Token). Wants passive ratio growth without babysitting the browser. Values clean, information-dense interfaces over flashy ones.

**Secondary persona — "The Self-Hoster"**
Runs a home server (NAS/mini-PC) with qBittorrent and wants a web-accessible dashboard from their LAN. Similar needs, but runs the service headlessly with occasional web UI check-ins.

Out of scope for v1: new M-Team registrants (they need to pass the initial newbie threshold before automation is safe), casual users who don't know what a share ratio is.

---

## 5. Context & Domain Background

Brief primer for PM — terms to internalize before spec writing:

- **Ratio / Share Score** — `uploaded_bytes / downloaded_bytes`. M-Team enforces tiered minimums tied to account age and total download volume. Falling below triggers a 5-day warning, then account deletion.
- **Free torrent / Freeleech** — download bytes not counted against ratio. Flagged on the torrent object as `discount = FREE`.
- **2x Free** — download not counted AND upload counted at 2x. Flagged as `discount = _2X_FREE`. Highest-value category.
- **Discount window** — every promo has an expiry (`discountEndTime`). Starting a 50 GB download with 1 hour of free remaining is a trap.
- **新種免費期 (new-torrent grace period)** — most new torrents on M-Team auto-spawn with a free or discount window; timing is critical.
- **Swarm economics** — early in a torrent's life, leechers ≫ seeders, so your upload/download ratio on that specific torrent can be high (10x+). Late swarm is saturated and yields little upload.
- **Bonus points (魔力值)** — accumulated via seeding time; spendable on upload credit or invites. Tracked, not directly manipulated by this product in v1.

---

## 6. Core Functional Requirements

### 6.1 Torrent Discovery (Poller)
- Polls `POST /api/torrent/search` via M-Team API every 60–120 s (configurable, never < 60 s).
- Pulls newest N torrents sorted by creation time.
- Uses a per-torrent ID deduplication cache so the same torrent is evaluated only once.
- Surface-exposed: last poll time, last poll result count, error states.

### 6.2 Rule Engine (Filter)
User-definable rules; a torrent must match **all** active rules to be grabbed. Initial rule fields:

| Rule | Type | Example |
|------|------|---------|
| `discount` whitelist | enum set | `[FREE, _2X_FREE]` |
| Minimum remaining free time | duration | ≥ 6 h |
| Size range | GB | 0.5 – 50 |
| Category whitelist | enum set | Movies, TV, Music |
| Min seeders | int | 0 |
| Min leechers | int | 3 (proxy for upload demand) |
| Max existing seeders | int | 50 (skip saturated swarms) |
| Title regex include | regex | optional |
| Title regex exclude | regex | `\b(TS|CAM|HDTC)\b` |
| Free disk space guard | GB | abort if < 100 GB free on target drive |

Rules are stored as named rule-sets; multiple rule-sets can be active simultaneously (e.g. "Small & Fast" for <5 GB + ≥10 leechers; "Big & Valuable" for 2x-free only, any size).

### 6.3 Download Orchestration
- Resolves `.torrent` download URL via M-Team API (`/api/torrent/genDlToken` or equivalent).
- Submits to qBittorrent WebUI via `POST /api/v2/torrents/add` with:
  - Category: `mteam-auto` (configurable)
  - Tag: rule-set name that matched + discount type (e.g. `rule:small-fast,discount:FREE`)
  - Paused: false
  - Upload limit: optional per-rule
  - Download path: configurable per-rule (useful for routing to different drives)
- Logs the grab with full torrent metadata snapshot (for later audit).

### 6.4 Lifecycle Manager
Background task, runs every 5 min, queries qBittorrent for all torrents tagged by the service. For each, evaluates:

- Downloaded, now seeding → check removal criteria
- Removal criteria (any-match, configurable):
  - Per-torrent ratio ≥ X (e.g. 2.0)
  - Seed time ≥ Y (e.g. 72 h)
  - 0 peers for ≥ Z minutes (e.g. 60 min)
  - Free window expired AND torrent not yet 100% downloaded → stop + remove (never leave a finished-leeching torrent half-downloaded in paid state)
- Actions: pause, stop, remove torrent, remove torrent+data (configurable default)

### 6.5 Web UI (see Section 10 for detail)
- Dashboard, torrent list, logs, rules editor, settings, stats/charts.

### 6.6 Observability
- Structured JSON logs (file + in-memory buffer for UI).
- Metrics: API call count, API errors, grabs/hour, rejections/hour, bytes up/down per torrent and aggregate.
- Optional: Prometheus-style `/metrics` endpoint for users who want to hook up Grafana (power-user feature, v2).

### 6.7 Safety Guards (non-negotiable)
- Hard-floor poll interval of 60 s. Cannot be lowered via UI or config.
- Global kill switch in UI — stops polling, does not touch qBittorrent.
- Pre-flight check: verify API key, qBittorrent reachability, disk space, allowed client version, before enabling polling.
- If API returns ≥ 3 consecutive errors, automatic back-off with exponential delay.
- Duplicate-submission prevention: every candidate torrent is checked against qBittorrent's existing torrent list (by infohash) before submission.

---

## 7. Technical Architecture

### 7.1 Component Diagram (conceptual)

```
┌─────────────────────────────────────────────────────────┐
│                     MTeam AutoPilot                     │
│                                                         │
│  ┌───────────┐   ┌──────────┐   ┌────────────────────┐  │
│  │  Poller   │──▶│  Filter  │──▶│  Downloader        │  │
│  │  (cron)   │   │  (rules) │   │  (qBt API client)  │  │
│  └─────┬─────┘   └────┬─────┘   └──────────┬─────────┘  │
│        │              │                    │            │
│        ▼              ▼                    ▼            │
│  ┌────────────────────────────────────────────────────┐ │
│  │                    SQLite                          │ │
│  │ torrents | rules | runs | logs | stats_daily       │ │
│  └─────────────────────┬──────────────────────────────┘ │
│                        ▲                                │
│        ┌───────────────┴──────────────┐                 │
│        │                              │                 │
│  ┌─────┴──────┐              ┌────────┴──────┐          │
│  │ Lifecycle  │              │ HTTP API +    │          │
│  │ Manager    │              │ Web UI        │          │
│  │ (cleanup)  │              │ (React SPA)   │          │
│  └─────┬──────┘              └───────────────┘          │
│        │                                                │
└────────┼────────────────────────────────────────────────┘
         │
         ▼
    qBittorrent WebUI (localhost:8080)
         │
         ▼
    M-Team tracker (external)
```

### 7.2 Data Model (SQLite, v1)

```sql
-- Torrent events we've seen (one row per grab decision, grab or skip)
CREATE TABLE torrent_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  mteam_id        TEXT NOT NULL,
  infohash        TEXT,
  name            TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  discount        TEXT NOT NULL,          -- FREE, _2X_FREE, NORMAL, ...
  discount_end_ts INTEGER,                -- unix seconds
  seeders         INTEGER,
  leechers        INTEGER,
  category        TEXT,
  raw_payload     TEXT,                   -- full JSON for audit
  seen_at         INTEGER NOT NULL,       -- unix seconds
  decision        TEXT NOT NULL,          -- GRABBED | SKIPPED_RULE | SKIPPED_DUP | ERROR
  matched_rule    TEXT,                   -- rule-set name if GRABBED
  rejection_reason TEXT                   -- human-readable if SKIPPED_RULE
);

CREATE INDEX idx_torrent_events_mteam_id  ON torrent_events(mteam_id);
CREATE INDEX idx_torrent_events_seen_at   ON torrent_events(seen_at);

-- Named rule-sets
CREATE TABLE rule_sets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT UNIQUE NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  rules_json  TEXT NOT NULL,              -- full rule DSL as JSON
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Poller run history (one row per poll cycle)
CREATE TABLE poll_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at      INTEGER NOT NULL,
  finished_at     INTEGER,
  torrents_seen   INTEGER,
  torrents_grabbed INTEGER,
  error           TEXT
);

-- Structured log entries, tailed by the UI
CREATE TABLE logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,
  level     TEXT NOT NULL,                -- DEBUG | INFO | WARN | ERROR
  component TEXT NOT NULL,                -- poller | filter | downloader | lifecycle | ui
  message   TEXT NOT NULL,
  meta_json TEXT
);
CREATE INDEX idx_logs_ts ON logs(ts);

-- Daily roll-up for charts (populated by lifecycle manager)
CREATE TABLE stats_daily (
  date            TEXT PRIMARY KEY,       -- YYYY-MM-DD
  grabbed_count   INTEGER,
  uploaded_bytes  INTEGER,                -- from qBt, aggregate over our-tagged torrents
  downloaded_bytes INTEGER,
  active_torrents_peak INTEGER,
  ratio_end_of_day REAL                   -- global site ratio at 23:59
);
```

### 7.3 Key Sequence — Torrent Discovery to Grab

1. Poller timer fires.
2. `POST /api/torrent/search` with `{ mode: 'normal', pageSize: 50, sortBy: 'createdDate desc' }`.
3. For each returned torrent, check `torrent_events` for existing row by `mteam_id` → skip if present.
4. Insert `SKIPPED` or `GRABBED` row after filter evaluation.
5. If GRABBED: call `genDlToken` → fetch `.torrent` URL → `POST` to qBt `/api/v2/torrents/add`.
6. Insert log entry at each step; update `poll_runs`.

---

## 8. Technology Stack Recommendation

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Runtime | Node.js 20 LTS + TypeScript | Matches the chosen `yeast.js` library; strong typing for API schemas |
| M-Team client | `yeast.js` (npm) | Already wraps the M-Team API; respects off-limits endpoints |
| HTTP server | Fastify | Fast, TypeScript-first, easy SSE/WebSocket for live UI updates |
| DB | SQLite via `better-sqlite3` | Zero-config, single-file, fast enough for this scale (<100k rows) |
| qBittorrent client | `@ctrl/qbittorrent` or thin custom wrapper | Cookie-based session, all v2 API endpoints |
| Scheduler | Native `setInterval` + idempotent guards (no external cron needed) | Simpler than `node-cron` for the two jobs we have |
| Web UI framework | React 18 + Vite | Mature, ecosystem fit for shadcn/ui |
| UI component kit | **shadcn/ui** + Tailwind CSS | Modern aesthetic, dense layouts possible, matches "clean not flashy" preference |
| Charts | Recharts or Tremor | Clean defaults, minimal configuration |
| Packaging | `pkg` or a Tauri wrapper (v2) for native-feeling desktop app | v1 ships as Node server + static SPA; v2 optional Tauri |

**Alternative stack (if PM prefers Python):** FastAPI + SQLModel + a fork of `MTeam-Genie`'s brush logic + React frontend (same). Trade-off: Python has better existing M-Team code to borrow from, but the user's chosen library (yeast.js) is TS-native. Recommendation is TS unless team expertise tilts strongly Python.

---

## 9. Reusable Resources

### 9.1 First-party dependencies (direct use)

| Repo / package | Role | Notes |
|----------------|------|-------|
| [yeast-io/yeast.js](https://github.com/yeast-io/yeast.js) | M-Team API client (primary) | MIT; honors M-Team's off-limits endpoint list; TypeScript; active |
| [qbittorrent/qBittorrent — WebUI API docs](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)) | qBt integration reference | Authoritative endpoint spec |
| [@ctrl/qbittorrent](https://www.npmjs.com/package/@ctrl/qbittorrent) | TS qBt client | Saves us writing cookie-auth boilerplate |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | UI components | Copy-in component pattern, not a dep |
| [recharts/recharts](https://github.com/recharts/recharts) | Charts | For ratio-over-time, bytes-per-day plots |

### 9.2 Reference implementations (borrow patterns, don't fork wholesale)

| Repo | Language | What to learn from it |
|------|----------|------------------------|
| [astralwaveorg/MTeam-Genie](https://github.com/astralwaveorg/MTeam-Genie) | Python | `mteam/brush.py` — auto-brushing filter logic; `qbittorrent/tasks_cleanup.py` — the exact lifecycle cleanup pattern; `telegram/mt_helper.py` — optional Telegram hook (possible v2 feature) |
| [ettwz/FreeTorrents-MTeam](https://github.com/ettwz/FreeTorrents-MTeam) | Go | Minimal free-torrent filter; config file schema (`conf.yaml`) is a good starting point for our rule DSL |
| [yitong-ovo/m-team-download-helper](https://github.com/yitong-ovo/m-team-download-helper) | JS (browser extension) | How the M-Team site's own download links are constructed; useful if we hit auth oddities |
| [mteam (PyPI)](https://pypi.org/project/mteam/) | Python | Alternate M-Team SDK — useful as a cross-reference for API schemas if yeast.js is missing a field |

### 9.3 Official references

- **M-Team Swagger** — `https://test2.m-team.cc/api/swagger-ui/index.html` (exact endpoint and schema source of truth)
- **M-Team Wiki — site rules** — `https://wiki.m-team.cc/zh-tw/site-rules`
- **M-Team Wiki — download rules & allowed clients** — `https://wiki.m-team.cc/zh-tw/download-rules`
- **M-Team Wiki — account rules (ratio thresholds)** — `https://wiki.m-team.cc/zh-tw/account-rules`
- **qBittorrent WebUI API** — `https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)`

### 9.4 M-Team API endpoints of primary interest

| Endpoint | Purpose | Used by |
|----------|---------|---------|
| `POST /api/torrent/search` | List torrents with filters | Poller |
| `POST /api/torrent/genDlToken` | Get one-time `.torrent` download URL | Downloader |
| `POST /api/member/profile` | Ratio, upload/download totals | Dashboard stats |
| `POST /api/torrent/detail` | Full detail for a single torrent | Logs drill-down, audit |

### 9.5 Discount enum values (confirmed)

`FREE`, `_2X_FREE`, `_2X`, `PERCENT_50`, `PERCENT_30`, `NORMAL`. Companion field `discountEndTime` (timestamp).

---

## 10. Web UI Specification

Design principles: **compact, dense, clean, efficient — not flashy.** Dark mode first-class. Single-page app; all data over a JSON + SSE API from the local server.

### 10.1 Information Architecture

```
/                         Dashboard (default landing)
/torrents                 Active + historical torrents table
/torrents/:id             Torrent detail drawer/page
/rules                    Rule-set editor
/logs                     Log stream (live tail + filter)
/stats                    Historical charts
/settings                 API keys, qBt connection, service controls
```

### 10.2 Page-by-Page

**Dashboard (`/`)**
Top-bar KPI tiles (tight, 6 across on desktop):
- Current site ratio (color-coded against tier threshold)
- Uploaded today / Downloaded today
- Active torrents (leeching / seeding split)
- Grabs in last 24 h
- Free windows expiring in next hour (count)
- Disk free on download target

Below KPIs, two-column layout:
- Left: live activity feed (tail of `logs` table, last 50 entries, color-coded by level)
- Right: sparkline of ratio over last 30 days + sparkline of upload bytes per day

**Torrents (`/torrents`)**
Data table with:
- Columns: Name, Size, Discount (badge), Added, State (qBt state), Ratio, Up, Down, Peers, Remaining Free Time, Actions
- Inline filters per column
- Tabs at top: All | Active | Seeding | Completed | Removed | Errored
- Bulk actions: Pause, Resume, Force-recheck, Remove, Remove+data
- Row click → detail drawer with full torrent metadata snapshot + full history of state transitions + link to M-Team detail page

**Rules (`/rules`)**
- List of rule-sets; toggle enable/disable
- Create/edit via JSON editor (Monaco) with schema validation + a guided form mode for non-JSON users
- "Dry-run" button: evaluates the rule-set against the last 200 seen torrents and shows how many would have matched, with a preview list

**Logs (`/logs`)**
- Live tail via SSE; pause/resume
- Filters: level, component, time range, free-text search
- Export filtered log as `.jsonl`

**Stats (`/stats`)**
- Ratio over time (line chart, configurable window 7d/30d/90d/all)
- Upload bytes per day (bar chart), with overlay of number of torrents grabbed per day
- Rule-set performance breakdown (table + stacked bar: which rule-set contributed what upload volume)

**Settings (`/settings`)**
- M-Team API key (masked; rotate button)
- qBittorrent connection (host, port, user, password; test-connection button)
- Global poll interval (60 s minimum, enforced)
- Default download path, default category, default tags
- Kill switch (prominent, red button)
- Allowed client version check (auto-verifies qBt version against M-Team whitelist, warns if mismatch)

### 10.3 Cross-cutting UI behaviors
- Keyboard shortcuts: `g d` → Dashboard, `g t` → Torrents, `g l` → Logs, `/` → focus search
- All timestamps relative ("3 min ago") with absolute on hover
- All sizes in IEC (GiB) with B/s rates in the torrents table
- Status bar footer: poller status (running/paused), last poll ago, connection status to qBt, connection status to M-Team API
- Toast notifications for state transitions (grabbed, removed, errors) with per-category mute controls

### 10.4 API surface (server → UI)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/dashboard/summary` | KPI tile data |
| GET | `/api/torrents?state=&limit=&cursor=` | Paginated torrent list |
| GET | `/api/torrents/:id` | Single torrent detail + history |
| POST | `/api/torrents/:id/action` | pause/resume/remove/remove-with-data |
| GET | `/api/rules` | List rule-sets |
| PUT | `/api/rules/:id` | Update rule-set |
| POST | `/api/rules/:id/dry-run` | Dry-run against recent seen torrents |
| GET | `/api/logs/stream` (SSE) | Live log stream |
| GET | `/api/logs` | Paginated log query |
| GET | `/api/stats/daily?from=&to=` | Daily stats series |
| GET | `/api/settings` / PUT | Service config |
| POST | `/api/service/pause` / `/resume` | Kill switch |

---

## 11. Compliance & Risk

### 11.1 Site-rule compliance (from M-Team Wiki)

- **Local use only.** No cloud-offline download integration, no exposing the service publicly (bind to `127.0.0.1` by default; explicit opt-in for LAN binding with warning).
- **No account sharing.** API key lives in the user's local config; never transmitted anywhere except M-Team endpoints.
- **No tracker proxy.** We don't touch the tracker URL — qBittorrent does, with the user's own IP.
- **Allowed client enforcement.** On startup and in settings, we check qBt's reported version against the M-Team allowed list (qBt 4.x or 5.x ≤ 5.1.4, not Enhanced-Edition). Warn loudly if mismatch. Refuse to start downloads if user force-enables a disallowed version.
- **Don't call off-limits endpoints.** Honor yeast.js's `UnimplementedMethodError` boundary. Do not re-implement those endpoints via raw HTTP.
- **Poll rate floor.** Hard-coded minimum 60 s, typical 90–120 s.

### 11.2 Technical risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| M-Team API schema change | Medium | High (breaks polling) | Pin `yeast.js` version; integration test suite that hits a test account weekly |
| qBittorrent WebUI API change | Low | Medium | `@ctrl/qbittorrent` abstracts most of it; version-pin |
| User disk fills | High | Medium (downloads fail, seed ruins) | Pre-flight disk check; lifecycle manager removes completed torrents on ratio/time rules; disk-space rule |
| Account warning due to rule violation | Low | Catastrophic | Compliance guards in Section 11.1; warn-before-start for non-whitelisted qBt versions |
| Free window expires mid-download | Medium | Medium | `MIN_HOURS_LEFT` rule; lifecycle manager can stop+remove partially-downloaded torrents if window flipped to paid |
| API key leaks via logs | Medium | High | Mandatory redaction layer on log writer; never log full HTTP request bodies; rotate-key UI affordance |

### 11.3 Legal / product risks

- **TOS alignment.** M-Team permits automation via its official API; we stay inside the documented surface. PM should still review M-Team's terms and include a user-acknowledgment on first run.
- **Distribution.** Tool itself is legal; users' use of it on a private tracker is their responsibility. README must make this explicit.

---

## 12. Implementation Phases

### Phase 0 — Spike / Validation (1 week)
- Confirm every API field referenced in Section 6.2 exists in the Swagger.
- Confirm `genDlToken` response shape and TTL behavior.
- Stand up a throwaway CLI that polls → filters (hardcoded) → submits to qBt. Validate end-to-end grab happens in < 30 s.

### Phase 1 — MVP (3–4 weeks)
- Poller, filter (single hard-coded rule-set), downloader, SQLite persistence.
- Minimal web UI: Dashboard + Torrents table + Settings only.
- Compliance guards (allowed client check, poll-rate floor, kill switch).
- Ships as a single Node process + static SPA. Manual install via npm.

### Phase 2 — v1.0 (3 weeks)
- Rule-set editor + dry-run.
- Lifecycle manager with configurable removal criteria.
- Logs page with SSE live tail.
- Stats page with Recharts.
- One-line installer (PowerShell script for Windows, curl pipe for macOS/Linux).

### Phase 3 — v1.1 polish (2 weeks)
- Keyboard shortcuts, toasts, settings refinements.
- Log redaction hardening.
- Integration test suite against a non-production M-Team test account.

### Phase 4 — v2 candidates (prioritize during v1 beta)
- Telegram notification hook (port from MTeam-Genie).
- Tauri desktop wrap for native-feeling app.
- Tracker adapter abstraction (second tracker support).
- Prometheus `/metrics` endpoint.
- Multi-qBittorrent-instance support.
- Scheduled rule windows (e.g. only grab large torrents overnight).

---

## 13. Open Questions for PM

1. **Primary distribution channel** — npm package? GitHub release with prebuilt binary? Tauri installer? Impacts Phase 2 scope.
2. **Telemetry / crash reporting** — do we phone home? Default off? Opt-in? Current recommendation: off, no telemetry in v1.
3. **Multi-account support** — rare but exists (some users have a test account). Ship as v2 or carve out v1 allowance?
4. **Pricing / licensing** — open source MIT (recommended given the ecosystem)? Source-available? Free-binary-paid-source? Affects community vs. commercial positioning.
5. **Branding** — codename TBD. Suggestions: AutoPilot, BrushPilot, Yeast (after the dependency), Harvester. Needs trademark/availability check.
6. **Support commitment** — what SLA on site-rule changes? M-Team API changes tend to be announced on the site; who watches?
7. **Default rule-set shipped out of the box** — needs PM sign-off. Recommendation: conservative ("FREE only, 1–10 GB, min 5 leechers, min 4 h free left") — safe starter that demonstrates value without risk.

---

## 14. Success Metrics (post-launch)

Technical health:
- p95 time from torrent publication to grab submission < 120 s
- API error rate < 0.5% of calls
- Crash-free session rate > 99.5%

Product outcomes:
- Median user's ratio trajectory over 30 days: positive
- Median grabs/day per active user: 3–15 (sanity band — higher suggests rules too loose; lower suggests rules too tight or site inactivity)
- DAU/MAU ratio > 0.5 (tool is sticky; users leave it running)

Safety:
- Zero bans attributable to the tool across the user base.
- Zero incidents of non-free torrents being grabbed by an active default rule-set.

---

## 15. Glossary

| Term | Definition |
|------|------------|
| PT | Private Tracker |
| Ratio / Share score | `uploaded / downloaded` bytes |
| Freeleech / Free | Download not counted against ratio |
| 2x / 2x-free | Upload counted at 2x; paired with free or not |
| Discount window | Time range during which a torrent carries a non-NORMAL discount |
| Grab | Act of submitting a torrent to qBittorrent |
| Brushing (刷流) | Strategy of running many short-lifetime torrents to accumulate upload |
| Swarm | All peers (seeders + leechers) on a given torrent |
| 魔力值 | "Bonus points" on M-Team; earned by seeding |
| Tracker | The coordinating server that matches peers on a torrent |
| Infohash | SHA-1 of the torrent's info dict; unique per torrent |

---

## 16. Appendix — Pseudo-code reference

Minimal end-to-end flow, for PM to hand to engineering as a starting sanity-check:

```typescript
// Poll -> Filter -> Grab. Runs every 90 s.
async function tick() {
  const run = await db.insertPollRun({ started_at: now() });
  try {
    const { data } = await mteam.seed.search({ mode: 'normal', pageSize: 50 });
    let grabbed = 0;

    for (const t of data.data) {
      if (await db.hasSeen(t.id)) continue;

      const rule = await evaluateAgainstAllActiveRuleSets(t);
      if (!rule.match) {
        await db.insertTorrentEvent({ ...t, decision: 'SKIPPED_RULE',
                                      rejection_reason: rule.reason });
        continue;
      }

      if (await qbt.hasInfohash(t.infohash)) {
        await db.insertTorrentEvent({ ...t, decision: 'SKIPPED_DUP' });
        continue;
      }

      const { url } = await mteam.seed.genDlToken(t.id);
      await qbt.addTorrent({
        urls: [url],
        category: 'mteam-auto',
        tags: [`rule:${rule.name}`, `discount:${t.discount}`],
        paused: false,
      });

      await db.insertTorrentEvent({ ...t, decision: 'GRABBED',
                                    matched_rule: rule.name });
      grabbed++;
    }

    await db.finishPollRun(run.id, { torrents_seen: data.data.length,
                                     torrents_grabbed: grabbed });
  } catch (err) {
    await db.finishPollRun(run.id, { error: String(err) });
    await log.error('poller', err);
  }
}
```

---

*End of initial concept. Next step: PM review, prioritize open questions in Section 13, then produce detailed spec per phase.*
