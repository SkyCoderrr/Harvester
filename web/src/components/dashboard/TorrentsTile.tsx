import { clsx } from 'clsx';
import { Boxes } from 'lucide-react';
import type { DashboardSummary } from '@shared/types';
import { TileFrame, TileHeader } from './KpiTile';

// 4-bucket torrent breakdown. Spans 2 columns in the 8-col KPI strip so
// each sub-cell is wide enough to fit "Seeding" without truncation. The
// other tiles are 1-wide; the asymmetric footprint is intentional — the
// torrents tile is the most information-dense cell in the row.

export function TorrentsTile({ data }: { data: DashboardSummary | undefined }): JSX.Element {
  const cells = [
    { label: 'Active', value: data?.active_count ?? 0, tone: 'text-accent-success' },
    { label: 'Seeding', value: data?.seeding_count ?? 0, tone: 'text-accent' },
    { label: 'Stalled', value: data?.stalled_count ?? 0, tone: 'text-accent-warn' },
    { label: 'Error', value: data?.error_count ?? 0, tone: 'text-accent-danger' },
  ];
  const total = data?.harvester_torrent_count ?? cells.reduce((a, b) => a + b.value, 0);

  return (
    <div className="col-span-2">
      <TileFrame>
        <TileHeader
          icon={<Boxes className="h-3.5 w-3.5 text-accent" />}
          tintBg="bg-accent/10"
          label="Torrents"
          right={
            <span className="text-[10px] font-mono text-text-muted tabular-nums">
              {total} total
            </span>
          }
        />
        <div className="mt-auto grid grid-cols-4 gap-3">
          {cells.map((c) => (
            <Cell key={c.label} label={c.label} value={c.value} tone={c.tone} />
          ))}
        </div>
      </TileFrame>
    </div>
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
    <div className="min-w-0">
      <div className={clsx('text-xl font-semibold font-mono tabular-nums leading-tight', tone)}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-text-subtle mt-0.5">{label}</div>
    </div>
  );
}
