# Dashboard Review & Optimization Plan

> **Doc ID:** DASHBOARD_REVIEW.md
> **Date:** 2026-04-19
> **Scope:** `web/src/pages/DashboardPage.tsx`, `src/http/routes/dashboard.ts`, `src/http/routes/stats.ts`, and the four data sources that back them (`profile_snapshots`, `transfer_snapshots`, `torrent_events`, `stats_daily`).
> **Reference docs:** [MTEAM_API.md](./MTEAM_API.md), [STATUS.md](./STATUS.md), [UI_DESIGN.md](./UI_DESIGN.md).
> **Reading order:** §1 summary → §2 inventory of what exists → §3 gaps & proposals → §4 concrete upload/download widget spec → §5 prioritized change list → §6 implementation notes.

---

## 1. Executive summary

The dashboard is in a good place as of the v1.0 snapshot: six KPI tiles with 1h/24h trend pills, a ratio/bonus area chart, a dual-axis download/upload speed chart with linear/log toggle, a 14-day stacked grab-count bar chart, an account-tier card, and a live downloads table.

However, there are meaningful gaps when measured against what the M-Team API exposes and what the DB already stores. The biggest miss is that `profile_snapshots.uploaded_bytes` and `profile_snapshots.downloaded_bytes` have been written every 15 minutes since MVP, but nothing on the dashboard reads them — so the user has no visibility into absolute upload/download volumes or the **rate** at which they're accumulating. Adding upload/download total tiles plus a 7-day cumulative/derivative chart is a half-day change with full data already on disk.

Other findings:

- The `/api/stats/ruleset-performance` endpoint is implemented and unused. Per-rule grab/skip ratios belong on the dashboard (or on the Rules page) — currently the user has no way to see which of their rule sets are actually firing.
- The `/api/stats/torrent-states` endpoint is implemented and unused — the state-distribution donut was removed during the STATUS.md §3.15 redesign but the endpoint was kept. Either delete it or surface a compact state breakdown.
- The `Speed — 60m` card refetches every 10 seconds, but `transferProbe` only writes new samples every 60 s. That's a 6× waste of backend calls and produces no new pixels 5 times out of 6.
- The Disk tile computes a percentage from `harvester_used + disk_free`, which is misleading: "used" is Harvester-tagged torrents only, not the whole filesystem. The bar fills as though Harvester owned the disk.
- `stats_daily.uploaded_bytes` / `downloaded_bytes` copy qBt's **session-cumulative** counters (`up_info_data` / `dl_info_data`) rather than the per-day delta. After a qBt restart those counters reset mid-day; consumers reading `stats_daily` will see it drop to zero. The `profile_snapshots` series is the only reliable daily-volume source.
- The `DISCOUNT_COLOR` map in `DashboardPage.tsx` still has `PERCENT_30`, which MTEAM_API.md §3.3 confirms doesn't exist in production (only `PERCENT_70` = "pay 70% = 30% off"). Dead key.
- No way to change the time window on the ratio chart (locked to 24h) or the grabs chart (locked to 14d). `profile_snapshots` keeps 15-min samples indefinitely, so longer windows are cheap.
- M-Team-side data that's fetched on every profile probe but thrown away: `seedtime`, `leechtime`, `memberStatus.{vip, donor, warned, leechWarn}`, `memberCount.shareRate`. At least `warned` / `leechWarn` belong on the dashboard as a prominent alert — they're directly adjacent to the tier card's semantic space.
- Two M-Team endpoints probed during the spike and documented as "unused": `POST /system/online` and `POST /system/torrentCount`. Both are one-row payloads that would give the dashboard context ("M-Team has N total torrents; M added in the last 24h; K users online right now") at effectively zero cost.

---

## 2. Inventory — what exists today

### 2.1 UI components

