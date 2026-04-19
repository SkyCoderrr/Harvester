import { clsx } from 'clsx';
import { List } from 'lucide-react';
import type { DashboardSummary } from '@shared/types';

// Compact four-bucket breakdown of current Harvester torrents. Replaces the
// v2.0-Phase2 pair of "Active" + "Stalled / error" tiles which were hard to
// tell apart and miscategorized stalledUP (seeding-with-no-peers) as
// stalled. Backend gives us the four counts directly now.

export function TorrentsTile({ data }: { data: DashboardSummary | undefined }): JSX.Element {
  const buckets = [
    { label: 'Active', value: data?.active_count ?? 0, tone: 'text-accent-success' },
    { label: 'Seeding', value: data?.seeding_count ?? 0, tone: 'text-accent' },
    { label: 'Stalled', value: data?.stalled_count ?? 0, tone: 'text-accent-warn' },
    { label: 'Error', value: data?.error_count ?? 0, tone: 'text-accent-danger' },
  ];
  const total = data?.harvester_torrent_count ?? buckets.reduce((a, b) => a + b.value, 0);

  return (
    <div className="bg-bg-sub border border-zinc-800 rounded-lg px-4 py-3 flex items-start gap-3 col-span-2">
      <List className="h-5 w-5 mt-0.5 text-text-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] uppercase tracking-wide text-text-subtle">Torrents</div>
          <div className="text-[10px] text-text-muted font-mono">{total} total</div>
        </div>
        <div className="mt-1 grid grid-cols-4 gap-2">
          {buckets.map((b) => (
            <div key={b.label} className="min-w-0">
              <div
                className={clsx('text-lg font-semibold font-mono tabular-nums truncate', b.tone)}
              >
                {b.value}
              </div>
              <div className="text-[9px] uppercase tracking-wide text-text-subtle">
                {b.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
