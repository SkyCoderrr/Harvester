import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { DashboardSummary } from '@shared/types';
import { formatBytesDecimal } from '../../lib/format';
import { DeltaPill } from './shared';
import { TileFrame, TileHeader } from './KpiTile';

// Combined Volume tile — Uploaded on top, Downloaded below. 1-wide so it
// fits the unified 7-column KPI strip at xl+ viewports.

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
    <TileFrame>
      <TileHeader
        icon={<ArrowUpDown className="h-3.5 w-3.5 text-accent" />}
        tintBg="bg-accent/10"
        label="Volume"
      />
      <div className="mt-auto space-y-1.5">
        <Row
          icon={<ArrowUp className="h-3 w-3 text-accent-success" />}
          value={up != null ? formatBytesDecimal(up) : '—'}
          delta={upDelta}
        />
        <Row
          icon={<ArrowDown className="h-3 w-3 text-accent" />}
          value={down != null ? formatBytesDecimal(down) : '—'}
          delta={downDelta}
          invert
        />
      </div>
    </TileFrame>
  );
}

function Row({
  icon,
  value,
  delta,
  invert,
}: {
  icon: React.ReactNode;
  value: string;
  delta: number | null;
  invert?: boolean;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        {icon}
        <span className="text-sm font-semibold font-mono tabular-nums truncate">{value}</span>
      </div>
      {delta != null && (
        <div className="shrink-0">
          <DeltaPill
            delta={delta}
            formatter={(d) => formatBytesDecimal(Math.abs(d))}
            invertColors={invert}
          />
        </div>
      )}
    </div>
  );
}
