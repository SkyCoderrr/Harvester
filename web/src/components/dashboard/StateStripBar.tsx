import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

// FR-V2-22 / HANDOFF §B.4.6: compact horizontal distribution bar of torrent
// states (seeding / downloading / queued / stalled / paused / error).

type Bucket =
  | 'seeding'
  | 'downloading'
  | 'stalled_dl'
  | 'stalled_up'
  | 'paused'
  | 'checking'
  | 'error'
  | 'other';

const COLORS: Record<Bucket, string> = {
  seeding: '#22c55e',
  downloading: '#3b82f6',
  stalled_dl: '#eab308',
  stalled_up: '#84cc16',
  paused: '#a1a1aa',
  checking: '#a855f7',
  error: '#ef4444',
  other: '#52525b',
};

const LABELS: Record<Bucket, string> = {
  seeding: 'Seeding',
  downloading: 'Downloading',
  stalled_dl: 'Stalled (DL)',
  stalled_up: 'Stalled (UP)',
  paused: 'Paused',
  checking: 'Checking',
  error: 'Error',
  other: 'Other',
};

interface Item {
  name: Bucket;
  count: number;
}

export function StateStripBar(): JSX.Element {
  const q = useQuery({
    queryKey: ['stats', 'torrent-states'],
    queryFn: () => api.get<{ items: Item[]; total: number }>(`/api/stats/torrent-states`),
    refetchInterval: 10_000,
    staleTime: 8_000,
    structuralSharing: true,
  });
  const [hovered, setHovered] = useState<Bucket | null>(null);

  const { items, total } = useMemo(
    () => ({ items: q.data?.items ?? [], total: q.data?.total ?? 0 }),
    [q.data],
  );

  if (total === 0) {
    return (
      <div className="px-4 py-2 bg-bg-sub border border-zinc-800 rounded-lg text-xs text-text-muted">
        No Harvester torrents yet — state distribution will appear once the poller grabs the first match.
      </div>
    );
  }

  const hoveredItem = hovered ? items.find((i) => i.name === hovered) : null;

  return (
    <div className="bg-bg-sub border border-zinc-800 rounded-lg px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-text-subtle">
        <span>Torrent states</span>
        <span className="text-text-muted font-mono">
          {hoveredItem
            ? `${LABELS[hoveredItem.name]}: ${hoveredItem.count} · ${Math.round(
                (hoveredItem.count / total) * 100,
              )}%`
            : `${total} total`}
        </span>
      </div>
      <div
        className="flex h-5 w-full rounded overflow-hidden border border-zinc-800"
        role="img"
        aria-label="Torrent state distribution"
      >
        {items.map((i) => (
          <div
            key={i.name}
            onMouseEnter={() => setHovered(i.name)}
            onMouseLeave={() => setHovered(null)}
            title={`${LABELS[i.name] ?? i.name}: ${i.count}`}
            className="h-full"
            style={{
              width: `${(i.count / total) * 100}%`,
              background: COLORS[i.name] ?? '#52525b',
            }}
          />
        ))}
      </div>
    </div>
  );
}
