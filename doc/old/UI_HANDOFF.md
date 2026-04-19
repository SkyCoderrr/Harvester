# Harvester — UI Developer Handoff

> **Doc ID:** UI_HANDOFF.md
> **Depends on:** `PRD.md`, `UI_DESIGN.md`
> **Feeds:** `IMPLEMENTATION.md`
> **Audience:** Developers / Claude Code. Implementation-level specifics.
> **Stack assumed:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn-style copy-in components + Zustand + TanStack Query + Monaco + Recharts + lucide-react.

---

## 0. Stack Contract

| Concern | Tech | Notes |
|---------|------|-------|
| Framework | React 18 (client-only) | No SSR in v1 |
| Bundler | Vite | Fast dev, ESM output |
| Language | TypeScript 5.x | `strict: true` mandatory |
| Styling | Tailwind CSS v3 + custom tokens | Tokens defined in `src/styles/tokens.css`; Tailwind extended to reference them |
| Component pattern | shadcn/ui copy-in | Keep files editable, do not install `shadcn-ui` as a runtime dep |
| Router | React Router v6 | `createBrowserRouter` |
| Data fetching | TanStack Query v5 | 5 s stale time default; 30 s for rules; 1 s for dashboard summary; Infinity for settings (invalidate on save) |
| SSE | `@microsoft/fetch-event-source` | Or raw `EventSource`; reconnect policy in §11 of UI_DESIGN |
| State (ephemeral) | Zustand | Theme, UI prefs, transient form state |
| Forms | `react-hook-form` + `zod` resolver | Zod schemas shared with backend where possible |
| Icons | `lucide-react` | Size 14/16/20/24 px tokens |
| Charts | `recharts` | `ResponsiveContainer` + fixed heights |
| JSON editor | `@monaco-editor/react` | Lazy-loaded |
| Virtualization | `@tanstack/react-virtual` | For tables > 200 rows and logs |
| Dates | `date-fns` | Tree-shakable; use `formatDistanceToNowStrict` for relative |
| Bytes | `pretty-bytes` with a custom `{binary: true, maximumFractionDigits: 2}` wrapper | |

Everything above is REQUIRED to match. Do not substitute.

---

## 1. File & Folder Layout (UI only)

```
web/
  public/
    fonts/
      Inter-{400,500,600,700}.woff2
      JetBrainsMono-{400,500}.woff2
  src/
    main.tsx                 # entry, loads QueryClientProvider + Router
    app.tsx                  # top-level layout + theme provider
    routes/
      index.tsx              # Dashboard
      torrents/
        index.tsx            # list
        $id.tsx              # drawer route
      rules/
        index.tsx
        $id.tsx              # editor
      logs/index.tsx
      stats/index.tsx
      settings/index.tsx
      first-run/index.tsx
    components/
      ui/                    # primitives (Button, Input, Switch, ...)
        Button.tsx
        IconButton.tsx
        Input.tsx
        Select.tsx
        Switch.tsx
        Slider.tsx
        Badge.tsx
        StatusChip.tsx
        Card.tsx
        KpiTile.tsx
        DataTable.tsx
        Drawer.tsx
        Modal.tsx
        Toast.tsx
        Banner.tsx
        Popover.tsx
        Tooltip.tsx
        JsonEditor.tsx
        Tabs.tsx
        EmptyState.tsx
        Skeleton.tsx
        Checkbox.tsx
        Radio.tsx
      layout/
        AppShell.tsx         # Header + main + FooterStatus + banners
        Header.tsx
        FooterStatus.tsx
        GlobalBanners.tsx
      feature/
        dashboard/
          DashboardKpis.tsx
          ActivityFeed.tsx
          RatioSparkline.tsx
          UploadSparkline.tsx
        torrents/
          TorrentsTable.tsx
          TorrentsTabs.tsx
          TorrentDrawer.tsx
          BulkActionBar.tsx
          TorrentActionsMenu.tsx
        rules/
          RuleCard.tsx
          RuleEditorForm.tsx
          RuleEditorJson.tsx
          DryRunDrawer.tsx
        logs/
          LogList.tsx
          LogFilters.tsx
          LogRow.tsx
        stats/
          RatioChart.tsx
          UploadChart.tsx
          RuleSetPerformanceChart.tsx
        settings/
          SettingsSectionService.tsx
          SettingsSectionMTeam.tsx
          SettingsSectionQbt.tsx
          SettingsSectionPoller.tsx
          SettingsSectionDownloads.tsx
          SettingsSectionLifecycle.tsx
          SettingsSectionEmergency.tsx
          SettingsSectionUi.tsx
          SettingsSectionAbout.tsx
        first-run/
          Step1Welcome.tsx
          Step2MTeam.tsx
          Step3Qbt.tsx
          Step4Path.tsx
          Step5Rule.tsx
          Step6Done.tsx
    hooks/
      useSse.ts
      useShortcut.ts
      useTheme.ts
      useToasts.ts
    design/
      tokens.ts              # TS export of token names
      icons.ts               # named icon map
      byteFormat.ts
      timeFormat.ts
    store/
      ui.ts                  # Zustand
    api/
      client.ts              # fetch wrapper with envelope unwrap
      queries.ts             # TanStack Query hooks
      mutations.ts
      types.ts               # Shared interfaces (mirrored in IMPLEMENTATION.md)
    styles/
      tokens.css
      typography.css
      reset.css
      globals.css
    router.tsx               # React Router config
```

---

