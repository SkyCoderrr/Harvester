import { clsx } from 'clsx';
import { DeltaPill } from './shared';

// Uniform KPI tile: icon pill (top-left) + small uppercase label + big
// tabular-nums value (bottom-left) + optional delta pill. Every tile in the
// strip uses this frame so the row reads as a single unit.

export interface KpiTileProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  /** Icon tint (defaults to accent). Only affects the pill bg + glyph. */
  accent?: 'accent' | 'success' | 'warn' | 'danger';
  hint?: string;
  delta?: number | null;
  deltaFormatter?: (v: number) => string;
  deltaSuffix?: string;
  deltaInvert?: boolean;
}

const TONE: Record<NonNullable<KpiTileProps['accent']>, { bg: string; text: string }> = {
  accent: { bg: 'bg-accent/10', text: 'text-accent' },
  success: { bg: 'bg-accent-success/10', text: 'text-accent-success' },
  warn: { bg: 'bg-accent-warn/10', text: 'text-accent-warn' },
  danger: { bg: 'bg-accent-danger/10', text: 'text-accent-danger' },
};

export function KpiTile({
  label,
  icon: Icon,
  value,
  accent = 'accent',
  hint,
  delta,
  deltaFormatter,
  deltaSuffix,
  deltaInvert,
}: KpiTileProps): JSX.Element {
  const tone = TONE[accent];
  return (
    <TileFrame>
      <TileHeader icon={<Icon className={clsx('h-3.5 w-3.5', tone.text)} />} tintBg={tone.bg} label={label} />
      <div className="mt-auto min-h-[36px]">
        <div className="text-xl font-semibold font-mono tabular-nums leading-tight truncate">
          {value}
        </div>
        {delta != null && deltaFormatter && (
          <DeltaPill
            delta={delta}
            formatter={deltaFormatter}
            suffix={deltaSuffix}
            invertColors={deltaInvert}
          />
        )}
        {hint && delta == null && (
          <div className="text-[10px] text-text-muted truncate mt-0.5">{hint}</div>
        )}
      </div>
    </TileFrame>
  );
}

// -- Shared frame + header, used by VolumeTile / TorrentsTile / DiskTile ----

export function TileFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={clsx(
        'bg-bg-sub border border-zinc-800 rounded-xl p-4 flex flex-col gap-2 min-h-[104px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TileHeader({
  icon,
  tintBg,
  label,
  right,
}: {
  icon: React.ReactNode;
  tintBg: string;
  label: string;
  right?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <div className={clsx('h-7 w-7 rounded-md flex items-center justify-center shrink-0', tintBg)}>
          {icon}
        </div>
        <span className="text-[10px] uppercase tracking-wider text-text-subtle font-medium truncate">
          {label}
        </span>
      </div>
      {right}
    </div>
  );
}
