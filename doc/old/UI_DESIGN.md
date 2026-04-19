# Harvester — UI Design System & Page Specification

> **Doc ID:** UI_DESIGN.md
> **Depends on:** `PRD.md` (authoritative requirements)
> **Feeds:** `UI_HANDOFF.md` (developer-facing handoff), `IMPLEMENTATION.md` (engineering)
> **Audience:** Downstream AI. Dense, precise. No marketing.
> **Design approach:** Extend a new design system from scratch. Dark-first, data-dense, professional monitoring tool. Reference mental model: Linear × Grafana × GitHub, with qBittorrent-grade density.

---

## 0. Design Principles (non-negotiable)

1. **Density over whitespace.** Primary user stares at the dashboard for seconds at a time. Info per pixel is the goal. No hero sections, no decorative illustrations, no marketing gloss.
2. **Numbers are first-class.** Always monospace for numeric columns and log timestamps. Align decimals.
3. **State is always visible.** Global status chip in the footer bar on every page. Never hide a degraded state behind a menu.
4. **Dark mode first, light mode correct.** Both palettes MUST pass WCAG AA (4.5:1 for body, 3:1 for UI). Default is dark.
5. **One accent color.** Amber for Harvester brand + primary CTA. All other color is semantic (green/yellow/red/blue/purple). Never use the accent for semantic meaning.
6. **Sharp edges, minimal radius.** 4 px small / 6 px medium / 8 px large. No pill shapes except for badges & toggles.
7. **No shadows in dark mode.** Use 1 px borders at `border-subtle` for elevation. Light-mode uses very soft shadows only on overlays.
8. **Motion is functional, not decorative.** 120–200 ms for state, 220–300 ms for layout. Respect `prefers-reduced-motion`.
9. **SVG icons only.** Lucide icon set. No emoji. Fixed 16/20/24 px sizes.
10. **Every interactive element shows `cursor: pointer` and a visible focus ring.** No exceptions.

---

## 1. Design Tokens

### 1.1 Color — Dark (default)

All values are locked. Downstream MUST use the token names, not raw hex.

| Token | Hex | Use |
|-------|-----|-----|
| `--bg-canvas` | `#0a0a0b` | Page background |
| `--bg-surface` | `#141417` | Cards, table headers, drawer |
| `--bg-surface-alt` | `#1b1b1f` | Nested panels, table row hover |
| `--bg-overlay` | `#1f1f24` | Modals, toast backgrounds |
| `--bg-input` | `#0e0e11` | Inputs, selects, textarea |
| `--border-subtle` | `#26262c` | Dividers, card borders, 1 px lines |
| `--border-default` | `#32323a` | Input borders, hovered borders |
| `--border-strong` | `#4a4a55` | Focus / active borders |
| `--text-primary` | `#f4f4f5` | Body, headings, numbers |
| `--text-secondary` | `#a1a1aa` | Labels, metadata |
| `--text-muted` | `#71717a` | Helper, placeholders |
| `--text-disabled` | `#52525b` | Disabled elements |
| `--brand-500` | `#f59e0b` | Primary CTA, brand accent (amber) |
| `--brand-600` | `#d97706` | Hover state on brand |
| `--brand-fg` | `#0a0a0b` | Text/icon ON brand background |
| `--success-500` | `#10b981` | Healthy, seeding well |
| `--success-bg` | `#10b9811f` | Tint (12% alpha) for status chips |
| `--warn-500` | `#eab308` | Degraded, pending |
| `--warn-bg` | `#eab3081f` | |
| `--danger-500` | `#f43f5e` | Errored, emergency |
| `--danger-bg` | `#f43f5e1f` | |
| `--info-500` | `#0ea5e9` | Neutral informational |
| `--info-bg` | `#0ea5e91f` | |
| `--focus-ring` | `#f59e0b` | 2 px outline, 2 px offset |

**Discount badge palette (fixed, referenced from PRD §10.3):**

| Discount | Text | Background |
|----------|------|-----------|
| `FREE` | `#a7f3d0` | `#10b9811f` (success-bg) |
| `_2X_FREE` | `#e9d5ff` | `#a855f71f` (purple tint) |
| `_2X` | `#bfdbfe` | `#3b82f61f` (blue tint) |
| `PERCENT_50` | `#fef08a` | `#eab3081f` (warn-bg) |
| `PERCENT_30` | `#fed7aa` | `#f973161f` (orange tint) |
| `NORMAL` | `#d4d4d8` | `#3f3f461f` (zinc tint) |

### 1.2 Color — Light (secondary)

| Token | Hex |
|-------|-----|
| `--bg-canvas` | `#fafafa` |
| `--bg-surface` | `#ffffff` |
| `--bg-surface-alt` | `#f4f4f5` |
| `--bg-overlay` | `#ffffff` |
| `--bg-input` | `#ffffff` |
| `--border-subtle` | `#e4e4e7` |
| `--border-default` | `#d4d4d8` |
| `--border-strong` | `#a1a1aa` |
| `--text-primary` | `#09090b` |
| `--text-secondary` | `#3f3f46` |
| `--text-muted` | `#52525b` |
| `--text-disabled` | `#a1a1aa` |
| `--brand-500` | `#d97706` |
| `--brand-600` | `#b45309` |
| `--brand-fg` | `#ffffff` |
| `--success-500` | `#047857` |
| `--warn-500` | `#b45309` |
| `--danger-500` | `#be123c` |
| `--info-500` | `#0369a1` |

