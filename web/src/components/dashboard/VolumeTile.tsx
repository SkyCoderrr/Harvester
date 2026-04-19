import { ArrowDown, ArrowUp } from 'lucide-react';
import type { DashboardSummary } from '@shared/types';
import { formatBytesDecimal } from '../../lib/format';
import { DeltaPill } from './shared';

// Combined Uploaded / Downloaded tile (two sub-cells). Replaces the v2-Phase2
// pair of separate Uploaded and Downloaded KpiTiles. Decimal GB (network
// convention) per user request.

export function VolumeTile({
  data,
}: {
  data: DashboardSummary | undefined;
}): JSX.Element {
  const up = data?.uploaded_bytes_total;
  const down = data?.downloaded_bytes_total;
  const upDelta = data?.uploaded_bytes_delta_24h ?? null;
  const downDelta = data?.downloaded_bytes_delta_24h ?? null;

  return (
    <div className="bg-bg-sub border border-zinc-800 rounded-lg px-4 py-3 col-span-2">
      <div className="text-[10px] uppercase tracking-wide text-text-subtle">
        Volume (lifetime)
      </div>
      <div className="mt-1 grid grid-cols-2 gap-4">
        <Half
          icon={<ArrowUp className="h-4 w-4 text-accent-success" />}
          label="Uploaded"
          value={up != null ? formatBytesDecimal(up) : '—'}
          delta={upDelta}
        />
        <Half
          icon={<ArrowDown className="h-4 w-4 text-accent" />}
          label="Downloaded"
          value={down != null ? formatBytesDecimal(down) : '—'}
          delta={downDelta}
          invert
        />
      </div>
    </div>
  );
}

function Half({
  icon,
  label,
  value,
  delta,
  invert,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta: number | null;
  invert?: boolean;
}): JSX.Element {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wide text-text-subtle">{label}</span>
      </div>
      <div className="text-lg font-semibold truncate font-mono tabular-nums mt-0.5">
        {value}
      </div>
      {delta != null && (
        <DeltaPill
          delta={delta}
          formatter={(d) => formatBytesDecimal(Math.abs(d))}
          suffix="· 24h"
          invertColors={invert}
        />
      )}
    </div>
  );
}