## 2. Design Tokens — Implementation Contract

### 2.1 `tokens.css` — required structure

```css
:root {
  /* Color — dark (default) */
  --bg-canvas: #0a0a0b;
  --bg-surface: #141417;
  --bg-surface-alt: #1b1b1f;
  --bg-overlay: #1f1f24;
  --bg-input: #0e0e11;
  --border-subtle: #26262c;
  --border-default: #32323a;
  --border-strong: #4a4a55;
  --text-primary: #f4f4f5;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --text-disabled: #52525b;
  --brand-500: #f59e0b;
  --brand-600: #d97706;
  --brand-fg: #0a0a0b;
  --success-500: #10b981;
  --success-bg: rgb(16 185 129 / 0.12);
  --warn-500: #eab308;
  --warn-bg: rgb(234 179 8 / 0.12);
  --danger-500: #f43f5e;
  --danger-bg: rgb(244 63 94 / 0.12);
  --info-500: #0ea5e9;
  --info-bg: rgb(14 165 233 / 0.12);
  --focus-ring: #f59e0b;

  /* Typography */
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;

  /* Spacing */
  --space-0: 0px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* Radius */
  --radius-none: 0px;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-pill: 9999px;

  /* Motion */
  --motion-fast: 120ms;
  --motion-normal: 180ms;
  --motion-enter: 220ms;
  --motion-exit: 160ms;
  --ease-out-quart: cubic-bezier(0.2, 0, 0, 1);
  --ease-in-quart: cubic-bezier(0.4, 0, 1, 1);

  /* Z-index */
  --z-base: 0;
  --z-dropdown: 10;
  --z-sticky: 20;
  --z-drawer: 30;
  --z-modal-backdrop: 40;
  --z-modal: 50;
  --z-toast: 60;
  --z-global-banner: 70;

  /* Shadows (dark = none) */
  --shadow-sm: none;
  --shadow-md: none;
  --shadow-lg: none;
}

[data-theme="light"] {
  --bg-canvas: #fafafa;
  --bg-surface: #ffffff;
  --bg-surface-alt: #f4f4f5;
  --bg-overlay: #ffffff;
  --bg-input: #ffffff;
  --border-subtle: #e4e4e7;
  --border-default: #d4d4d8;
  --border-strong: #a1a1aa;
  --text-primary: #09090b;
  --text-secondary: #3f3f46;
  --text-muted: #52525b;
  --text-disabled: #a1a1aa;
  --brand-500: #d97706;
  --brand-600: #b45309;
  --brand-fg: #ffffff;
  --success-500: #047857;
  --success-bg: rgb(4 120 87 / 0.08);
  --warn-500: #b45309;
  --warn-bg: rgb(180 83 9 / 0.08);
  --danger-500: #be123c;
  --danger-bg: rgb(190 18 60 / 0.08);
  --info-500: #0369a1;
  --info-bg: rgb(3 105 161 / 0.08);

  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04);
  --shadow-lg: 0 12px 24px -6px rgb(0 0 0 / 0.12), 0 4px 8px -4px rgb(0 0 0 / 0.06);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-fast: 0ms;
    --motion-normal: 0ms;
    --motion-enter: 0ms;
    --motion-exit: 0ms;
  }
}
```