| Section | Component | Data source | Refresh cadence |
|---------|-----------|-------------|-----------------|
| KPI strip | Ratio (with 1h delta pill) | `/api/dashboard/summary` → `profile_snapshots` | 10 s |
| KPI strip | Bonus points (with 1h delta pill) | same | 10 s |
| KPI strip | Grabs 24h (with delta-vs-prev-24h) | same, via `torrent_events` count | 10 s |
| KPI strip | Active | same, via `qbt.listTorrents({tag:'harvester'})` | 10 s |
| KPI strip | Stalled / error | same | 10 s |
| KPI strip | Disk (Harvester used / free GiB) | same | 10 s |
| Row 2 left | Ratio & bonus — 24h area chart | `/api/stats/profile-snapshots?hours=24` | 60 s |
| Row 2 right | Speed — 60m stacked down/up | `/api/stats/transfer-snapshots?minutes=60` | **10 s (too fast)** |
| Row 3 left | Grabs per day by discount (14d) | `/api/stats/grabs-by-day?days=14` | 60 s |
| Row 3 right | Account tier card | `/api/dashboard/summary` | 10 s |
| Row 4 | Downloads table | `/api/torrents?limit=50` | 3 s |

### 2.2 Data available but not shown

| Source | Field | Used on dashboard? |
|--------|-------|--------------------|
| `profile_snapshots.uploaded_bytes` | lifetime upload | **No** |
| `profile_snapshots.downloaded_bytes` | lifetime download | **No** |
| `profile_snapshots.raw_payload` (MTeamProfile.seedtime) | total seconds seeding | **No** |
| `profile_snapshots.raw_payload` (MTeamProfile.leechtime) | total seconds leeching | **No** |
| `profile_snapshots.raw_payload` (memberCount.shareRate) | M-Team's own ratio string | **No** — we recompute from up/down bytes |
| `profile_snapshots.raw_payload` (memberStatus.warned) | account warned flag | **No** |
| `profile_snapshots.raw_payload` (memberStatus.leechWarn) | leech-warn flag | **No** |
| `profile_snapshots.raw_payload` (memberStatus.vip / donor) | perk flags | **No** |
| `/api/stats/ruleset-performance` | per-rule grab/skip/error counts | **No** (endpoint exists, not wired) |
| `/api/stats/torrent-states` | state distribution | **No** (endpoint exists, not wired) |
| `stats_daily.ratio_end_of_day` | historical daily ratio | **No** |
| `stats_daily.bonus_points_end_of_day` | historical daily bonus | **No** |
| `/system/online` (M-Team) | community KPI | Not fetched |
| `/system/torrentCount` (M-Team) | community KPI | Not fetched |
| `/torrent/fav` (M-Team) | user's favorited torrents | Not fetched |
| Torrent detail `mediainfo` / `descr` / `imageList` | rich metadata | Not fetched for dashboard |

---

## 3. Gaps & proposed improvements

### 3.1 Upload / download totals are missing

**Problem.** The profile probe has been writing `uploaded_bytes` and `downloaded_bytes` to `profile_snapshots` every 15 minutes since MVP. Neither value surfaces anywhere in the UI. The user has to read raw SQL to see how much they've ever uploaded or how fast their totals grew today.

**Proposal.** Add two KPI tiles to the strip and a new "Up/Down totals — N-day" area chart. Concrete spec is in §4.

### 3.2 Speed card over-refreshes

**Problem.** `SpeedCard` refetches every 10 s; `transferProbe` writes every 60 s. The extra poll rate costs 5 redundant backend round-trips per minute, each running a non-trivial SQL over `transfer_snapshots`.

**Fix.** Change the `refetchInterval` on the speed card query to `60_000`. Keep the KPI strip at 10 s because it reads from qBt live (active/stalled counts are volatile) — but the speed chart reads from a table that's only written once a minute.

```tsx
// web/src/pages/DashboardPage.tsx, SpeedCard()
const q = useQuery({
  queryKey: ['stats', 'transfer-snapshots', 60],
  queryFn: () => api.get<{ items: TransferSnap[] }>('/api/stats/transfer-snapshots?minutes=60'),
  refetchInterval: 60_000, // was 10_000 — transferProbe samples every 60 s
});
```

### 3.3 Disk tile is misleading

**Problem.** `DiskTile` computes `pctUsed = usedGib / (usedGib + freeGib) * 100`, where `usedGib` is sum of Harvester torrent bytes only. A 2 TiB disk that has 200 GiB of Harvester torrents + 1 TiB of unrelated files + 800 GiB free will render as `200 / (200 + 800) = 20 %` used — which hides that the disk is actually 60 % full.

