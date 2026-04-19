import { clsx } from 'clsx';
import { DeltaPill } from './shared';

export interface KpiTileProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  tone?: string;
  hint?: string;
  delta?: number | null;
  deltaFormatter?: (v: number) => string;
  deltaSuffix?: string;
  /**
   * When true a positive delta is rendered in danger color (e.g. DOWNLOADED —
   * more data pulled is not a win). Default false.
   */
  deltaInvert?: boolean;
}

export function KpiTile({
  label,
  icon: Icon,
  value,
  tone,
  hint,
  delta,
  deltaFormatter,
  deltaSuffix,
  deltaInvert,
}: KpiTileProps): JSX.Element {
  return (
    <div className="bg-bg-sub border border-zinc-800 rounded-lg px-4 py-3 flex items-start gap-3">
      <Icon className={clsx('h-5 w-5 mt-0.5', tone ?? 'text-text-muted')} />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-text-subtle">{label}</div>
        <div className="text-lg font-semibold truncate font-mono tabular-nums">{value}</div>
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
    </div>
  );
}