### 2.2 `tailwind.config.ts` — required extensions

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg-canvas)",
        surface: "var(--bg-surface)",
        "surface-alt": "var(--bg-surface-alt)",
        overlay: "var(--bg-overlay)",
        input: "var(--bg-input)",
        "border-subtle": "var(--border-subtle)",
        "border-default": "var(--border-default)",
        "border-strong": "var(--border-strong)",
        "fg-primary": "var(--text-primary)",
        "fg-secondary": "var(--text-secondary)",
        "fg-muted": "var(--text-muted)",
        "fg-disabled": "var(--text-disabled)",
        brand: {
          500: "var(--brand-500)",
          600: "var(--brand-600)",
          fg:  "var(--brand-fg)",
        },
        success: { 500: "var(--success-500)", bg: "var(--success-bg)" },
        warn:    { 500: "var(--warn-500)",    bg: "var(--warn-bg)" },
        danger:  { 500: "var(--danger-500)",  bg: "var(--danger-bg)" },
        info:    { 500: "var(--info-500)",    bg: "var(--info-bg)" },
      },
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        pill: "var(--radius-pill)",
      },
      spacing: {
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        5: "var(--space-5)",
        6: "var(--space-6)",
        8: "var(--space-8)",
        10: "var(--space-10)",
        12: "var(--space-12)",
        16: "var(--space-16)",
      },
      screens: {
        md: "1024px",
        lg: "1280px",
        xl: "1536px",
        "2xl": "1920px",
      },
    },
  },
  plugins: [],
} satisfies Config;
```

### 2.3 Tokens TypeScript export

```ts
// src/design/tokens.ts
export const colors = [
  "canvas","surface","surface-alt","overlay","input",
  "border-subtle","border-default","border-strong",
  "fg-primary","fg-secondary","fg-muted","fg-disabled",
  "brand-500","brand-600","brand-fg",
  "success-500","success-bg","warn-500","warn-bg",
  "danger-500","danger-bg","info-500","info-bg",
] as const;
export type ColorToken = typeof colors[number];
```

---

## 3. Component Props — Every UI Primitive

### 3.1 Button

```ts
interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "link";   // default "secondary"
  size?: "sm" | "md" | "lg";                                                      // default "md"
  loading?: boolean;                                                              // default false
  disabled?: boolean;
  leadingIcon?: LucideIconName;
  trailingIcon?: LucideIconName;
  fullWidth?: boolean;
  type?: "button" | "submit" | "reset";                                           // default "button"
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}
```

**Tailwind classes by variant (dark examples; light uses the same tokens, different resolved colors):**

- `primary`: `bg-brand-500 text-brand-fg hover:bg-brand-600 disabled:opacity-50`
- `secondary`: `bg-surface border border-border-default text-fg-primary hover:border-border-strong hover:bg-surface-alt`
- `ghost`: `bg-transparent text-fg-primary hover:bg-surface-alt`
- `danger`: `bg-danger-500 text-white hover:bg-[color-mix(in_srgb,var(--danger-500)_85%,black)]`
- `success`: same pattern, swap tokens
- `link`: `bg-transparent text-fg-primary underline underline-offset-4 decoration-border-default hover:decoration-border-strong`

All variants: `inline-flex items-center justify-center gap-2 rounded-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]`.

Size mapping: `sm → h-7 px-[10px] text-[13px]`, `md → h-8 px-3 text-[13px]`, `lg → h-10 px-4 text-[14px]`.

### 3.2 IconButton

```ts
interface IconButtonProps {
  icon: LucideIconName;
  size?: "sm" | "md" | "lg";                                                      // 28/32/40 px
  variant?: "ghost" | "outline" | "danger";                                       // default "ghost"
  "aria-label": string;                                                           // REQUIRED — enforced at type level
  tooltip?: string;                                                               // shows on hover/focus, 500 ms delay
  onClick?: () => void;
}
```

Enforcement of `aria-label` via conditional type:

```ts
type IconButtonProps = BaseProps & { "aria-label": string };
```

### 3.3 Input

```ts
interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md";                                    // default "md"
  label?: string;
  helper?: string;
  error?: string;                                        // sets aria-invalid + error styling
  leadingIcon?: LucideIconName;
  trailingIcon?: LucideIconName;
  trailingAction?: { icon: LucideIconName; onClick: () => void; label: string };  // e.g. show/hide password
  mono?: boolean;                                        // use font-mono (for paths, hashes, API keys)
}
```

Classes: `h-8 w-full bg-input border border-border-default rounded-sm px-3 text-[13px] placeholder:text-fg-muted focus-visible:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]`.

Error variant replaces border with `border-danger-500` and sets `aria-invalid="true"` + `aria-describedby` to helper ID.

### 3.4 Select

Headless + custom popover. Do not use native `<select>` (inconsistent dark mode across OS). Use a Radix-like popover pattern, or copy-in `cmdk` or implement from scratch.

```ts
interface SelectProps<T extends string | number> {
  value: T | null;
  options: Array<{ value: T; label: string; description?: string; icon?: LucideIconName }>;
  onChange: (value: T) => void;
  placeholder?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  label?: string;
  helper?: string;
  error?: string;
}
```

Multi-select variant `<MultiSelect>` with chip display inside input; chips use Badge component.

### 3.5 Switch

```ts
interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;                                        // visible label to the right
  description?: string;
  size?: "sm" | "md";                                    // 28×14 / 32×16 track
}
```

Track: `bg-surface-alt data-[checked=true]:bg-brand-500`. Thumb: `bg-fg-muted data-[checked=true]:bg-white`. Transition `transform var(--motion-normal) var(--ease-out-quart)`.

ARIA: `role="switch" aria-checked={checked}`.

### 3.6 Slider

```ts
interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;                                         // default 1
  onChange: (v: number) => void;
  label?: string;
  unit?: string;                                         // shown after value, e.g. "s"
  mono?: boolean;                                        // value display in mono
}
```

### 3.7 Badge

```ts
interface BadgeProps {
  variant: "neutral" | "success" | "warn" | "danger" | "info" | "purple"
         | "discount-FREE" | "discount-_2X_FREE" | "discount-_2X"
         | "discount-PERCENT_50" | "discount-PERCENT_30" | "discount-NORMAL";
  size?: "sm" | "md";                                    // 16 / 20 px height
  children: ReactNode;
  icon?: LucideIconName;
}
```

### 3.8 StatusChip

```ts
interface StatusChipProps {
  status: "RUNNING" | "PAUSED_USER" | "PAUSED_EMERGENCY" | "PAUSED_BACKOFF" | "STOPPED";
  size?: "sm" | "md";
  pulsing?: boolean;                                     // auto-on when status === "RUNNING"
  label?: string;                                        // override default label
}
```

### 3.9 Card

```ts
interface CardProps {
  title?: string;
  action?: ReactNode;                                    // right-aligned in header
  padding?: "none" | "sm" | "md" | "lg";                 // default "md" = 16 px
  children: ReactNode;
}
```

### 3.10 KpiTile

```ts
interface KpiTileProps {
  label: string;
  value: string;                                         // pre-formatted
  delta?: { direction: "up" | "down"; value: string; semantic: "good" | "bad" | "neutral" };
  footer?: string;
  variant?: "default" | "danger" | "warn";               // left-border + value color
  onClick?: () => void;                                  // clickable tile
  mono?: boolean;                                        // default true for value
}
```

### 3.11 DataTable

```ts
interface DataTableProps<T extends { id: string }> {
  columns: Array<{
    id: string;
    header: string;
    accessor: (row: T) => ReactNode;
    width?: number;                                      // px
    align?: "left" | "center" | "right";                 // default "left"
    sortable?: boolean;
    minWidth?: number;
    hideBelow?: "md" | "lg" | "xl";                      // responsive hide
    mono?: boolean;
    className?: string;
  }>;
  rows: T[];
  rowHeight?: 32 | 36 | 44;                              // default 36
  virtual?: boolean;                                     // default true when rows.length > 200
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  sort?: { columnId: string; direction: "asc" | "desc" };
  onSortChange?: (sort: { columnId: string; direction: "asc" | "desc" }) => void;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  loading?: boolean;                                     // shows skeleton rows
  error?: string | null;
  onRetry?: () => void;
}
```

Keyboard: row receives focus, Enter → onRowClick, Space → toggle selection.

### 3.12 Drawer

```ts
interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  size?: "md" | "lg";                                    // 520 / 720 px
  children: ReactNode;
  footer?: ReactNode;
  preventCloseOnBackdrop?: boolean;                      // when form is dirty
}
```

Animation: `transform: translateX(100%) → 0` + `opacity: 0 → 1` over `--motion-enter var(--ease-out-quart)`. Reverse on close using `--motion-exit var(--ease-in-quart)`.

### 3.13 Modal

```ts
interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg";                             // 480 / 640 / 800 px
  children?: ReactNode;
  footer?: ReactNode;
  closeOnBackdrop?: boolean;                             // default true
}
```

Focus trap required. Auto-focus on first focusable child of content (or Cancel for destructive confirmations).

### 3.14 Toast / ToastProvider

```ts
interface ToastOptions {
  title: string;
  description?: string;
  variant: "info" | "success" | "warn" | "danger" | "emergency";
  durationMs?: number;                                   // default: 5000 for info/success; Infinity for warn/danger/emergency
  actionLabel?: string;
  onAction?: () => void;
  category?: string;                                     // for user mute-by-category
}
```

Provider exposes `useToasts()` hook: `{ toast, dismiss, dismissAll, muted, toggleMute }`.

Persistence of mute categories in `localStorage.toastMutes` (JSON array of category strings).

### 3.15 Banner

```ts
interface BannerProps {
  variant: "info" | "warn" | "danger";
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  dismissible?: boolean;                                 // only for info
  icon?: LucideIconName;                                 // default based on variant
}
```

### 3.16 Tooltip

Uses `@radix-ui/react-tooltip`-style primitives or a custom minimal equivalent. Delay 500 ms on mouseover, 0 ms on focus. Max width 240 px.

### 3.17 JsonEditor

```ts
interface JsonEditorProps {
  value: string;                                          // stringified JSON
  onChange: (next: string) => void;
  schema?: object;                                        // JSON Schema for live validation
  height?: number;                                        // default 420 px
  readOnly?: boolean;
  onValidation?: (errors: Array<{ line: number; message: string }>) => void;
}
```

Lazy-loaded via `React.lazy`. Show skeleton while loading.

### 3.18 Tabs

```ts
interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  items: Array<{ value: string; label: string; count?: number; icon?: LucideIconName }>;
}
```

Keyboard: Arrow-left/right moves focus between tabs, Enter/Space activates. WAI-ARIA Tabs pattern.

### 3.19 EmptyState

```ts
interface EmptyStateProps {
  icon: LucideIconName;
  title: string;
  helper?: string;
  action?: { label: string; onClick: () => void; variant?: ButtonProps["variant"] };
}
```

### 3.20 Skeleton

```ts
interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  circle?: boolean;
  className?: string;
}
```

Default animation: linear shimmer `background: linear-gradient(90deg, surface-alt, overlay, surface-alt); background-size: 200% 100%; animation: shimmer 1.6s infinite`.

---

## 4. Page-Level Handoff

### 4.1 Global Shell

**Header** (`<Header />`):

| Element | Classes (summary) | Behavior |
|---------|-------------------|----------|
| Container | `h-12 bg-surface border-b border-border-subtle px-6 flex items-center gap-6 sticky top-0 z-[var(--z-sticky)]` | Always sticky |
| Wordmark | `font-semibold text-[14px]` | The "H" uses `text-brand-500` |
| Nav tabs | `flex gap-1` | Active tab: `bg-surface-alt text-fg-primary`. Hover: `bg-surface-alt`. Tab height 32 px, px 12. Uses React Router NavLink. |
| Theme toggle | IconButton size sm | Toggles between dark/light; long-press (500 ms) cycles through auto/dark/light |
| Kill switch | Pill button 32 px, danger outline when RUNNING; filled when PAUSED_USER | See PRD FR-SG-02 |
| Shortcut help | IconButton opens modal | |

**Footer** (`<FooterStatus />`):

| Element | Notes |
|---------|-------|
| Container | `h-7 bg-surface border-t border-border-subtle px-4 flex items-center gap-4 text-[11px]` |
| Service status | `<StatusChip />`. Pulsing when RUNNING. |
| Last poll | `Clock` icon + "12s ago" (updates every 1 s via timer) |
| qBt | `<StatusChip size="sm" pulsing={false} />` |
| M-Team | same |
| Allowed client | CheckCircle2 (ok) or AlertTriangle (warn) + version text |
| Build hash | right-aligned, `font-mono text-fg-muted` |

### 4.2 Dashboard

**Query hooks:**
- `useDashboardSummary` → GET `/api/dashboard/summary`, staleTime 1000 ms, refetchInterval 2000 ms.
- `useLogsTail` → SSE subscription to `/api/logs/stream`, ring buffer of 50 rows.
- `useStatsDaily` → GET `/api/stats/daily?from=-30d` for sparklines.

**Layout grid:**

```
<div class="container mx-auto max-w-[1440px] px-6 py-6 space-y-6">
  <GlobalBanners />
  <KpiRow>                                  /* flex flex-wrap gap-3 */
    <KpiTile .../>  (x7)
  </KpiRow>
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-7">
      <ActivityFeed />                      /* Card, height 480 px */
    </div>
    <div class="col-span-5 space-y-6">
      <Card title="Upload per day (30d)"> <UploadSparkline /> </Card>
      <Card title="Ratio trajectory (30d)"> <RatioSparkline /> </Card>
    </div>
  </div>