**Fix.** Two options, pick one:

1. **Honest about Harvester-only:** Remove the progress bar. Render two numbers: "Harvester footprint: X GiB" and "Disk free: Y GiB". No implied total.
2. **True-total aware:** Extend `freeGib` in [`src/util/disk.ts`](../src/util/disk.ts) to also return `totalGib`. Render two progress bars — the outer one is `totalGib - freeGib` / `totalGib` (full-disk usage), the inner segment is `harvester_used_bytes` / `totalGib` (Harvester's share).

Option 2 is the richer visual; option 1 is a 10-minute patch. Recommend option 2.

### 3.4 Ratio / grabs charts have no time-window toggle

**Problem.** Ratio chart hard-coded to 24 h, grabs chart hard-coded to 14 d. `/api/stats/profile-snapshots` already accepts `hours` up to 720 (30 d) and `/api/stats/grabs-by-day` accepts `days` up to 90. The data is already there, but the UI can't see past 24 h / 14 d.

**Fix.** Add a small segmented control on each chart header. For ratio: `1h | 24h | 7d | 30d`. For grabs: `7d | 14d | 30d | 90d`. Pattern is already established by the `linear | log` toggle in `SpeedCard`.

### 3.5 Per-rule performance is invisible

**Problem.** `/api/stats/ruleset-performance` returns per-rule `{grabs, skips, errors}` over a configurable window, but nothing consumes it. Users with more than one rule set have no way to see which ones are working.

**Fix.** Add a new card "Rule performance — 14d" between the grabs chart and the tier card (a 3-column grid row), showing a horizontal bar per rule with grabs (green) / skips (gray) / errors (red) stacked. Orders by grab count descending. Click-through to the Rules page with the rule pre-selected.

Alternative: promote this to the Rules page only. Either is fine; dashboard placement is the higher-visibility option if the user actively curates rules.

### 3.6 Account health signals are dropped on the floor

**Problem.** `memberStatus.warned`, `memberStatus.leechWarn`, `memberStatus.vip`, `memberStatus.donor` are in the raw profile JSON we persist in `profile_snapshots.raw_payload` but nothing on the dashboard reads them. A `warned` account is one step from a ban; surfacing it elsewhere in the app (even just a log line) is not enough.

**Fix.**

1. Add `warned: boolean` and `leech_warn: boolean` and `vip: boolean` as columns in a follow-up migration (or stash them in a typed projection from `raw_payload` if migrations are painful), normalize them in `normalizeMTeamProfile`, add them to `DashboardSummary`.
2. If `warned || leechWarn` is true, render a red banner above the KPI strip: "Account is warned — ratio must exceed X by Y to clear". If `vip` is true, a small purple chip next to the tier card.

### 3.7 Seed / leech time are dropped on the floor

**Problem.** MTeamProfile exposes `seedtime` and `leechtime` in total seconds. These are arguably more actionable than upload/download bytes because M-Team's seed-time-based bonus accrual is what generates the `bonus_points` we already chart.

**Fix.** Persist both fields on each snapshot (new columns in `profile_snapshots`: `seedtime_sec`, `leechtime_sec`), and add a single KPI tile: "Seeding time — total" with the 24h delta pill. Users love this number; it makes the abstract `bonus_points` concrete.

### 3.8 Community context is free data, not fetched

**Problem.** `POST /system/online` returns `{totalOnline, signInOnline, …}` and `POST /system/torrentCount` returns `{total, todayAdded, …}`. Both are documented in MTEAM_API.md §8 as observed-working endpoints. Neither is currently called.

**Proposal.** Add a `communityProbe` worker (10-minute cadence, reuses the existing `loopWorker` pattern), write the results to a new `community_snapshots` table (`ts, total_online, sign_in_online, torrent_total, torrent_today_added`), and add a single line above the KPI strip: "M-Team: 12,345 users online · 1,402,337 torrents (+823 today)".

Costs: +1 table, +1 worker, +1 route, maybe 60 LoC total. Risk: near zero — both endpoints were probed successfully without errors.

### 3.9 Grabs chart: discount color palette has dead entries & inconsistent names

**Problem.** `DISCOUNT_COLOR` in `DashboardPage.tsx` includes `PERCENT_30`, which the spike confirmed doesn't exist (only `PERCENT_70`). `_2X_FREE` uses purple, `_2X_PERCENT_50` uses pink — visually disconnected despite both being 2×-bonus variants.

**Fix.** Remove `PERCENT_30`. Adopt a two-dimensional palette where **hue** = download cost (green for free / yellow for 50% / orange for 30% / gray for normal) and **saturation / pattern** = upload multiplier (stronger/stripe for 2× variants). Or collapse onto the 4-bucket UI mapping from STATUS.md §3.6 and let the tooltip reveal the underlying enum.

### 3.10 `stats_daily.uploaded_bytes` is not a daily volume

**Problem.** `statsDailyRollup` writes `uploaded_bytes = info.up_info_data`, which is qBt's **session-cumulative** counter. It's been `0` after every qBt restart until the next session accumulates bytes. It is NOT the volume uploaded on that specific day, despite the column name implying otherwise.

**Fix.** Redefine the column. The cleanest source is the M-Team profile series: the upload delta for a day = `profile_snapshots.uploaded_bytes` at the last sample of `day N` minus the last sample of `day N-1`. Change the rollup to compute that and store it. Add a backfill migration or just accept that historical rows have garbage and let the chart render from today.

This also unlocks a trivial "Uploaded today / Downloaded today" KPI tile that actually means something.

### 3.11 Torrent-states distribution endpoint exists but isn't visualized

**Problem.** Per STATUS.md §3.15 the donut was deliberately removed, but the endpoint stayed. Either kill the endpoint or bring back a lightweight visualization.

**Proposal.** Add a compact stacked horizontal bar (not a donut) under the KPI strip: a single row showing `downloading / seeding / stalled_dl / stalled_up / paused / checking / error` with counts as labels. 40 px tall; takes no chart real estate. Same information, less geometry.

---

## 4. Spec — "Uploaded & Downloaded totals + trends" widget

This is the user's explicitly-requested example. Here's the concrete spec.

### 4.1 Two new KPI tiles

Insert between "Bonus points" and "Grabs (24h)" in the strip:

| Tile | Value | Delta pill |
|------|-------|------------|
| **Uploaded — total** | `formatBytes(uploaded_bytes)` | `+formatBytes(uploaded_24h_delta)` vs. prev 24h |
| **Downloaded — total** | `formatBytes(downloaded_bytes)` | `+formatBytes(downloaded_24h_delta)` vs. prev 24h |

Grid changes from 6 columns to 8, or drop a less-load-bearing tile (Stalled/error could collapse into a single compact tile since the current "Active" already hints at stall count).

### 4.2 Extend `DashboardSummary` (`shared/types.ts`)

```ts
export interface DashboardSummary {
  // ... existing fields ...

  /** Cumulative lifetime uploaded bytes (from latest profile snapshot). */
  uploaded_bytes_total: number | null;
  /** Bytes uploaded in the last 24h — delta between now and 24h-ago snapshot. */
  uploaded_bytes_24h: number | null;
  /** Delta vs. the 24h-before-24h window. */
  uploaded_bytes_delta_24h: number | null;

  downloaded_bytes_total: number | null;
  downloaded_bytes_24h: number | null;
  downloaded_bytes_delta_24h: number | null;
}
```

### 4.3 Dashboard route change (`src/http/routes/dashboard.ts`)

```ts
// After loading `snap = getLatestProfileSnapshot(deps.db);`
const snap24h = deps.db
  .prepare(
    'SELECT uploaded_bytes, downloaded_bytes FROM profile_snapshots WHERE ts <= ? ORDER BY ts DESC LIMIT 1',
  )
  .get(now - 86400) as { uploaded_bytes: number; downloaded_bytes: number } | undefined;

const snap48h = deps.db
  .prepare(
    'SELECT uploaded_bytes, downloaded_bytes FROM profile_snapshots WHERE ts <= ? ORDER BY ts DESC LIMIT 1',
  )
  .get(now - 2 * 86400) as { uploaded_bytes: number; downloaded_bytes: number } | undefined;

const uploaded_bytes_24h =
  snap && snap24h ? snap.uploaded_bytes - snap24h.uploaded_bytes : null;
const uploaded_bytes_prev_24h =
  snap24h && snap48h ? snap24h.uploaded_bytes - snap48h.uploaded_bytes : null;
const uploaded_bytes_delta_24h =
  uploaded_bytes_24h != null && uploaded_bytes_prev_24h != null
    ? uploaded_bytes_24h - uploaded_bytes_prev_24h
    : null;
// ... same for downloaded_bytes
```

The query reads one indexed row each — cheap.

### 4.4 New chart: "Up/Down volume — N days"

Place in the current Row 2 slot after moving/resizing:

- **X-axis:** day (local MM-DD).
- **Two stacked series:**
  - Uploaded bytes per day (derivative of `profile_snapshots.uploaded_bytes`).
  - Downloaded bytes per day (negative direction, mirrored below the axis — a "butterfly" chart so positive-space is upload, negative-space is download, and the ratio between the two sides is visually the share-ratio).
- **Y-axis tick formatter:** `formatBytes` (GiB / TiB as appropriate).
- **Time-window toggle:** `7d | 14d | 30d | 90d`, defaults to 7d.
- **Backend endpoint:** new `GET /api/stats/profile-volume?days=N` returning per-day `{day, uploaded_delta, downloaded_delta}`. SQL:

  ```sql
  WITH per_day AS (
    SELECT
      date(ts, 'unixepoch', 'localtime') AS day,
      MAX(uploaded_bytes)                 AS up_end,
      MAX(downloaded_bytes)               AS down_end
    FROM profile_snapshots
    WHERE ts >= ?
    GROUP BY day
  )
  SELECT
    day,
    up_end   - LAG(up_end,   1, 0) OVER (ORDER BY day) AS uploaded_delta,
    down_end - LAG(down_end, 1, 0) OVER (ORDER BY day) AS downloaded_delta
  FROM per_day
  ORDER BY day ASC;
  ```

  The first row is dropped (or clamped to 0) because there's no prior-day baseline.

- **Alternative simpler version:** a **cumulative** area chart (not a derivative) — just `uploaded_bytes` and `downloaded_bytes` raw from `/api/stats/profile-snapshots?hours=168` (7 days) plotted as two areas. Simpler backend (zero new endpoint needed) but less informative — user can tell the direction but not the rate. Recommend the derivative version.

### 4.5 Expected payoff

- User finally has a direct answer to "how much did I upload today?" — currently unanswerable without raw DB queries.
- Anomaly detection: a day where `downloaded >> uploaded` is visually obvious — often correlates with a misconfigured rule that started grabbing too many private tracker torrents.
- Capacity planning: 30-day trend makes "I'm burning 500 GiB/day and my disk is 2 TiB" obvious.

---

## 5. Prioritized change list

Ordered by (user-visible value) / (implementation effort).

| # | Change | Effort | Payoff | Priority |
|---|--------|--------|--------|----------|
| 1 | §3.2 fix Speed card refetch to 60s | 5 min | Silent backend win | **Quick fix** |
| 2 | §3.9 remove dead `PERCENT_30` color key | 2 min | Code hygiene | **Quick fix** |
| 3 | §4 add Uploaded/Downloaded KPI tiles + 24h deltas | 0.5 day | Directly requested; data already on disk | **P0** |
| 4 | §4.4 add up/down volume butterfly chart | 0.5 day | Completes the volume story | **P0** |
| 5 | §3.3 fix Disk tile accuracy (option 2) | 0.5 day | Removes a known misleading visual | **P1** |
| 6 | §3.4 add time-window toggles on ratio + grabs charts | 0.5 day | Unlocks data we already have | **P1** |
| 7 | §3.6 surface `warned` / `leechWarn` banner | 0.5 day (migration + UI) | Protects user from bans | **P1** |
| 8 | §3.5 per-rule performance card | 0.5 day | Endpoint exists; just wire it | **P1** |
| 9 | §3.10 redefine `stats_daily.{uploaded,downloaded}_bytes` to true daily deltas | 0.5 day (+ doc update) | Removes a semantically wrong column | **P2** |
| 10 | §3.7 persist + chart `seedtime` / `leechtime` | 1 day | Delight feature; commonly requested | **P2** |
| 11 | §3.11 replace states endpoint with compact stack bar | 0.5 day | Small visual win | **P2** |
| 12 | §3.8 `communityProbe` worker + context line | 1 day (incl. new table) | Free data; nice-to-have | **P3** |

Total P0 + P1 ≈ 3 days of engineering. P0 alone ≈ 1 day.

---

## 6. Implementation notes

### 6.1 No schema-migration-free path for warning/seedtime columns

Adding `warned`, `leech_warn`, `seedtime_sec`, `leechtime_sec` columns to `profile_snapshots` requires a migration (0003). The `raw_payload` TEXT blob already contains them — a short-term workaround is to parse `JSON_EXTRACT(raw_payload, '$.memberStatus.warned')` in the dashboard route's SQL and skip the migration entirely. Cheap but couples the route to the persisted JSON layout. Recommend the migration for forward compatibility.

### 6.2 Recharts butterfly/mirrored chart

Recharts doesn't ship a "butterfly" primitive but it can be done with an `AreaChart`, mirroring by multiplying the downloaded series by -1 before handing to the chart, and applying a `tickFormatter` on the Y-axis that calls `formatBytes(Math.abs(v))`. Pattern:

```tsx
const data = items.map((d) => ({
  day: d.day.slice(5),
  up: d.uploaded_delta,
  down: -d.downloaded_delta, // mirror
}));
```

With two `<Area>` elements stacked on the same axis.

### 6.3 Don't break the `DashboardSummary` wire contract

The summary type is consumed by at least `App.tsx` (for the footer chip) and `DashboardPage.tsx`. New fields should be additive + nullable so old clients don't crash during staggered reloads.

### 6.4 Time-window toggle pattern

There's no shared `<SegmentedControl>` component; the `linear | log` toggle in `SpeedCard` was built inline. If we're adding two more toggles (ratio, grabs), it's worth extracting a 30-line `SegmentedControl` into `web/src/components/` to avoid a third copy.

### 6.5 Query-key hygiene

When the window is configurable, the TanStack Query key must include it: `['stats', 'profile-snapshots', hours]`, not just `['stats', 'profile-snapshots']`. Otherwise the cache collides across windows and the chart flashes stale data while the new window is fetching.

### 6.6 Refetch cadence reference

| Query | Current | Recommended |
|-------|---------|-------------|
| `dashboard.summary` | 10 s | 10 s (OK) |
| `stats.profile-snapshots` | 60 s | 60 s (OK — sampling is 15 min but delta pills re-read here) |
| `stats.transfer-snapshots` | 10 s | **60 s** (sampling cadence) |
| `stats.grabs-by-day` | 60 s | 60 s (OK) |
| `torrents` | 3 s | 3 s (OK — live torrent list) |
| `stats.ruleset-performance` (new) | — | 60 s |
| `stats.profile-volume` (new) | — | 60 s |

---

## 7. Out of scope (parked)

- Redesigning the KPI strip for mobile (<1024 px). STATUS.md §4 already defers this.
- Prometheus exposition format for `/api/metrics`. Unrelated to dashboard; tracked separately.
- Real-time SSE push for dashboard cards. The current poll-based model is adequate; pushing would shift the refactor surface without measurable UX gain.
- Per-torrent-category rollups (category is a numeric id we don't map to human names; would need a category lookup table).

---

## 8. References

- [MTEAM_API.md §7](./MTEAM_API.md) — profile fields available on every probe.
- [MTEAM_API.md §8](./MTEAM_API.md) — `/system/online`, `/system/torrentCount` probes.
- [STATUS.md §3.15](./STATUS.md) — prior dashboard redesign and rationale for the current layout.
- [STATUS.md §2.3](./STATUS.md) — DB tables in play.
- `web/src/pages/DashboardPage.tsx` — 918 LoC, top-level component + all sub-components.
- `src/http/routes/dashboard.ts` — summary endpoint, 80 LoC.
- `src/http/routes/stats.ts` — all chart-backing endpoints, 128 LoC.
- `src/workers/profileProbe.ts` — writes `profile_snapshots` every 15 min.
- `src/workers/transferProbe.ts` — writes `transfer_snapshots` every 60 s.
- `src/workers/statsDailyRollup.ts` — writes `stats_daily` every 15 min.

*End of DASHBOARD_REVIEW.md.*