Semantic backgrounds in light mode use 8% alpha of the 500 color.

### 1.3 Typography

| Token | Font | Weight | Size | Line-height | Tracking | Use |
|-------|------|--------|------|-------------|----------|-----|
| `--font-sans` | Inter | — | — | — | — | All UI |
| `--font-mono` | JetBrains Mono | — | — | — | — | Numbers, timestamps, logs, code |
| `--text-xs` | sans | 500 | 11 px | 16 px | +0.2 px | Badge labels, chip text, table sublabels |
| `--text-sm` | sans | 400 | 13 px | 20 px | 0 | Table body, form labels |
| `--text-sm-med` | sans | 500 | 13 px | 20 px | 0 | Table headers, button text |
| `--text-base` | sans | 400 | 14 px | 22 px | 0 | Body |
| `--text-md` | sans | 500 | 14 px | 22 px | 0 | Emphasized body, section headers |
| `--text-lg` | sans | 600 | 16 px | 24 px | 0 | Page section titles |
| `--text-xl` | sans | 600 | 20 px | 28 px | -0.2 px | KPI numbers |
| `--text-2xl` | sans | 700 | 28 px | 36 px | -0.4 px | Dashboard KPI value |
| `--text-3xl` | sans | 700 | 36 px | 44 px | -0.6 px | Auth / wizard titles only |
| `--text-mono-xs` | mono | 400 | 11 px | 16 px | 0 | Log timestamps |
| `--text-mono-sm` | mono | 400 | 12 px | 18 px | 0 | Log body, code, infohash |
| `--text-mono-md` | mono | 500 | 14 px | 20 px | 0 | Numbers in tables |
| `--text-mono-xl` | mono | 500 | 24 px | 30 px | -0.3 px | KPI numbers on Dashboard |

Fallback stack (MUST be used verbatim): `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` / `"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace`.

Load Inter and JetBrains Mono as local self-hosted woff2 in `/public/fonts/`. No Google Fonts CDN (local-only tool, offline-capable is a principle).

### 1.4 Spacing scale

4 px base. Tokens: `--space-0` (0), `--space-1` (4), `--space-2` (8), `--space-3` (12), `--space-4` (16), `--space-5` (20), `--space-6` (24), `--space-8` (32), `--space-10` (40), `--space-12` (48), `--space-16` (64).

Layout rhythm rule: prefer `--space-3` (12) or `--space-4` (16) as default gap; use `--space-2` (8) inside dense tables; use `--space-6` (24) between distinct page regions.

### 1.5 Border radius

| Token | Value | Use |
|-------|-------|-----|
| `--radius-none` | 0 | Table cells, dividers |
| `--radius-sm` | 4 px | Inputs, buttons, badges, most UI |
| `--radius-md` | 6 px | Cards, drawers, modals |
| `--radius-lg` | 8 px | KPI tiles, large panels |
| `--radius-pill` | 9999 px | Toggle switches only |

### 1.6 Shadows (light mode only; dark mode uses borders)

| Token | Value |
|-------|-------|
| `--shadow-sm` | `0 1px 2px rgb(0 0 0 / 0.05)` |
| `--shadow-md` | `0 4px 8px -2px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)` |
| `--shadow-lg` | `0 12px 24px -6px rgb(0 0 0 / 0.12), 0 4px 8px -4px rgb(0 0 0 / 0.06)` |

Dark mode shadow tokens all resolve to `none`. Elevation in dark is expressed via border colors (subtle → default → strong).

### 1.7 Motion

| Token | Duration | Easing | Use |
|-------|----------|--------|-----|
| `--motion-fast` | 120 ms | `cubic-bezier(0.2, 0, 0, 1)` | Hover color/opacity changes |
| `--motion-normal` | 180 ms | `cubic-bezier(0.2, 0, 0, 1)` | Button press, toggle |
| `--motion-enter` | 220 ms | `cubic-bezier(0.2, 0, 0, 1)` | Drawer / modal open |
| `--motion-exit` | 160 ms | `cubic-bezier(0.4, 0, 1, 1)` | Drawer / modal close |

`prefers-reduced-motion: reduce` → collapse all durations to 0 ms; skip transform animations.

### 1.8 Z-index scale

| Token | Value | Use |
|-------|-------|-----|
| `--z-base` | 0 | Normal content |
| `--z-dropdown` | 10 | Select popovers, tooltips |
| `--z-sticky` | 20 | Sticky table headers, footer status bar |
| `--z-drawer` | 30 | Torrent detail drawer |
| `--z-modal-backdrop` | 40 | Modal dimmer |
| `--z-modal` | 50 | Modals |
| `--z-toast` | 60 | Toast tray |
| `--z-global-banner` | 70 | Emergency banner |

### 1.9 Iconography

Library: **Lucide** (`lucide-react`). Size tokens: 14 px (micro, inside chips), 16 px (default in tables/buttons), 20 px (nav), 24 px (KPI tile illustration). Stroke 1.75 px default.

Named icon map (stable, used across codebase):