</div>
```

**KpiTile data mapping:**

| Tile | Label | Value | Delta | Footer | Variant rule |
|------|-------|-------|-------|--------|--------------|
| Ratio | `RATIO` | `data.ratio.toFixed(2)` | none | `tier min ${data.tier_min_ratio.toFixed(2)}` | `danger` if `ratio < tier_min + 0.2` else `warn` if `< +0.5` |
| Up today | `UPLOADED TODAY` | `fmtBytes(data.uploaded_today)` | prev-day delta | — | default |
| Dn today | `DOWNLOADED TODAY` | `fmtBytes(data.downloaded_today)` | — | — | default |
| Active | `ACTIVE TORRENTS` | `${data.active_leeching + data.active_seeding}` | — | `${data.active_leeching}L / ${data.active_seeding}S` | default |
| Grabs 24h | `GRABS · 24H` | `data.grabs_24h` | vs previous 24h | — | default |
| Expiring | `FREE WINDOWS ≤1H` | `data.expiring_1h` | — | `click to filter` | `warn` if > 0 |
| Disk | `DISK FREE` | `fmtBytes(data.disk_free_gib * 2^30)` | — | — | `danger` if `< 50 GiB` |

`ActivityFeed` internals: virtual list of 50 rows (stable). New row from SSE prepends and scrolls into view only when user is at top.

### 4.3 Torrents

**Query hooks:**
- `useTorrents({state, q, cursor})` → GET `/api/torrents` with cursor pagination.
- `useTorrent(id)` → GET `/api/torrents/:id`.
- `useTorrentAction()` mutation → POST `/api/torrents/:id/action` with optimistic state update.
- `useBulkAction()` mutation → POST `/api/torrents/bulk-action`.

**Layout:**

```
<div class="container mx-auto max-w-[1440px] px-6 py-6">
  <Tabs items={[All, Active, Seeding, Completed, Removed, Errored]} ... />
  <div class="mt-4 flex items-center gap-3">
    <Input leadingIcon="Search" placeholder="Search by name or infohash" />
    <FilterChips ... />
  </div>
  <BulkActionBar class="mt-3" />     /* visible only when selectedIds.size > 0 */
  <DataTable class="mt-3" columns={...} rows={...} selectable ... />
