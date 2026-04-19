# Dashboard v2 — Design-System Plan & UI Handoff

> **Doc ID:** DASHBOARD_UI_HANDOFF.md
> **Date:** 2026-04-19
> **Depends on:** [UI_DESIGN.md](./UI_DESIGN.md) (canonical token + component library), [UI_HANDOFF.md](./UI_HANDOFF.md) (v1 handoff), [DASHBOARD_REVIEW.md](./DASHBOARD_REVIEW.md) (change rationale), [STATUS.md](./STATUS.md) §3.15 (prior redesign notes), [MTEAM_API.md](./MTEAM_API.md) §7–§8 (data sources).
> **Supersedes:** Dashboard section of UI_HANDOFF.md only. No token or shared-component changes outside Dashboard scope.
> **Audience:** Engineer implementing the v2 dashboard.
> **Reading order:** §A (audit + extend) → §B (handoff spec). §A is rationale; §B is the build sheet.

---

# Part A — Design-System Pass

## A.1 Audit summary

| Dimension | Findings |
|-----------|----------|
| **Token coverage** | Dashboard components use tokens consistently except `DashboardPage.tsx` `DISCOUNT_COLOR` map, which hardcodes hex values instead of referencing the fixed palette in UI_DESIGN §1.1. Also contains a dead `PERCENT_30` key (doesn't exist in production per MTEAM_API §3.3). |
| **Naming consistency** | KPI tile uses label casing `Stalled / error` with spaces around `/` — all other UI_DESIGN tiles use `Disk (Harvester)` style. Align. The chart title `Ratio & bonus — 24h` uses em-dash; the grabs chart uses em-dash too — consistent. Speed card header reads `Speed — 60m` which works. |
| **Component reuse** | Speed card rolls its own header with inline linear/log toggle that duplicates pattern twice. A shared `<SegmentedControl>` primitive is missing from the v1 library and is forced by three new use-cases (ratio window, grabs window, volume window). |
| **State coverage** | v1 dashboard has good `loading` and `empty` states on charts; missing `error` state on `SpeedCard`, `RatioChart`, `GrabsChart` (they render an empty state regardless of whether the query failed or returned zero rows). |
| **Accessibility** | `DeltaPill` uses color + arrow to indicate direction — sufficient for WCAG 1.4.1 (color alone not the only channel). Good. However, the `IconBtn` in `DownloadsTable` row actions renders `title` but no `aria-label`. Fix required; UI_DESIGN §2.2 mandates `aria-label`. |
| **Responsive** | Dashboard is locked to 6-column KPI grid. Growing to 8 tiles needs an explicit wrap policy below `xl` (1536 px). |
| **Density** | Current dashboard scrolls > 1 screen on a 1440×900 laptop. Adding more widgets without reorganizing will make it worse. Plan includes a compact row-density pass. |

## A.2 Priority actions

1. Extract `SegmentedControl` primitive; refactor `SpeedCard` to use it.
2. Replace raw hex in `DISCOUNT_COLOR` with CSS-var lookups bound to UI_DESIGN §1.1 discount-badge palette. Drop `PERCENT_30`.
3. Add two new KPI tiles (`UploadTotalTile`, `DownloadTotalTile`) — no new base component needed; they extend the existing `KpiTile`.
4. Introduce three new **composite** components:
   - `VolumeButterflyChart` — mirrored-axis dual-series area chart.
   - `RulePerformanceBar` — horizontal stacked bar list.
   - `StateStripBar` — compact stacked horizontal bar (replaces the removed donut).
5. Introduce one new **feedback** component: `AccountHealthBanner` — sits above the KPI strip when `warned`/`leechWarn` is true.
6. Extend `DiskTile` to render both "full-disk used" and "Harvester share" segments. API side: extend `freeGib()` → `diskStats()` returning `{freeGib, totalGib}`.

## A.3 Extended component index (delta from v1)

| Component | Status | Spec section |
|-----------|--------|--------------|
| `SegmentedControl` | **NEW** | §B.4.1 |
| `KpiTile` | Existing — no API change; new instances only | §B.4.2 |
| `DeltaPill` | Existing — unchanged | — |
| `DiskTile` | **MODIFIED** (dual-segment bar) | §B.4.3 |
| `VolumeButterflyChart` | **NEW** | §B.4.4 |
| `RulePerformanceBar` | **NEW** | §B.4.5 |
| `StateStripBar` | **NEW** | §B.4.6 |
| `AccountHealthBanner` | **NEW** | §B.4.7 |
| `CommunityContextLine` | **NEW (P3)** | §B.4.8 |
| `RatioChart` / `GrabsChart` / `SpeedCard` | **MODIFIED** (segmented-control time window, error state) | §B.4.9 |
| `DiscountBadge` | Existing — tokenization fix | §B.4.10 |

---

# Part B — Developer Handoff Spec

## B.1 Overview

Dashboard v2 is a re-layout of `web/src/pages/DashboardPage.tsx` that surfaces upload/download volume (the highest-value gap per DASHBOARD_REVIEW.md §4), wires two existing-but-unused backend endpoints (ruleset performance, torrent states), and corrects three known visual bugs (misleading disk bar, over-fetching speed card, missing account-health signal).

The page keeps its desktop-first focus (>= 1024 px, per UI_DESIGN §1.10). Light/dark parity must be preserved — no dark-only tokens introduced. All new text is subject to UX copy review (see §B.9 for proposed strings).

## B.2 Layout

12-column CSS Grid, 24 px column gap, 16 px row gap. Page horizontal padding `--space-6` (24 px). Max-width 1440 px.

```
┌───────────────────────────────────────────────────────────────────────┐
│ Row 0  AccountHealthBanner (conditional, spans 12)                    │
│ Row 0b CommunityContextLine (optional, spans 12, 20 px tall)          │
├───────────────────────────────────────────────────────────────────────┤
│ Row 1  KPI strip (8 tiles, 1.5 cols each → 12 cols)                   │
│ [Ratio][Bonus][Up total][Dn total][Grabs 24h][Active][Issues][Disk]   │
├───────────────────────────────────────────────────────────────────────┤
│ Row 2  StateStripBar (spans 12, 40 px tall)                           │
├───────────────────────────────────────────────────────────────────────┤
│ Row 3  Ratio & bonus chart (6)     │   Speed 60m chart (6)            │
├───────────────────────────────────────────────────────────────────────┤
│ Row 4  Up/Dn volume chart (7)      │   Rule performance (5)           │
├───────────────────────────────────────────────────────────────────────┤
│ Row 5  Grabs/day chart (7)         │   Account tier (5)               │
├───────────────────────────────────────────────────────────────────────┤
│ Row 6  Downloads table (spans 12)                                     │
└───────────────────────────────────────────────────────────────────────┘
```

Responsive wrap (see §B.3).

## B.3 Responsive behavior

| Breakpoint | Columns | KPI strip | Chart rows |
|------------|---------|-----------|------------|
| `2xl` ≥ 1920 px | 12 | 8 tiles × 1.5 col = 1 row | 2-up (6/6, 7/5, 7/5) |
| `xl` ≥ 1536 px | 12 | 8 tiles × 1.5 col = 1 row | 2-up |
| `lg` 1280–1535 px | 12 | **4 tiles per row × 2 rows** (3 col each) | 2-up |
| `md` 1024–1279 px | 12 | **4 × 2 rows** (3 col each); Disk tile wraps below Issues | Single-column stack |
| < 1024 px | 1 | Stacked, 1 per row | Stacked; `AccountHealthBanner` stays; "Not fully supported below 1024 px" info banner stays per UI_DESIGN §1.10 |

Grid does NOT reflow mid-row — tiles wrap as whole units. `xl`/`2xl` is the only layout where "everything fits in one row" of KPIs; at `lg` the tiles wrap 4-by-4 with identical heights.

## B.4 Components

### B.4.1 SegmentedControl (NEW)

A compact group of mutually exclusive pill-style buttons. Reuses the same visual DNA as the existing linear/log toggle in v1 `SpeedCard`.

**Props**
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `options` | `{value, label}[]` | — | 2–6 options. More than 4 looks crowded. |
| `value` | string | — | Controlled value. |
| `onChange` | `(v: string) => void` | — | |
| `size` | `'xs' \| 'sm'` | `'xs'` | Chart headers use `xs`; page-level uses `sm`. |
| `aria-label` | string | — | Required. E.g. `"Time window"`. |

**Visual**
- Container: `--bg-surface-alt` background, 1 px `--border-subtle`, `--radius-sm`, inner `display:flex`.
- Size `xs` (chart headers): height 20 px; each option `px-2`, text-mono `10 px` (borrow `--text-xs` sizing; `font-mono`).
- Size `sm` (page-level filters): height 24 px; text-xs.
- Active option: background `--bg-surface` (lifts above the container), text `--text-primary`.
- Inactive option: background transparent, text `--text-muted`; hover → `--text-primary`.
- Focus: 2 px `--focus-ring` on the active option's outer edge (outline, not box-shadow, per UI_DESIGN §2.23).

**States**
| State | Visual | Behavior |
|-------|--------|----------|
| Default (inactive) | `--text-muted` on transparent | Clickable |
| Hover (inactive) | `--text-primary` on transparent | — |
| Active | `--text-primary` on `--bg-surface` | Non-clickable no-op on re-click |
| Focus-visible | 2 px `--focus-ring`, 2 px offset on the container | Keyboard navigable via ← → |
| Disabled (whole control) | 60 % opacity, `cursor: not-allowed` | All options inert |

**Accessibility**
- Role: `radiogroup`; each option is `role="radio"`, `aria-checked` mirrors `value`.
- Keyboard: ← → move between options (wraps); Home/End jump to first/last; Space/Enter commits (but visual change is instant on hover so this mostly no-ops).
- Screen reader: announces "Time window, 24h, radio, 2 of 4".

### B.4.2 KpiTile (EXISTING — new instances)

The v1 `KpiTile` needs no API change. Two new instances use it verbatim:

| Instance | `label` | `value` | `delta` | `deltaFormatter` | `deltaSuffix` |
|----------|---------|---------|---------|------------------|---------------|
| Upload total | `UPLOADED` | `formatBytes(uploaded_bytes_total)` | `uploaded_bytes_delta_24h` | `formatBytes` | `vs prev 24h` |
| Download total | `DOWNLOADED` | `formatBytes(downloaded_bytes_total)` | `downloaded_bytes_delta_24h` | `formatBytes` | `vs prev 24h` |

Icon mapping: `Upload` (Lucide) for upload, `Download` for download. Value rendered with `--text-mono-xl` (24 px mono 500) per UI_DESIGN §1.3.

### B.4.3 DiskTile (MODIFIED)

Replaces the v1 component's misleading single-bar percentage. Visual:

```
 [🖴]   DISK
         1.24 TiB used   ·   384 GiB free   of 2.00 TiB
         ┌─────────────────────────────────────────────┐
         │██████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░│   ← full-disk used (default fg)
         │████▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░│   ← Harvester share (brand fg)
         └─────────────────────────────────────────────┘
         Harvester: 412 GiB (33 % of used)
```

**Spec**
- Outer bar: height 4 px, `--bg-surface-alt` track, fill `--text-secondary` up to `(total - free) / total`.
- Inner bar (directly under outer, 4 px gap): height 3 px, same track, fill `--brand-500` up to `harvester_used / total`.
- When `free < 10 GiB`: outer fill is `--danger-500`, tile gets a 2 px `--danger-500` left border, KPI value turns `--danger-500`.
- When `free < 50 GiB`: outer fill `--warn-500`, no border accent.
- When `free ≥ 50 GiB`: outer fill `--text-secondary` (neutral).

**Requires backend change:** extend `src/util/disk.ts`:
```ts
export interface DiskStats { freeGib: number; totalGib: number; usedGib: number; }
export function diskStats(p: string): DiskStats;
```
Expose `total_gib` on `DashboardSummary`.

### B.4.4 VolumeButterflyChart (NEW)

Mirrored-axis area chart: upload deltas go up (positive y), download deltas go down (negative y).

**Props**
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `items` | `{day: string; uploaded_delta: number; downloaded_delta: number}[]` | — | One row per day, ISO date |
| `window` | `'7d' \| '14d' \| '30d' \| '90d'` | `'14d'` | Drives empty/skeleton messaging |
| `height` | number (px) | 224 | — |

**Visual**
- Chart area split by a 1 px `--border-subtle` center line (y = 0).
- Upload series: stroke `--success-500`, gradient fill from `--success-500 / 0.35` at y=0 to `0` at y=max. Strip top-right indicator: "▲ uploaded".
- Download series: stroke `--info-500` (blue), gradient fill from `--info-500 / 0.35` at y=0 to `0` at y=-max. Strip bottom-right indicator: "▼ downloaded".
- Y-axis hidden; tooltip carries values. X-axis: text-xs, `--text-muted`, ticks at day boundaries; `minTickGap=40`.
- Tooltip (shared with other charts): `--bg-overlay` background, 1 px `--border-default`, 8 px padding, text-xs.
  - Row 1: day (e.g. `2026-04-18`).
  - Row 2: `▲ Uploaded  12.4 GiB` in `--success-500`.
  - Row 3: `▼ Downloaded  4.1 GiB` in `--info-500`.
  - Row 4 (divider): `Share: +8.3 GiB (3.02×)` in `--text-secondary`.
- Card header: title `VOLUME — BY DAY`, right-aligned `SegmentedControl` with `7d | 14d | 30d | 90d`.

**States**
| State | Behavior |
|-------|----------|
| Loading | Shimmer rectangle matching 224 px height, per UI_DESIGN §2.22. |
| Empty (no snapshots at all) | Icon `BarChart3` 20 px + "Not enough profile snapshots yet" + helper "Snapshots are written every 15 min; window populates after ~1 day." |
| Empty (window too narrow) | "No volume in the last {window}" + CTA `SegmentedControl` to widen. |
| Error | Icon `AlertOctagon` + "Couldn't load volume" + ghost "Try again" per UI_DESIGN §3.2. |

**Backend endpoint (new):** `GET /api/stats/profile-volume?days=N` — see DASHBOARD_REVIEW.md §4.4.

### B.4.5 RulePerformanceBar (NEW)

Horizontal stacked bar list. One row per rule set, sorted by grab count descending. Max 12 rows; "+N more" overflow chip if more.

**Row anatomy (44 px tall):**
```
[Enabled●] Rule name (truncate)        1,203 grabs · 3,410 skips · 2 errors  ▷
           ▰▰▰▰▰▰▰▰▰▰░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```
- Leading dot: `--success-500` if `enabled`, `--text-muted` otherwise.
- Rule name: text-sm-med, truncate with tooltip on hover showing full name.
- Right-aligned counts: text-mono-sm, `--text-secondary`. Grabs in `--success-500`, errors in `--danger-500` if > 0.
- Bar: 6 px tall, track `--bg-surface-alt`. Stacked fills:
  - Grabs: `--success-500` at 100 % alpha.
  - Skips: `--text-muted` at 40 % alpha.
  - Errors: `--danger-500` at 100 % alpha.
  - Widths proportional to counts; totals across window = 100 %.
- Trailing `ChevronRight` IconButton → opens Rules page with this rule pre-selected (hash route `#rule={id}`).

**Card header:** "RULE PERFORMANCE" + `SegmentedControl` `7d | 14d | 30d | 90d`. Default 14d.

**Empty state:** "No rule activity in the last {window}" + CTA link "Configure rules".
**Error state:** standard.

### B.4.6 StateStripBar (NEW)

Single compact horizontal stacked bar summarizing qBt state distribution. 40 px tall. Positioned between the KPI strip and the chart grid.

**Anatomy:**
```
12 downloading · 48 seeding · 3 stalled · 1 error                                total 64
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
```

- Bar segments use semantic colors:
  - `downloading`: `--info-500`
  - `seeding`: `--success-500`
  - `stalled_dl`/`stalled_up`: `--warn-500`
  - `paused`: `--text-muted`
  - `checking`: `--brand-500`
  - `error`: `--danger-500`
  - `other`: `--border-strong`
- Segment hover: darken 10 %, tooltip with state name + count + %.
- Labels above bar: only render segments with count > 0. Order: downloading, seeding, stalled, paused, checking, error, other. `·` separator.
- Right-aligned total count.

**Wires to:** `GET /api/stats/torrent-states` (already exists, unused today).
**Skeleton:** 40 px shimmer rectangle.
**Empty (0 torrents):** renders the bar at 0 %; label reads "No torrents tagged `harvester`".

### B.4.7 AccountHealthBanner (NEW)

Full-width banner above the KPI strip, conditional on `warned || leechWarn`. Uses the existing Banner component from UI_DESIGN §2.15 in `danger` variant.

**Copy (final English strings, also in §B.9):**
- `warned = true && leechWarn = false`: **"Your M-Team account is warned."** — helper: "Uploads and ratio must clear the warning threshold. Check the M-Team site for details."
- `leechWarn = true && warned = false`: **"Leech warning on your account."** — helper: "Your ratio is at risk; consider reducing active downloads."
- Both true: **"Account warned and leech-warned."** — helper: "Both conditions are active. Address ratio first."

**Actions:**
- Ghost button "Open M-Team profile" → external link to `https://kp.m-team.cc/` (clicks rel="noopener").
- Ghost button "Dismiss" — soft-dismiss (banner reappears on next snapshot if condition still true). Dismissal state in localStorage keyed by (condition hash, snapshot ts).

**VIP / Donor indicator (optional P2):** small purple/amber chip to the right of the tier-card header — NOT a banner.

### B.4.8 CommunityContextLine (NEW, P3)

Single-row, 24 px tall, bottom-bordered line between AccountHealthBanner (if any) and the KPI strip. Renders only when `/api/community/snapshot` returns data.

```
M-Team: 12,345 users online · 402 signed in today · 1,402,337 torrents (+823 today)
```

- Text-xs, `--text-secondary`; numbers in `font-mono`, `--text-primary`; separators `·` in `--text-muted`.
- When data is stale (>15 min): append `(stale)` in `--text-muted`.
- When `/api/community/snapshot` 404s (worker not enabled): render nothing.

### B.4.9 Modifications to existing chart components

**`SpeedCard`:**
- Replace inline linear/log toggle with `<SegmentedControl>`.
- Change `refetchInterval` from `10_000` to `60_000`.
- Add error state per §3.2 UI_DESIGN.

**`RatioChart`:**
- Add `SegmentedControl` `1h | 24h | 7d | 30d` in the card header, right-aligned, `xs` size.
- Hoist `hours` to state; include in query key `['stats','profile-snapshots', hours]`.

**`GrabsChart`:**
- Add `SegmentedControl` `7d | 14d | 30d | 90d` in card header.
- Hoist `days` to state.
- Use the fixed discount palette (see §B.4.10) — stop hardcoding hex.

### B.4.10 DiscountBadge (tokenization)

Replace the raw hex map in `DashboardPage.tsx` with a token lookup. Remove dead `PERCENT_30`. Final mapping (pinned to UI_DESIGN §1.1 discount palette):

| Discount | Token |
|----------|-------|
| `FREE` | `--success-500` |
| `_2X_FREE` | `--purple-500` (maps to #a855f7 per UI_DESIGN chart palette) |
| `_2X` | `--info-500` |
| `PERCENT_50` | `--warn-500` |
| `_2X_PERCENT_50` | `--pink-500` (new alias; resolves to `#ec4899`) |
| `PERCENT_70` | `--brand-500` (amber) |
| `NORMAL` | `--text-muted` |

`PERCENT_30` removed entirely.

## B.5 Design tokens used (quick reference)

| Token | Where |
|-------|-------|
| `--bg-surface`, `--bg-surface-alt`, `--bg-overlay` | All card chrome, tooltip |
| `--border-subtle`, `--border-default`, `--border-strong` | Card borders, segmented control, focus |
| `--text-primary`, `--text-secondary`, `--text-muted`, `--text-disabled` | All copy |
| `--brand-500` | Primary accent on DiskTile inner bar, active tab accent, segmented-control optional emphasis |
| `--success-500`, `--success-bg` | Ratio chart fill, volume upload, rule grabs, state-strip seeding |
| `--info-500`, `--info-bg` | Volume download, state-strip downloading |
| `--warn-500`, `--warn-bg` | Stalled state, disk-low warning, 50%-off discount |
| `--danger-500`, `--danger-bg` | Error state, account-health banner, disk-critical |
| `--focus-ring` | 2 px outline, 2 px offset on all interactive elements |
| `--radius-sm` (4 px) | SegmentedControl options, badges |
| `--radius-md` (6 px) | Cards, banners |
| `--radius-lg` (8 px) | KPI tiles |
| `--space-2` (8 px), `--space-3` (12 px), `--space-4` (16 px), `--space-6` (24 px) | Inner gaps, card padding, page padding |
| `--font-mono` / `--text-mono-xl` | All KPI values, byte sizes, counts |
| `--motion-fast` (120 ms) | SegmentedControl hover |
| `--motion-normal` (180 ms) | DiskTile bar width transitions |
| `--motion-enter` (220 ms) | Banner slide-down |

No new token proposed. `--pink-500` is an alias for an existing chart-palette hex (`#ec4899`) that's already listed in the chart sequential palette (UI_DESIGN §2.19).

## B.6 Interactions & states

| Element | State | Behavior |
|---------|-------|----------|
| KPI tile (any) | Hover | background `--bg-surface` → `--bg-surface-alt`, 120 ms linear |
| KPI tile | Keyboard focus | 2 px `--focus-ring` outline, 2 px offset |
| Delta pill | Always | Static text + arrow; no hover state |
| DiskTile danger | `free < 10 GiB` | 2 px left border `--danger-500`; value tone `--danger-500`; bar fill `--danger-500` |
| Volume chart hover | Mouse move | Vertical guide line `--border-default`, tooltip appears 200 ms after settle |
| Volume chart time-window | Click | Query re-runs with new `days`; skeleton during fetch; preserves prior data under 30 % opacity until new data arrives (prevents layout jump) |
| RulePerformanceBar row | Hover | Background `--bg-surface-alt`; chevron `--text-primary` |
| RulePerformanceBar row | Click | Navigates to `/rules#id={ruleId}` |
| StateStripBar segment | Hover | Segment alpha 100 % → 110 % (brightness filter), tooltip with state name, count, % |
| AccountHealthBanner | Mount | Slide down from -100 % over `--motion-enter` (220 ms), respects reduced motion |
| AccountHealthBanner dismiss | Click | Fade out over `--motion-exit` (160 ms); writes dismissal key to localStorage |
| SegmentedControl | Click | Instant visual change (no transition on active indicator); query invalidation + skeleton |
| RatioChart / GrabsChart | Load fail | Swaps chart area for error state; rest of card chrome untouched |

## B.7 Data formatting (recap from UI_DESIGN §3.8)

| Value | Format |
|-------|--------|
| Bytes | IEC: `1.23 GiB`, `456 MiB`, `78 KiB`, `0 B` |
| Transfer rate | `12.3 MiB/s` |
| Ratio | Two decimals: `3.14` |
| Counts | `toLocaleString()` — `1,234` |
| Percentages | ≥10 integer (`34 %`), <10 one decimal (`9.3 %`) |
| Timestamps | Relative ≤ 7 days (`3m ago`, `2h ago`, `5d ago`), absolute after |

All numbers use `font-mono` and `font-variant-numeric: tabular-nums`.

## B.8 Edge cases

| Scenario | Behavior |
|----------|----------|
| Profile probe has never succeeded | All ratio/bonus/upload/download KPI tiles show `—`. DiskTile renders with 0 Harvester bytes. Volume chart shows "Not enough snapshots yet". |
| qBt is disconnected | Active / Issues / Disk show `0`. Footer banner (global, from UI_DESIGN §4.2) warns "qBt disconnected". Volume + rule-performance charts still render from DB. |
| Only 1 profile snapshot exists (< 24h window) | 1h deltas null, 24h deltas null; delta pills hide. Upload/Download totals show the single snapshot's values without a delta. |
| Account just became `warned` between snapshots | Banner renders on next 10-s `summary` tick (not immediately). |
| Disk total is unreadable (statfs fails on non-POSIX FS) | Fall back to v1 behavior: show used + free numbers without a percentage bar; omit outer segment. |
| Window widened on volume chart (7d → 90d) | Prior 7d data dims to 30 % opacity until 90d response arrives, then fades back to 100 %. Prevents the empty-flash pattern. |
| Single rule set with 100 % of grabs | `RulePerformanceBar` renders one row at 100 % grabs fill. Empty state only applies when there is zero activity across all rules. |
| `_2X_PERCENT_50` deals spike in a day | Grabs chart stacked bar clearly shows the pink-500 slice; distinct enough from `_2X_FREE` purple. |
| Reduced motion (`prefers-reduced-motion: reduce`) | All durations collapse to 0. Banner slide-in becomes instant. Volume chart tween disabled. |
| User dismisses AccountHealthBanner then condition clears then reappears | localStorage key is bound to (condition-hash, snapshot-ts); if either differs, banner re-renders. |

## B.9 UX copy (final strings)

| Key | String |
|-----|--------|
| `kpi.ratio.label` | `RATIO` |
| `kpi.bonus.label` | `BONUS` |
| `kpi.uploaded.label` | `UPLOADED` |
| `kpi.downloaded.label` | `DOWNLOADED` |
| `kpi.grabs.label` | `GRABS 24H` |
| `kpi.active.label` | `ACTIVE` |
| `kpi.issues.label` | `ISSUES` |
| `kpi.disk.label` | `DISK` |
| `delta.prev24h` | `vs prev 24h` |
| `delta.prev1h` | `· 1h` |
| `delta.flat` | `flat` |
| `card.ratio.title` | `RATIO & BONUS` |
| `card.speed.title` | `SPEED` |
| `card.volume.title` | `VOLUME — BY DAY` |
| `card.grabs.title` | `GRABS — BY DISCOUNT` |
| `card.ruleperf.title` | `RULE PERFORMANCE` |
| `card.tier.title` | `ACCOUNT TIER` |
| `card.downloads.title` | `DOWNLOADS` |
| `states.strip.no-torrents` | `No torrents tagged harvester` |
| `volume.empty.no-snapshots` | `Not enough profile snapshots yet` |
| `volume.empty.window-narrow` | `No volume in the last {window}` |
| `ruleperf.empty` | `No rule activity in the last {window}` |
| `health.warned.title` | `Your M-Team account is warned.` |
| `health.warned.helper` | `Uploads and ratio must clear the warning threshold. Check the M-Team site for details.` |
| `health.leechwarn.title` | `Leech warning on your account.` |
| `health.leechwarn.helper` | `Your ratio is at risk; consider reducing active downloads.` |
| `health.both.title` | `Account warned and leech-warned.` |
| `health.both.helper` | `Both conditions are active. Address ratio first.` |
| `health.action.open` | `Open M-Team profile` |
| `health.action.dismiss` | `Dismiss` |
| `error.chart` | `Couldn't load {chart}` |
| `error.retry` | `Try again` |
| `community.prefix` | `M-Team:` |
| `community.online` | `{n} users online` |
| `community.signed-in` | `{n} signed in today` |
| `community.torrents` | `{total} torrents` |
| `community.today-added` | `(+{n} today)` |
| `community.stale` | `(stale)` |

## B.10 Accessibility

| Area | Requirement |
|------|-------------|
| Focus order | Banner → KPI strip (L→R) → StateStripBar → Row 3 cards (L→R) → Row 4 → Row 5 → Downloads table. Each card: header actions → body interactive elements (SegmentedControl, chart hover = non-focusable). |
| All interactive elements | Visible `:focus-visible` via 2 px `--focus-ring` outline + 2 px offset (UI_DESIGN §2.23). Never removed. |
| IconButton in downloads table | Must set `aria-label` in addition to `title` (current v1 only sets `title`). |
| SegmentedControl | `role="radiogroup"` + child `role="radio"` with `aria-checked`. |
| Banner | `role="alert"` on mount; `aria-live="polite"`; dismiss button `aria-label="Dismiss account health warning"`. |
| Delta pills | Include direction in text (`+`, `-`, or `flat`) in addition to color + arrow — passes 1.4.1. Screen reader receives the leading character. |
| DiskTile dual-bar | The outer bar has `role="progressbar"` with `aria-label="Disk usage"`, `aria-valuenow`, `aria-valuemin=0`, `aria-valuemax=100`. Inner bar is decorative (`aria-hidden="true"`). |
| StateStripBar | Whole bar is a `role="img"` with `aria-label` composed from the label row ("12 downloading, 48 seeding, 3 stalled, 1 error, total 64"). |
| Volume chart | `role="img"` + `aria-label` summarizing window and totals ("Upload/download volume, last 14 days. Uploaded 412 GiB; Downloaded 187 GiB"). Individual bars are decorative. |
| Tooltip content | Appears on keyboard focus (not just mouse hover) per WCAG 1.4.13. |
| Color contrast | All text ≥ 4.5:1 per UI_DESIGN §0. The `--text-muted` token on `--bg-surface` is 4.6:1 in dark mode, 4.7:1 in light — verified. `--text-secondary` on all surfaces is ≥ 6.8:1. |
| Reduced motion | Banner slide-in and DiskTile width tween are skipped under `prefers-reduced-motion: reduce` (zero duration). |
| Keyboard | All SegmentedControls: ← → navigate, Home/End jump. Banner dismiss: Tab-reachable, Enter/Space activates. |

## B.11 Animation / motion

| Element | Trigger | Animation | Duration | Easing |
|---------|---------|-----------|----------|--------|
| AccountHealthBanner | Mount | slide-down from `translateY(-100%)` + fade 0→1 | 220 ms | `--motion-enter` |
| AccountHealthBanner | Dismiss | slide-up + fade | 160 ms | `--motion-exit` |
| DiskTile bars | Prop change | `width` transition | 180 ms | `--motion-normal` |
| SegmentedControl option | Hover | `color` transition | 120 ms | `--motion-fast` |
| Volume chart area | Data change | Recharts default `isAnimationActive` **off** (jitter on 1-min refresh); rely on skeleton swap instead | 0 ms | — |
| Chart tooltip | Hover settle | fade-in | 120 ms | `--motion-fast` |
| Delta pill | Value change | no transition (instant) | — | — |

## B.12 Implementation checklist

Engineer pickup list, in dependency order:

1. **Backend**
   - [ ] `src/util/disk.ts` — add `diskStats(path): {freeGib, totalGib, usedGib}`; keep `freeGib()` as a thin wrapper for back-compat.
   - [ ] `src/util/normalize.ts` — extract `warned`, `leech_warn`, `vip` from `memberStatus`; add `seedtime_sec`, `leechtime_sec`.
   - [ ] `db/migrations/0003_profile_snapshot_extras.sql` — add the four new columns (nullable).
   - [ ] `src/http/routes/dashboard.ts` — extend `DashboardSummary` with `uploaded_bytes_total`, `uploaded_bytes_24h`, `uploaded_bytes_delta_24h`, same for downloaded, plus `disk_total_gib`, `account_warned`, `account_leech_warn`, `account_vip`.
   - [ ] `src/http/routes/stats.ts` — add `GET /stats/profile-volume?days=N` (SQL in DASHBOARD_REVIEW.md §4.4).
   - [ ] `shared/types.ts` — mirror all of the above in `DashboardSummary`.
2. **Shared UI primitives**
   - [ ] `web/src/components/SegmentedControl.tsx` — per §B.4.1.
   - [ ] Update `web/src/styles` if a `--pink-500` alias is introduced (resolves to `#ec4899`).
3. **Dashboard components**
   - [ ] `DashboardPage.tsx` — re-layout grid per §B.2.
   - [ ] `KpiStrip` — add Upload/Download total tiles; adjust grid to 8-wide with wrap at `lg`.
   - [ ] `DiskTile` — dual-bar rewrite per §B.4.3.
   - [ ] Refactor `SpeedCard` to use `SegmentedControl`; change refetch to 60 s.
   - [ ] `RatioChart` — add time-window `SegmentedControl`, parameterize `hours`.
   - [ ] `GrabsChart` — add time-window `SegmentedControl`, parameterize `days`; tokenize discount palette; remove `PERCENT_30`.
   - [ ] NEW: `VolumeButterflyChart.tsx` — per §B.4.4.
   - [ ] NEW: `RulePerformanceBar.tsx` — per §B.4.5.
   - [ ] NEW: `StateStripBar.tsx` — per §B.4.6.
   - [ ] NEW: `AccountHealthBanner.tsx` — per §B.4.7.
   - [ ] NEW (P3): `CommunityContextLine.tsx` — per §B.4.8; requires `communityProbe` worker first.
4. **Accessibility**
   - [ ] Add `aria-label` to `IconBtn` in Downloads table rows.
   - [ ] Verify focus order via keyboard.
   - [ ] Verify all new `role="img"` chart labels read as expected with VoiceOver / NVDA.
5. **Testing**
   - [ ] Visual: dark + light parity spot-check of every new component.
   - [ ] `prefers-reduced-motion` simulation: banner + disk bar animations are skipped.
   - [ ] Snapshot test on `DashboardPage` with mocked `DashboardSummary` covering: new account, warned account, missing qBt, full dataset.

## B.13 Non-goals / out of scope

- Mobile / sub-1024 layout rework. Remains as existing "tablet warning" screen.
- New global navigation; no changes outside DashboardPage.
- Changing `stats_daily` schema (covered in DASHBOARD_REVIEW.md §3.10 but is a separate backend refactor).
- Prometheus metrics endpoint format.
- Replacing Recharts with another charting library.
- New color tokens beyond the `--pink-500` alias.

---

## Appendix — Source-of-truth cross-reference

| Item | Source |
|------|--------|
| Color + radius + typography tokens | UI_DESIGN.md §1 |
| Canonical component library | UI_DESIGN.md §2 |
| Motion tokens | UI_DESIGN.md §1.7 |
| Dashboard data & rationale | DASHBOARD_REVIEW.md §§3–4 |
| Backend data contracts | MTEAM_API.md §7 (profile), §8 (system endpoints) |
| v1 wire types | shared/types.ts `DashboardSummary` |
| v1 dashboard component source | web/src/pages/DashboardPage.tsx |
| v1 dashboard routes | src/http/routes/dashboard.ts, src/http/routes/stats.ts |

*End of DASHBOARD_UI_HANDOFF.md.*