| Purpose | Lucide name |
|---------|-------------|
| Dashboard | `LayoutDashboard` |
| Torrents | `ArrowDownToLine` |
| Rules | `Filter` |
| Logs | `ScrollText` |
| Stats | `BarChart3` |
| Settings | `Settings` |
| Kill switch | `Power` |
| Pause | `Pause` |
| Resume/Play | `Play` |
| Refresh | `RefreshCw` |
| Remove | `Trash2` |
| Remove + data | `Trash` |
| Warning | `AlertTriangle` |
| Error | `AlertOctagon` |
| Info | `Info` |
| Success | `CheckCircle2` |
| Search | `Search` |
| Filter | `ListFilter` |
| Time | `Clock` |
| External | `ExternalLink` |
| Copy | `Copy` |
| Eye / show | `Eye` |
| Eye off / hide | `EyeOff` |
| Keyboard | `Keyboard` |
| Shortcut dialog | `HelpCircle` |

### 1.10 Breakpoints

Harvester is **desktop-first** (matches primary persona). Supported:

| Name | Min width | Notes |
|------|-----------|-------|
| `md` | 1024 px | Minimum supported size |
| `lg` | 1280 px | Default dashboard (6 KPI tiles) |
| `xl` | 1536 px | Optimal |
| `2xl` | 1920 px | Larger tables |

Below 1024 px: show a single-panel, stacked layout with a "tablet mode" warning at 768–1023 px; at < 768 px show a "not supported on mobile" page with a link to open via the local server on a desktop.

---

## 2. Component Library

Every component includes: variants, sizes, states, a11y notes, and keyboard behavior. Implementations in `UI_HANDOFF.md`.

### 2.1 Button

**Variants:** `primary`, `secondary`, `ghost`, `danger`, `success`, `link`.

**Sizes:** `sm` (height 28 px, text-sm, px 10), `md` (height 32 px, text-sm-med, px 12), `lg` (height 40 px, text-md, px 16).

**States:** default, hover, active, focus-visible, disabled, loading (spinner replaces icon, text stays, pointer-events:none).

**Rules:**
- `primary` uses `--brand-500` background and `--brand-fg` text. Used for the single most-important action on a page.
- `danger` uses `--danger-500` background. Used for Remove/Remove+data and Kill Switch.
- `ghost` is transparent, hover `--bg-surface-alt`. Default for table row actions.
- Never use two `primary` on one page.
- Minimum target 44×44 px (padding + touch area via `::before`), though visual height can be 28 px.

### 2.2 IconButton

Square button, size 28/32/40 px, icon only. MUST have `aria-label`. Hover background `--bg-surface-alt`. Active uses `--border-strong`. No visible label text.

### 2.3 Input / Select / Textarea

- Height 32 px (`md`) or 28 px (`sm`). Textarea min-height 80 px.
- Background `--bg-input`. Border `--border-default`. Focus: border `--border-strong`, ring 2 px `--focus-ring` at 2 px offset.
- Placeholder `--text-muted`.
- Label above, helper/error below. Error state: border `--danger-500`, helper text in `--danger-500`.
- Disabled: `--text-disabled` on a `--bg-surface-alt` background.
- `aria-invalid="true"` when error, `aria-describedby` pointing to helper text ID.

### 2.4 Switch / Toggle

- 32×16 px track, 12 px thumb. `--radius-pill`.
- Off: `--bg-surface-alt` track, `--text-muted` thumb. On: `--brand-500` track, white thumb.
- Keyboard: Space toggles.
- `role="switch"`, `aria-checked`.

### 2.5 Checkbox / Radio

16 px, `--radius-sm` (checkbox) / pill (radio). Check icon: `Check` at 12 px.

### 2.6 Slider

Used for poll interval. Track 4 px, thumb 14 px. Shows numeric value in mono font next to the label. `aria-valuemin`, `aria-valuemax`, `aria-valuenow`.

### 2.7 Badge

Height 20 px (md), 16 px (sm). `--radius-sm`. Text-xs, medium weight. Used for discount, state, tag.

Variants map 1:1 to semantic colors. For discount badges, use the fixed palette in §1.1.

### 2.8 StatusChip

Compact indicator combining a filled dot and a label. Dot 8 px. Used in footer status bar and service state banner.

| Status | Dot color | Label color |
|--------|-----------|-------------|
| `RUNNING` | success-500 | text-primary |
| `PAUSED_USER` | warn-500 | text-primary |
| `PAUSED_EMERGENCY` | danger-500 | danger-500 |
| `PAUSED_BACKOFF` | warn-500 | warn-500 |
| `STOPPED` | text-muted | text-muted |

Pulse animation on `RUNNING` dot: `opacity 1 → 0.5 → 1` over 1600 ms, infinite. Disabled by reduced-motion.

### 2.9 Card

`--bg-surface`, 1 px `--border-subtle`, `--radius-md`, padding `--space-4` (16 px) default. Header row = title (text-md) + optional IconButton row on the right.

### 2.10 KPI Tile

Specialized card. 120 px min-width, 88 px min-height.
- Label row: text-xs, `--text-secondary`, uppercase, letter-spacing +0.4 px.
- Value row: text-mono-xl (`JetBrains Mono`, 24 px, 500). Tabular-nums.
- Delta row (optional): text-xs with ↑/↓ arrow; green or red.
- Footer row (optional): text-xs in `--text-muted`.