</div>
```

**Cursor pagination:** `?cursor=<opaque>&limit=100`. Infinite-scroll via `useInfiniteQuery`. Sentinel row at bottom triggers next page when intersected.

**Drawer route behavior:**
- Navigating to `/torrents/:id` opens drawer over the list (list stays mounted).
- Close → `navigate('/torrents')` with scroll preserved.
- `Drawer`'s `preventCloseOnBackdrop` = true if user is mid-edit of any field.

### 4.4 Rules

**Query hooks:**
- `useRules()` → GET `/api/rules`.
- `useRule(id)` → GET `/api/rules/:id`.
- `useCreateRule()`, `useUpdateRule(id)`, `useDeleteRule(id)`.
- `useDryRun(id)` → POST `/api/rules/:id/dry-run`.
- `useValidateRule()` → POST `/api/rules/validate` (debounced 400 ms).

**Editor form schema (Zod):**

```ts
const ruleZ = z.object({
  name: z.string().min(1).max(64).regex(/^[A-Za-z0-9 _-]+$/),
  enabled: z.boolean(),
  rules: z.object({
    schema_version: z.literal(1),
    discount_whitelist: z.array(z.enum(["FREE","_2X_FREE","_2X","PERCENT_50","PERCENT_30","NORMAL"])).nonempty(),
    min_free_hours_remaining: z.number().min(0).max(240),
    size_gib_min: z.number().min(0).max(10_000),
    size_gib_max: z.number().min(0).max(10_000),
    category_whitelist: z.array(z.string()).nullable(),
    min_seeders: z.number().int().min(0).nullable(),
    max_seeders: z.number().int().min(0).nullable(),
    min_leechers: z.number().int().min(0).nullable(),
    leecher_seeder_ratio_min: z.number().min(0).nullable(),
    title_regex_include: z.string().nullable(),
    title_regex_exclude: z.string().nullable(),
    free_disk_gib_min: z.number().min(0),
    first_seeder_fast_path: z.object({
      enabled: z.boolean(),
      max_age_minutes: z.number().int().min(1).max(120),
    }),
    qbt_category: z.string().max(64),
    qbt_tags_extra: z.array(z.string()),
    qbt_save_path: z.string().nullable(),
    qbt_upload_limit_kbps: z.number().int().min(0).nullable(),
  }).refine(r => r.size_gib_min <= r.size_gib_max, { path: ["size_gib_max"], message: "Max must be ≥ min" }),
});
```

Regex validity: run `new RegExp(value, "u")` in onBlur; show error if throws.

### 4.5 Logs

**Virtualization:** use `useVirtualizer` with `estimateSize: 32`. Parent height = viewport height minus header (48) minus footer (28) minus filter bar (~52) minus page padding (48) = `calc(100vh - 176px)`.

**SSE buffer:** 10 000 row ring buffer in a Zustand slice.

**Time range pills:** `["15m","1h","6h","24h","7d","All","Custom"]`. "Custom" opens a date-range popover.

**Export:** client-side — Blob from the current filtered array, `URL.createObjectURL`, anchor with `download`.

### 4.6 Stats

**Charts (Recharts):**
- `RatioChart` — `<LineChart>` with `<YAxis scale={logToggle?"log":"linear"}>`, `<ReferenceLine y={tierMin} stroke="var(--warn-500)" strokeDasharray="4 4" />`. Tooltip formats ratio to 2 decimals + UTC absolute date.
- `UploadChart` — `<ComposedChart>` with `<Bar dataKey="uploaded_bytes" />` and `<Line dataKey="grabbed_count" yAxisId="right" />`. Dual y-axes.
- `RuleSetPerformanceChart` — `<BarChart>` stacked, each rule-set a key with its color from the palette.

### 4.7 Settings

All sections: `react-hook-form` with section-scoped `<FormProvider>` and a sticky `<SaveCancelFooter />`. Cancel reverts `reset()`. Save disabled unless `isDirty`.

**API key input:** type `password` + show/hide toggle. "Rotate" opens a modal: "Generate a new key on M-Team and paste it here. The old key will be overwritten." Paste field + Confirm.

**Test connection:** buttons are `variant="secondary"`, show inline result as a StatusChip + text (`<CheckCircle2/> Connected — ratio 3.41 — tier: MEMBER` or `<AlertOctagon/> Failed — {error}`).

**Allowed-client override:** hidden behind a "Show override" link. Typing `I ACCEPT` in a text input enables the Switch. On enable, a warn Toast fires.

**Tier thresholds table editing:** a mini-table with inline number inputs. Add-row button to extend. Validate: age buckets must be ascending.

### 4.8 First-run

Step router using `useState<number>`. URL updates to `/first-run?step=N` for reloadability.

Each step is a distinct component; navigation buttons at bottom. Next disabled until validation passes. Clicking a past step dot navigates back.

On step 6 Done: `POST /api/first-run/complete { acknowledged: true }`, then `navigate('/')`. Global app gate: if `/api/service/state` returns `first_run_complete === false`, redirect any route to `/first-run`.

---

## 5. Interactions & Motion Catalog

| Element | Trigger | Animation | Duration | Easing |
|---------|---------|-----------|----------|--------|
| Button hover | mouseenter | background color | 120 ms | ease-out-quart |
| Button press | mousedown | background-color darken | 100 ms | — |
| Switch toggle | click | thumb translate + track color | 180 ms | ease-out-quart |
| Drawer open | state → true | translateX + opacity | 220 ms | ease-out-quart |
| Drawer close | state → false | translateX + opacity | 160 ms | ease-in-quart |
| Modal open | state → true | scale 0.96 → 1 + opacity | 180 ms | ease-out-quart |
| Toast enter | mount | translateY 12 px → 0 + opacity | 180 ms | ease-out-quart |
| Toast exit | unmount | translateX 100% + opacity | 160 ms | ease-in-quart |
| Tab change | click | indicator underline translate-x | 180 ms | ease-out-quart |
| StatusChip pulse | always (RUNNING) | opacity 1 → 0.5 → 1 | 1600 ms loop | linear |
| Skeleton shimmer | always | background-position 200% | 1600 ms loop | linear |
| Row hover | mouseenter | background-color | 120 ms | ease-out-quart |
| Banner enter | mount | height 0 → auto + opacity | 220 ms | ease-out-quart |
| Chart line draw | first mount only | Recharts default | 600 ms | ease-out |
| KPI value tick | data update | tabular-nums cross-fade | 200 ms | ease-out-quart |

All reduced by `prefers-reduced-motion`.

---

## 6. Responsive Behavior

| Breakpoint | Dashboard | Torrents | Rules | Logs | Stats | Settings |
|------------|-----------|----------|-------|------|-------|----------|
| ≥ 1920 px (2xl) | 7 KPI tiles in row, body 12-col | All columns visible | Standard | Standard | 3 cards stacked, charts 480 px | 2-col form with sticky TOC |
| ≥ 1536 px (xl) | 7 KPI, 12-col body | All columns | Standard | Standard | 3 cards stacked | Sticky right TOC |
| ≥ 1280 px (lg) | 7 KPI wrap after 6 at edge | Hide Down, S/L | Standard | Standard | Charts 360 px | No sticky TOC |
| ≥ 1024 px (md) | 6 KPI per row (wraps) | Hide Added, Free left too | Rule cards stack | Filters wrap to 2 rows | Charts 320 px | Full-width form, no TOC |
| < 1024 px (< md) | Tablet warning banner + usable but cramped | Table scrolls horizontally | — | — | — | — |
| < 768 px | "Open on desktop" full-screen message | same | same | same | same | same |

---

## 7. Edge Cases (per component/page)

### 7.1 DataTable
- **Very long torrent names** (> 200 chars): single-line truncation with `Tooltip` showing full on hover.
- **Names containing RTL characters** (Arabic, Hebrew): use `<bdi>` around the name to isolate directionality.
- **Rows > 10 000** (unlikely but possible): virtualization MUST not allocate DOM for non-visible rows.
- **All columns hidden by responsive rules**: impossible — Name, Size, Discount, Actions are always visible.
- **Selection across pagination pages**: selected IDs persist across paginated fetches; "Select all on page" checkbox at the header.

### 7.2 KpiTile
- **Missing data** (first-run, < 24 h of uptime): show `—` as value, `text-muted`, add footer "no data yet".
- **Negative delta on ratio** while RUNNING: show arrow down in red.
- **Extreme values** (e.g., ratio 999): scale down font using `text-[20px]` override class triggered by value length > 6.

### 7.3 Logs
- **Burst > 1000 rows/s**: SSE handler buffers and commits every 200 ms to avoid re-render storm.
- **Messages > 2000 chars**: truncate to 200 chars in list view, full text on row expand.
- **JSON meta that fails parse**: display as raw text; do not crash.

### 7.4 Rule editor
- **Invalid regex** in include/exclude: block Save; show error below the field.
- **`size_gib_max < size_gib_min`**: Zod refine error on max field.
- **Duplicate rule-set name**: server returns 409; show error on the name field + toast.
- **Monaco fails to load** (offline, bundler issue): show fallback `<textarea>` with JSON + warning banner.

### 7.5 Settings
- **qBt test with invalid cert** (if user forwarded with https self-signed): surface the error verbatim; we do not add a "trust insecure" toggle in v1.
- **API key rotate while service running**: disable Rotate until service is PAUSED_USER.
- **Path validation on Windows** with forward slashes: accept and normalize via backend; show normalized version under the input.

### 7.6 First-run
- **User navigates directly to `/` before completing wizard**: global gate in `AppShell` checks `service_state.first_run_complete` and redirects.
- **User closes browser mid-wizard**: on reload, resume at the last completed step.

### 7.7 Global
- **SSE fails to reconnect** after 30 s: info banner + manual "Retry" button.
- **Server reachable but returns 500**: show error card per-page, not a global error modal.
- **User triggers action during backoff**: buttons disable; tooltip explains "Polling in backoff; try again in X s".

---

## 8. Accessibility Handoff

### 8.1 Focus order (per page, Tab direction)
- **Header**: logo (not focusable) → nav tabs (in order) → theme → kill switch → help.
- **Dashboard**: KPI tiles (only clickable ones focusable) → activity feed (list scroll) → sparklines (skip; tooltips keyboard-activatable via row-level focus).
- **Torrents**: tabs → search → filter chips → bulk bar (when visible) → table header (for sort) → rows → row-level actions.
- **Rules**: "New" button → rule cards (switch → name → dry-run → edit → ⋯).
- **Rule editor**: tabs → fields in visual order → footer buttons.
- **Logs**: filter controls → Live toggle → Export → list.
- **Stats**: window pills → log-toggle → chart (focus receives summary text) → table rows.
- **Settings**: section headings (skip links) → fields → save/cancel.

### 8.2 ARIA roles
- Pages use `<main id="main">` with a skip-link in Header (`<a href="#main" class="sr-only focus:not-sr-only">Skip to content</a>`).
- Tabs: `role="tablist"` / `role="tab"` / `role="tabpanel"` + `aria-selected`.
- DataTable: native `<table role="table">`; rows `role="row"`; checkboxes labeled by row name.
- Drawer / Modal: `role="dialog" aria-modal="true" aria-labelledby=<title id>`.
- Toast: `role="status"` (info/success) or `role="alert"` (warn/danger/emergency).
- Log stream region: `aria-live="off"` (polite would flood).
- Activity feed on dashboard: `aria-live="polite" aria-atomic="false"` capped at 5 announcements/minute via debounce.

### 8.3 Keyboard behaviors per component

Already specified in `UI_DESIGN.md §3.9` and component §3 here. Test matrix in §10.

### 8.4 Screen reader announcements (sample)
- Kill switch press: "Polling paused by user" (live region).
- Emergency mode triggered: "Emergency pause: ratio is within 0.2 of tier minimum. Seeding continues." (alert).
- Grab event (dashboard toast): "Grabbed: [torrent name], [size]. Rule-set: [name]." (status).

---

## 9. Asset Requirements

| Asset | Source | Place |
|-------|--------|-------|
| Inter 400/500/600/700 woff2 | rsms.me/inter or self-host | `public/fonts/` |
| JetBrains Mono 400/500 woff2 | jetbrains.com | `public/fonts/` |
| Favicon Harvester | custom — "H" glyph in brand-500 on transparent | `public/favicon.svg` 16×16, 32×32, 180×180 apple-touch |
| OG image | none (local tool, no sharing) | — |
| Icons | `lucide-react@latest` | — |

`typography.css`:

```css
@font-face { font-family: "Inter"; font-weight: 400; font-style: normal;
  src: url("/fonts/Inter-400.woff2") format("woff2"); font-display: swap; }
