import { clsx } from 'clsx';
import { Boxes } from 'lucide-react';
import type { DashboardSummary } from '@shared/types';
import { TileFrame, TileHeader } from './KpiTile';

// 4-bucket torrent breakdown in a compact 2x2 grid, same 1-wide footprint
// as the other KPI tiles. Replaces the v2-Phase2 pair of Active/Stalled
// tiles that were hard to tell apart.

export function TorrentsTile({ data }: { data: DashboardSummary | undefined }): JSX.Element {
  const cells = [
    { label: 'Active', value: data?.active_count ?? 0, tone: 'text-accent-success' },
    { label: 'Seeding', value: data?.seeding_count ?? 0, tone: 'text-accent' },
    { label: 'Stalled', value: data?.stalled_count ?? 0, tone: 'text-accent-warn' },
    { label: 'Error', value: data?.error_count ?? 0, tone: 'text-accent-danger' },
  ];
  const total = data?.harvester_torrent_count ?? cells.reduce((a, b) => a + b.value, 0);

  return (
    <TileFrame>
      <TileHeader
        icon={<Boxes className="h-3.5 w-3.5 text-accent" />}
        tintBg="bg-accent/10"
        label="Torrents"
        right={
          <span className="text-[10px] font-mono text-text-muted tabular-nums">{total}</span>
        }
      />
      <div className="mt-auto grid grid-cols-2 gap-x-3 gap-y-0.5">
        {cells.map((c) => (
          <Cell key={c.label} label={c.label} value={c.value} tone={c.tone} />
        ))}
      </div>
    </TileFrame>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <span className={clsx('text-sm font-semibold font-mono tabular-nums', tone)}>{value}</span>
      <span className="text-[9px] uppercase tracking-wide text-text-subtle truncate">{label}</span>
    </div>
  );
}