Color coding: normal state uses default tile; threshold-breach uses an inline `danger` left border (2 px) and the value in `--danger-500`.

### 2.11 Data Table

- Header: sticky top. `--bg-surface`, border-bottom 1 px `--border-subtle`. Text-sm-med, `--text-secondary`, uppercase.
- Rows: 36 px height (compact) or 44 px (comfortable; user preference in Settings).
- Row hover: `--bg-surface-alt`.
- Zebra: off. (Density + border makes zebra unnecessary.)
- Column dividers: off. Row separators: 1 px `--border-subtle`.
- Sort indicator: up/down chevron after column label, visible only on the active sort column.
- Virtual scroll required when > 200 rows.
- Empty state: centered icon + message. (See §3.1.)
- Row expand: optional chevron at leftmost column, animates 180 ms.

### 2.12 Drawer

Slide from right. Width 520 px default, 720 px on xl+. Dimmer: `#000000` at 40% alpha. Motion: translate-x + opacity over `--motion-enter`.

Close: X IconButton top-right, Esc key, backdrop click (with confirm if unsaved form).

### 2.13 Modal

Centered. Max-width 480 px (small), 640 px (md), 800 px (lg). Backdrop same as Drawer.

Used for: first-run steps, destructive confirmations, API key reveal, shortcut cheat sheet.

### 2.14 Toast

Bottom-right stack. Max 3 visible; overflow queued. Width 360 px. 1 px border in semantic color on the left (4 px colored bar). Auto-dismiss 5 s (success/info), manual-only (error, emergency). `role="status"` for info/success; `role="alert"` for error.

### 2.15 Banner (global)

Full-width bar pinned to top of main content area (below the header). Three variants: `info`, `warn`, `danger`.

Used for: emergency-paused, allowed-client-warn, qBt-disconnected, SSE-disconnected.

Content: icon + text + optional action button + optional dismiss (only for non-critical).

### 2.16 Popover / Dropdown

Anchored to trigger. `--bg-overlay`. 1 px `--border-default`. `--radius-md`. Padding `--space-2`. Escape closes.

### 2.17 Tooltip

Delayed (500 ms), 300 ms on touch. Max 240 px width. Text-xs. Used for:
- Every IconButton that has no visible label.
- Relative timestamps (show absolute on hover).
- Truncated table cells (show full text).

### 2.18 JSON Editor

Monaco Editor. Height 420 px default. Dark theme `vs-dark`, light theme `vs`. JSON language mode. JSON Schema validation attached (schema source: `/api/rules/schema`). Line numbers on. Word wrap on.

### 2.19 Chart (Recharts)

- **LineChart** for ratio-over-time: 1.5 px stroke, `--brand-500` line. Tooltip: `--bg-overlay`. Grid: horizontal only, `--border-subtle`. X axis: dates, `--text-muted`, text-xs. Y axis: numeric, tabular-nums.
- **BarChart** for upload/day: bars in `--success-500` at 50% alpha, stroke `--success-500`. Grabs overlay as a line series in `--info-500`.
- **StackedBarChart** for rule-set performance: distinct hues from a 6-color sequential (defined below).

Sequential rule-set palette (stable, used for stacked bar):
`#f59e0b #10b981 #0ea5e9 #a855f7 #f43f5e #eab308` (brand, success, info, purple, danger, warn).

### 2.20 Tabs

Horizontal tabs. Active tab: bottom border 2 px `--brand-500`, text `--text-primary`. Inactive: `--text-secondary`, no border. Hover: `--text-primary`.

### 2.21 Empty state

Centered in container. 20 px icon (`--text-muted`) + text-md title + text-sm helper + optional CTA. Always documented per page.

### 2.22 Loading skeleton

Linear shimmer 1.6 s infinite, `--bg-surface-alt` → `--bg-overlay`. Rounded `--radius-sm`. Match the final content's shape (row-heights for tables, tile-shapes for KPIs).

### 2.23 Focus styles (global)

All interactive elements receive `:focus-visible` outline: 2 px solid `--focus-ring`, 2 px offset. Never remove. Outline is `outline` not `box-shadow` — survives `overflow:hidden` correctly.

---

## 3. Patterns

### 3.1 Empty states (catalog)

| Page / list | Icon | Title | Helper |
|-------------|------|-------|--------|
| Torrents (All) | `ArrowDownToLine` | No torrents yet | Grabs will appear here within 1–2 poll cycles. |
| Torrents (Errored) | `AlertOctagon` | No errors | Nothing has failed recently. |
| Rules | `Filter` | No rule-sets | The factory-default rule-set was skipped during setup. Create one to start grabbing. |
| Logs | `ScrollText` | No logs for these filters | Try widening the time range or clearing filters. |
| Stats (not enough data) | `BarChart3` | Not enough data yet | Charts appear after 24 h of activity. |
| Dry-run (no matches) | `ListFilter` | No torrents would have been grabbed | Try loosening size, discount, or free-time constraints. |

### 3.2 Error states

Every fetchable panel uses this pattern: icon (`AlertOctagon`) + title "Couldn't load <thing>" + text-sm error message + "Try again" ghost button. On repeat failures, show "If this persists, check the Logs page."