@font-face { font-family: "Inter"; font-weight: 500; font-style: normal;
  src: url("/fonts/Inter-500.woff2") format("woff2"); font-display: swap; }
@font-face { font-family: "Inter"; font-weight: 600; font-style: normal;
  src: url("/fonts/Inter-600.woff2") format("woff2"); font-display: swap; }
@font-face { font-family: "Inter"; font-weight: 700; font-style: normal;
  src: url("/fonts/Inter-700.woff2") format("woff2"); font-display: swap; }
@font-face { font-family: "JetBrains Mono"; font-weight: 400; font-style: normal;
  src: url("/fonts/JetBrainsMono-400.woff2") format("woff2"); font-display: swap; }
@font-face { font-family: "JetBrains Mono"; font-weight: 500; font-style: normal;
  src: url("/fonts/JetBrainsMono-500.woff2") format("woff2"); font-display: swap; }
```

---

## 10. Test Matrix (feeds IMPLEMENTATION.md test plan)

### Unit / component tests (Vitest + React Testing Library)

- [ ] `Button` renders each variant with correct classes.
- [ ] `Button` loading state replaces leading icon with spinner.
- [ ] `IconButton` requires `aria-label`; TS compile error if missing (compile check).
- [ ] `Input` shows error state with `aria-invalid` when error prop set.
- [ ] `Switch` fires onChange with next boolean; keyboard Space toggles.
- [ ] `Badge` renders each variant; discount badges use the fixed palette.
- [ ] `StatusChip` pulses only when `status === "RUNNING"` AND `prefers-reduced-motion` is no-preference.
- [ ] `DataTable` virtualizes when rows > 200.
- [ ] `DataTable` row click fires onRowClick only if click target isn't in the actions column.
- [ ] `Drawer` traps focus; Escape closes; backdrop click respects preventCloseOnBackdrop.
- [ ] `Modal` auto-focuses per destructive-confirm rule (Cancel gets focus for danger confirms).
- [ ] `Toast` auto-dismisses info/success at 5 s; keeps warn/danger/emergency until dismiss.
- [ ] `Tooltip` 500 ms hover delay, 0 ms on focus.
- [ ] `KpiTile` switches to `danger` variant when variant prop set.
- [ ] Theme toggle updates `[data-theme]` and persists to localStorage.
- [ ] Shortcut `g d` navigates to Dashboard from any route except inputs.
- [ ] Shortcut `/` focuses the current page's primary search input.

### Integration tests

- [ ] Dashboard fetches summary, renders 7 KPIs, and activity feed streams via SSE mock.
- [ ] Torrents table loads, paginates on scroll, row click opens drawer; drawer URL updates.
- [ ] Rule editor: form submit creates; server 409 shows name error.
- [ ] Rule editor JSON tab: invalid JSON disables Save.
- [ ] Dry-run drawer renders result rows.
- [ ] Logs page: SSE streams; filters apply instantly; Live toggle stops auto-scroll when user scrolls up.
- [ ] Settings: Save disabled unless dirty; Cancel reverts.
- [ ] First-run: cannot navigate past step until validation passes; completion navigates to `/`.

### Visual regression (Chromatic or Playwright + image diff)

- [ ] Dashboard at 1024 / 1280 / 1920 px, dark + light.
- [ ] Torrents table at 1024 / 1280 / 1920.
- [ ] Drawer at 1280 px with long payload.
- [ ] Rule editor Form tab + JSON tab.
- [ ] Logs with 1000 rows.
- [ ] Emergency banner + kill-switch-active state.

### Accessibility (axe-core + manual)

- [ ] Every page axe score = 0 serious/critical.
- [ ] Keyboard-only navigation reaches every action.
- [ ] Screen reader (NVDA) reads Kill switch press, toast, banner.
- [ ] Contrast report: every token pair used in text passes WCAG AA.
- [ ] Reduced-motion disables pulse/shimmer/transforms.

---

## 11. API Binding Quick Reference

(Full API surface in PRD §12. TS types in IMPLEMENTATION.md §3.)

| Page | GET (queries) | POST/PUT/DELETE (mutations) | SSE |
|------|---------------|-----------------------------|-----|
| Dashboard | `/api/dashboard/summary` (1 s stale, 2 s poll), `/api/stats/daily?from=-30d` | — | `/api/service/events`, `/api/logs/stream` |
| Torrents | `/api/torrents`, `/api/torrents/:id` | `/api/torrents/:id/action`, `/api/torrents/bulk-action` | `/api/service/events` (for row updates) |
| Rules | `/api/rules`, `/api/rules/:id`, `/api/rules/validate` | `/api/rules`, `/api/rules/:id`, `/api/rules/:id/dry-run`, DELETE `/api/rules/:id` | — |
| Logs | `/api/logs` (paginated), `/api/logs/stream` | — | `/api/logs/stream` |
| Stats | `/api/stats/daily`, `/api/stats/ruleset-performance` | — | — |
| Settings | `/api/settings`, `/api/service/state` | `/api/settings`, `/api/settings/test/mteam`, `/api/settings/test/qbt`, `/api/service/pause`, `/api/service/resume` | `/api/service/events` (for status chip) |
| First-run | `/api/service/state` | `/api/settings/test/*`, `/api/settings`, `/api/first-run/complete` | — |

---

## 12. Rendering Rules (catch-all)

- Every number in a table cell: `font-mono tabular-nums`.
- Every relative time: `<RelativeTime ts={unixSec} />` which renders `X ago` + `title="YYYY-MM-DD HH:mm:ss"`.
- Every byte size: `<Bytes value={bytes} />` → IEC formatted.
- Every infohash display: `font-mono` + click-to-copy (Copy icon on hover).
- Every external link: `target="_blank" rel="noopener noreferrer"` + `ExternalLink` trailing icon at 12 px.
- Every truncation: `<Truncate maxLines={1}>…</Truncate>` with native CSS `line-clamp`.

---

*End of UI handoff. All component contracts and page specs above are authoritative; IMPLEMENTATION.md wires them into backend + build pipeline.*