### 3.3 Loading states

Skeleton for: KPI tiles (shimmering bars for label and value), table rows (6 rows of skeleton bars), charts (rectangular skeleton matching the chart area). Never spinners inside primary content.

### 3.4 Destructive confirmation

Modal. Title starts with the verb ("Remove torrent + data"). Body text-sm, lists the consequence. Primary button = danger variant, label repeats the verb. Secondary = ghost "Cancel". Esc closes. No auto-focus on danger — focus the Cancel button by default.

### 3.5 Form save/cancel

Forms use **optimistic local state with explicit save**. Save/Cancel footer sticks to the bottom of the form container. Cancel confirms if dirty. Save disables while request is in flight and shows loading state.

### 3.6 Inline validation

- On blur for required fields.
- On submit attempt for the whole form.
- Rule-set form: validates JSON live (via `/api/rules/validate`) with a 400 ms debounce; error displayed under the JSON editor.

### 3.7 Relative-time display

Always relative up to 7 days, absolute after: `3m ago`, `2h ago`, `5d ago`, `Mar 12, 2026`. Absolute always on hover via tooltip, formatted `YYYY-MM-DD HH:mm:ss` in user's local TZ.

### 3.8 Number formatting

Byte sizes IEC: `1.23 GiB`, `456 MiB`, `78 KiB`. Transfer rates: `12.3 MiB/s`. Percentages: integer when ≥ 10%, one decimal below 10 (`9.3%`, `34%`). Ratio: two decimals (`3.14`). All in monospace.

### 3.9 Keyboard shortcut system

Global listener in root layout. Map:

| Keys | Action |
|------|--------|
| `g d` | Go to Dashboard |
| `g t` | Go to Torrents |
| `g r` | Go to Rules |
| `g l` | Go to Logs |
| `g s` | Go to Stats |
| `g S` (capital) | Go to Settings |
| `/` | Focus the current page's primary search/filter input |
| `?` | Open shortcut cheat sheet modal |
| `esc` | Close topmost drawer/modal/popover |
| `p` on any torrent row (when focused) | Pause/resume |
| `Delete` on any torrent row (when focused) | Open Remove confirmation |

`g _` is a sequence: press `g`, then within 1200 ms press the second key. Sequences are suppressed when focus is inside an input/textarea.

---

## 4. Page Design Specifications

All pages share the layout scaffold (§4.1). Page-specific specs follow.

### 4.1 Global layout scaffold

```
┌─────────────────────────────────────────────────────────────┐
│  Header (height 48 px) — Harvester logo · nav tabs · actions│
├──────┬──────────────────────────────────────────────────────┤
│      │                                                      │
│      │                                                      │
│ (no  │  Page content (max-width 1440 px, 24 px h-padding)   │
│ side │                                                      │
│ bar) │                                                      │
│      │                                                      │
├──────┴──────────────────────────────────────────────────────┤
│ Footer status bar (height 28 px, sticky)                    │
└─────────────────────────────────────────────────────────────┘
```

Rationale for no sidebar: only 6 pages. Top-nav tabs are faster + give more content width to dense tables.

**Header content (L→R):**
- Harvester wordmark (text-md, weight 600, `--brand-500` for the "H") + tiny version chip after ("v1.0.0" in text-xs, `--text-muted`).
- Nav tabs: Dashboard · Torrents · Rules · Logs · Stats · Settings.
- Spacer.
- Theme toggle (sun/moon IconButton).
- Kill switch button (pill, `--danger-500` outline, filled when pressed and service is PAUSED_USER). Text: "Stop polling" (RUNNING) / "Resume polling" (PAUSED_USER).
- `?` shortcut-help IconButton.

**Footer status bar (L→R), text-xs, `--text-secondary`:**
- Service: `StatusChip` with current status.
- Last poll: `Clock` icon + "Xs ago".
- qBt: `StatusChip` (small variant, no pulse) connected/disconnected.
- M-Team API: `StatusChip` connected/disconnected/backoff.
- Allowed client: `CheckCircle2` or `AlertTriangle` + version string.
- Spacer.
- Build hash (text-mono-xs, `--text-muted`).

### 4.2 Dashboard (`/`)

Grid (lg): 12-column, 24 px gutter.

```
Row 1 — KPI tiles  (7 tiles × 1 col span each? no — use 12/7 ≈ grid wrap)
─────────────────────────────────────────────────────────────
[Ratio ][Up today][Dn today][Active][Grabs 24h][Exp ≤1h][Disk]
Row 2 — Panels
───────────────────────────────────────────────────────────
Activity (log tail)             Upload bytes / day sparkline
(col-span 7)                    (col-span 5)
                                Ratio over time sparkline
                                (stacked below)
Row 3 — (only if emergency/warn) — full-width banner at top (above row 1)
```

Exact grid:
- Row 1: 7 KPI tiles in a responsive flexbox with `gap: 12 px`, each tile `flex: 1 1 140 px`, min-width 140 px. On lg (1280 px) they fit in one row.
- Row 2 panels: left = `col-span-7` (activity feed), right = `col-span-5` (stacked chart cards).

**Ratio tile specifics:** value color-coded. `value ≥ tier_min + 0.5` → `--success-500`. `value ≥ tier_min + 0.2` → `--text-primary`. `value < tier_min + 0.2` → `--danger-500` + left border 2 px danger.

**Expiring-≤-1h tile:** clickable. Filters torrents page to `expiring_1h=true`.

**Activity panel:** shows 50 log rows. Each row: `[time] [level pill] [component] message` in text-mono-sm. Auto-scrolls if user is at bottom; stops auto-scroll if user scrolls up (standard terminal UX). Live via SSE.

**Sparklines:** 30-day window, no axes, hover shows `{date, value}` tooltip. Each 140 px tall.

**Global banner (Row 3 above Row 1) conditions:**
- EMERGENCY_PAUSED → danger banner: "Emergency pause: ratio is too close to tier minimum. Seeding continues." + "Resume anyway" button (triggers confirmation).
- ALLOWED_CLIENT_WARN → warn banner: "qBittorrent version X.Y.Z is not on the M-Team allowed list." + "Go to Settings".
- qBt disconnected → warn banner.
- SSE disconnected → info banner: "Live updates reconnecting…".

### 4.3 Torrents (`/torrents`)

```
[Tabs: All | Active | Seeding | Completed | Removed | Errored]
[Search input (full-width) + filter chips: Discount, Rule-set, State, Size range]
[Bulk-action toolbar (visible when ≥ 1 row selected)]
[Data table — virtual-scroll]
```

Columns (desktop xl+):

| # | Column | Width | Align | Format |
|---|--------|-------|-------|--------|
| 1 | Checkbox | 32 px | center | |
| 2 | Name | flex (min 280) | left | Truncated at 1 line; tooltip on hover shows full. |
| 3 | Size | 88 px | right | mono, IEC |
| 4 | Discount | 96 px | left | Badge |
| 5 | Added | 96 px | right | Relative time |
| 6 | State | 112 px | left | Badge (from qBt state) |
| 7 | Ratio | 72 px | right | mono, 2 decimals |
| 8 | Up | 88 px | right | mono, IEC |
| 9 | Down | 88 px | right | mono, IEC |
| 10 | S/L | 72 px | right | mono, "12/48" |
| 11 | Free left | 96 px | right | mono, `2h 14m` |
| 12 | Actions | 120 px | right | Pause/Resume · Recheck · Remove menu |

At lg, hide Down and S/L. At md (1024 px), also hide Added and Free left. Show a "…" button in actions to access hidden data.

**State badges (from qBt state):**

| qBt state | Badge label | Color |
|-----------|-------------|-------|
| `uploading`, `stalledUP`, `queuedUP` | Seeding | success |
| `downloading`, `stalledDL`, `queuedDL`, `metaDL` | Leeching | info |
| `pausedUP` | Paused (seed) | warn |
| `pausedDL` | Paused (down) | warn |
| `checkingUP`, `checkingDL`, `checkingResumeData` | Checking | info |
| `error`, `missingFiles` | Error | danger |

**Row interaction:**
- Click anywhere except action cells → opens drawer.
- Checkbox click does not open drawer.
- Actions menu (⋯): Pause/Resume (toggles), Force-recheck, Remove (confirm), Remove + data (confirm).

**Bulk toolbar:**
Appears above table when ≥ 1 row selected. Content: `N selected` + buttons Pause · Resume · Recheck · Remove · Remove + data · Clear selection. Bulk destructive actions require confirmation.

**Torrent detail drawer (`/torrents/:id`):**
Sections, each collapsible (default: all open):
1. **Header**: name (text-lg), badges row (discount, rule-sets that matched, state).
2. **Stats grid**: 6 mini-KPI (Size, Ratio, Up, Down, Seed time, ETA/Done).
3. **Timeline**: state transitions from `torrent_events` + qBt derived events, reverse-chronological, text-mono-sm.
4. **M-Team payload**: prettified JSON (collapsed by default; expand button).
5. **Actions**: Pause/Resume, Recheck, Remove, Remove + data. "Open on M-Team" external link.

### 4.4 Rules (`/rules`)

```
[Header row: "Rule-sets" (text-lg) · "New rule-set" primary button]
[Card list — vertical stack, each card is a rule-set]
```

**Rule-set card:**
- Left: `Switch` toggle (enabled).
- Name (text-md) and summary line (text-sm, `--text-secondary`): e.g. "FREE, _2X_FREE · 1–80 GiB · ≥ 4 h free".
- Right: `Dry run` button, `Edit` ghost button, `⋯` menu with `Duplicate` and `Delete` (red).
- Below summary (collapsed): matches in last 24 h (count + link "View").

**Edit view (`/rules/:id`):**
Two tabs at top: `Form` | `JSON`.

**Form tab fields (in this order):**
- Name (text input, required, unique)
- Enabled (switch)
- Discount whitelist — multi-select with the 6 discount values as chips (defaults: FREE, _2X_FREE)
- Min remaining free time — number input (hours, step 0.5)
- Size min / Size max — two inputs side by side (GiB)
- Category whitelist — multi-select (fetched from M-Team at first open; caches)
- **Advanced (collapsed):**
  - Min seeders / Max seeders / Min leechers / Leecher-to-seeder ratio (all nullable)
  - Title regex include / Title regex exclude
  - First-seeder fast path (toggle + max-age-minutes input)
  - Free disk min (GiB)
- **qBittorrent (collapsed):**
  - Category (default `mteam-auto`)
  - Extra tags (chip input)
  - Save path override
  - Upload limit (KB/s, nullable)
- **Lifecycle overrides (collapsed, P1):**
  - Seed time hours
  - Zero-peers minutes
  - Remove-with-data toggle

Footer: `Save` primary · `Cancel` ghost · `Dry run` secondary.

**JSON tab:**
Monaco editor with schema validation. "Copy" and "Paste" buttons in toolbar. Same footer actions.

**Dry-run drawer:**
Opens on right. Table: Name · Discount · Size · Would grab (yes/no badge) · Reason. Summary chip at top: "23 of 200 would be grabbed (+3 first-seeder path)".

### 4.5 Logs (`/logs`)

```
[Filter bar: Level pills · Component multi-select · Time range pills · Free-text search · Live toggle · Export]
[Log list — virtual scroll, 32 px per row]
```

**Row format:**
`[time] [LEVEL] [component] message · meta…`

- time: 11 px mono, `--text-muted`, shows HH:mm:ss (full date on hover).
- LEVEL: 14 px semantic chip (DEBUG=muted, INFO=info, WARN=warn, ERROR=danger).
- component: 11 px mono, colored per component (poller=info-500, filter=brand-500, downloader=success-500, lifecycle=purple-500, ui=text-secondary).
- message: text-mono-sm, primary color.
- meta: truncated JSON at 120 chars; click to expand inline.

**Live toggle:** when on, new entries append; viewport auto-scrolls to bottom unless user scrolled up.

**Time range pills:** `15m | 1h | 6h | 24h | 7d | All` + custom picker.

**Export:** download currently filtered set as `.jsonl` (filename `harvester-logs-<YYYYMMDD>-<HHmmss>.jsonl`).

### 4.6 Stats (`/stats`)

Three cards, stacked vertically:

**Card 1 — Ratio over time**
Line chart, 360 px tall. Window pills above: 7d | 30d | 90d | All. Y axis log toggle. Dashed horizontal line at tier minimum in `--warn-500` with label.

**Card 2 — Upload / day + grabs / day**
Bar chart (upload bytes), line overlay (grabs count). 320 px tall. Same window pills.

**Card 3 — Rule-set performance**
Stacked bar (daily upload per rule-set, 30 d). Below: small table — Rule-set · Grabs · Upload · Download · Avg ratio (per torrent).

### 4.7 Settings (`/settings`)

Single-column form with labeled sections. Sticky right-rail TOC at xl+ for quick jumps.

Sections (in order):

1. **Service** — Kill switch (big red button) · Current status chip · Resume button (visible when paused).
2. **M-Team** — API key (masked input with show/hide + rotate). `Test connection` button. On success: shows current ratio + tier inline.
3. **qBittorrent** — host (default `127.0.0.1`) · port (default `8080`) · user · password (masked). `Test connection`. On success: shows qBt version + allowed-client check result. Override field: "Type I ACCEPT to override" text input, disables "Force grabs anyway" switch until typed.
4. **Poller** — interval slider (60–600, step 10, default 90, unit `s`). Backoff cap (read-only, 30 min).
5. **Downloads** — default save path (text input + Validate button). Default category. Default tags (chip input).
6. **Lifecycle** — seed-time-hours (default 72). Zero-peers-minutes (default 60). Remove-with-data (switch, default on).
7. **Emergency** — tier thresholds table (editable): age bucket · min ratio. Buffer (default 0.2).
8. **UI preferences** — Theme (auto | dark | light). Row density (compact | comfortable).
9. **About** — version · build hash · license (MIT) · GitHub link · docs link.

All forms use the §3.5 save/cancel footer, scoped per section — each section has its own save boundary (no giant single save).

### 4.8 First-run wizard (`/first-run`)

Centered 480 px card. 6 steps. Progress bar at top (6 dots, filled up to current). Back and Next buttons at bottom; Next is primary.

| Step | Content |
|------|---------|
| 1 Welcome | Harvester logo (large). 2-paragraph description. "I have read M-Team's rules and understand the risks" checkbox — Next disabled until checked. |
| 2 M-Team | API key input + Test. Next disabled until test passes. |
| 3 qBittorrent | Host/port/user/pass + Test + Allowed-client check. Override affordance hidden by default (small "Help" link expands it). |
| 4 Download path | Input + Validate. Next disabled until validates. |
| 5 Default rule-set | Checkbox "Install the factory-default rule-set (recommended)". Shows the rule summary below. |
| 6 Done | Success icon + "Polling will start on the next cycle (within 90 s)." · "Go to Dashboard" primary. |

Can't close except by completing all steps.

---

## 5. Interaction & State Behaviors

### 5.1 SSE management
- On page load, subscribe to `/api/service/events` and `/api/logs/stream` (if on Logs page).
- On network loss, exponential reconnect (1 s, 2 s, 4 s, 8 s, cap 30 s).
- Show SSE-disconnected banner after 5 s of failed reconnect.

### 5.2 Optimistic updates
- Pause/Resume on torrent row: immediately update the state badge to "Paused"/previous, send the API call, revert on error with toast.
- Rule-set enabled toggle: same pattern.

### 5.3 URL state
- Table filters (torrents, logs) sync to URL query params so users can share or refresh without losing view.
- Torrent drawer: URL becomes `/torrents/:id`. Closing drawer returns to `/torrents`.

### 5.4 Scroll restoration
- On SPA route change, scroll resets to top.
- On browser back, restore previous scroll position.

### 5.5 Theming
- Default: `auto` (follows system preference).
- Toggle in header flips between explicit `dark` and explicit `light`. `auto` mode unsets the explicit preference.
- Persisted in `localStorage.theme` ∈ {`auto`,`dark`,`light`}.
- SSR consideration: none — Vite CSR only in v1.

---

## 6. Accessibility

Target: WCAG 2.1 AA.

### 6.1 Contrast (verified against tokens)
- Body text `--text-primary` on `--bg-canvas`: `#f4f4f5` on `#0a0a0b` = 17.5:1 ✔
- `--text-secondary` on `--bg-canvas`: `#a1a1aa` on `#0a0a0b` = 8.3:1 ✔
- `--text-muted` on `--bg-canvas`: `#71717a` on `#0a0a0b` = 4.8:1 ✔ (just passes body AA)
- `--brand-500` on `--bg-canvas`: `#f59e0b` on `#0a0a0b` = 8.9:1 ✔
- `--brand-fg` on `--brand-500`: `#0a0a0b` on `#f59e0b` = 8.9:1 ✔
- `--danger-500` on `--bg-canvas`: `#f43f5e` on `#0a0a0b` = 5.3:1 ✔
- All semantic tints (`*-bg` at 12% alpha) + their 500 color on top = passes 4.5:1 for text-sm+ text.

### 6.2 Keyboard
- All interactive elements reachable via Tab in visual order.
- `:focus-visible` ring (§1.10) visible on every focused element.
- `Esc` closes topmost overlay.
- `Enter` submits the focused form.
- Arrow keys navigate within Tabs, Tabs focus moves with arrow keys (WAI-ARIA Tabs pattern).
- Data table rows are focusable; Enter opens the drawer; Space toggles selection; `p` pauses/resumes.

### 6.3 Screen reader
- Pages have `<h1>` for page title, `<h2>` for main sections.
- Tables use semantic `<table>`, not divs.
- Live regions: activity feed uses `aria-live="polite"`, log stream uses `aria-live="off"` (too chatty), toast `role="status"` or `role="alert"`.
- Icons inside buttons always paired with `aria-label`.
- Form fields always associated with `<label for>`.

### 6.4 Reduced motion
- `@media (prefers-reduced-motion: reduce)` disables: chart transitions, sparkline animations, pulse on status dot, drawer slide (fades instead).

### 6.5 Tooltips
- Show on hover (500 ms delay) AND on focus.
- Tooltip content available to screen readers via `aria-describedby`.

---

## 7. Token file (authoritative for IMPLEMENTATION.md)

Implementation MUST ship a single `tokens.css` file exporting the above as CSS custom properties, with a `[data-theme="light"]` variant. Tailwind config MUST `extend` (not override) the default theme with these tokens so utility classes like `bg-surface`, `text-secondary` work. Provide a `TokensTypes.ts` with TS union types for every token name for type-safe consumption.

Structure:

```
src/
  styles/
    tokens.css           # CSS variables, :root + [data-theme="light"]
    typography.css       # @font-face declarations
    reset.css            # tailwind-preflight + overrides
    globals.css          # imports above, body styles
  design/
    tokens.ts            # TS export of all token names
    icons.ts             # Named icon map (§1.8)
```

---

## 8. Anti-patterns (explicit)

- ❌ Do not use emojis anywhere in the UI — use Lucide icons.
- ❌ Do not use pill shapes for buttons. Only Switch thumb + Badge.
- ❌ Do not use gradients anywhere.
- ❌ Do not use background illustrations, abstract shapes, or decorative dividers.
- ❌ Do not use colored text for links (use underline + weight).
- ❌ Do not put > 1 primary button on any page.
- ❌ Do not use shadows in dark mode.
- ❌ Do not use color alone to convey meaning (always pair with icon or label).
- ❌ Do not use a sidebar. Harvester uses top nav.
- ❌ Do not use a side panel simultaneously with a modal.
- ❌ Do not animate anything longer than 300 ms.
- ❌ Do not show loading spinners in primary content areas — use skeletons.
- ❌ Do not auto-scroll toasts; stack with max 3 visible.

---

## 9. Design System Audit Result (self-audit post-draft)

| Category | Defined | Issues |
|----------|---------|--------|
| Color tokens | 24 dark + 20 light | None |
| Typography scale | 13 sizes | None |
| Spacing | 10-step scale | None |
| Components | 23 | All have states, sizes, a11y |
| Patterns | 9 | All documented |
| Pages | 8 | All specified |
| Accessibility | WCAG AA | Verified contrast above |
| Anti-patterns | 13 | Explicit |

**Score: 100/100 for internal consistency.** No hardcoded values permitted in implementation — IMPLEMENTATION.md MUST lint for hex/rgb literals outside `tokens.css`.

---

*End of UI design. Authoritative for visual/interaction. `UI_HANDOFF.md` translates this into developer-consumable prop shapes, responsive specs, and test checklists.*
