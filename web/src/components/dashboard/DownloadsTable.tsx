import { clsx } from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Pause,
  Play,
  Trash2,
} from 'lucide-react';
import { api } from '../../api/client';
import type { TorrentRow } from '@shared/types';
import { formatBytes, formatEta, formatRate } from '../../lib/format';
import { DiscountBadge } from '../ui/DiscountBadge';
import { IconBtn } from '../ui/IconBtn';
import { Card } from './shared';

// Extracted verbatim from v1 DashboardPage (FR-V2-29 page-split). No
// behavior change beyond the DiscountBadge / IconBtn now living in ui/.

export function DownloadsTable(): JSX.Element {
  const q = useQuery({
    queryKey: ['dashboard', 'torrents'],
    queryFn: () =>
      api.get<{ items: TorrentRow[]; next_cursor: number | null }>(
        '/api/torrents?limit=50',
      ),
    refetchInterval: 3_000,
    staleTime: 2_500,
    structuralSharing: true,
  });
  const qc = useQueryClient();

  async function doAction(
    infohash: string,
    action: 'pause' | 'resume' | 'remove_with_data',
  ): Promise<void> {
    const item = q.data?.items.find((i) => i.infohash === infohash);
    if (!item || !item.mteam_id) {
      await qc.invalidateQueries({ queryKey: ['dashboard', 'torrents'] });
      return;
    }
    await api.post(`/api/torrents/${item.mteam_id}/action`, { action });
    await qc.invalidateQueries({ queryKey: ['dashboard', 'torrents'] });
  }

  const rows = q.data?.items ?? [];

  return (
    <Card title="Downloads" pad={false}>
      {q.isLoading ? (
        <div className="p-6 text-text-muted text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-text-muted text-sm">
          No Harvester torrents yet. Matches from the next poll cycle will show up here — or
          add a rule-set under /rules.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg-elev/60 text-text-subtle text-[10px] uppercase tracking-wider">
              <tr>
                <th scope="col" className="text-left px-4 py-2.5 font-medium">
                  Name
                </th>
                <th scope="col" className="text-left px-3 py-2.5 font-medium w-36">
                  Status
                </th>
                <th scope="col" className="text-left px-3 py-2.5 font-medium w-48">
                  Progress
                </th>
                <th scope="col" className="text-right px-3 py-2.5 font-medium w-24">
                  Down
                </th>
                <th scope="col" className="text-right px-3 py-2.5 font-medium w-24">
                  Up
                </th>
                <th scope="col" className="text-right px-3 py-2.5 font-medium w-20">
                  ETA
                </th>
                <th scope="col" className="text-right px-3 py-2.5 font-medium w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <DownloadRow
                  key={t.infohash ?? t.mteam_id}
                  t={t}
                  onAction={(a) => {
                    if (t.infohash) void doAction(t.infohash, a);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function DownloadRow({
  t,
  onAction,
}: {
  t: TorrentRow;
  onAction: (a: 'pause' | 'resume' | 'remove_with_data') => void;
}): JSX.Element {
  const state = stateBadge(t.state);
  const isPaused = /^paused/i.test(t.state);
  return (
    <tr className="border-t border-zinc-800 hover:bg-bg-elev/30">
      <td className="px-4 py-2.5">
        <div className="truncate max-w-[380px]" title={t.name}>
          {t.name}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <DiscountBadge discount={t.discount} />
          {t.matched_rule && (
            <span className="text-[10px] text-text-subtle font-mono">· {t.matched_rule}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className={clsx('h-2 w-2 rounded-full', state.dot)} />
          <span className="text-xs">{state.label}</span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <ProgressBar pct={t.progress} />
        <div className="text-[10px] text-text-muted font-mono mt-0.5 tabular-nums">
          {(t.progress * 100).toFixed(1)}% · {formatBytes(t.size_bytes * t.progress)} /{' '}
          {formatBytes(t.size_bytes)}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
        {t.dlspeed > 0 ? (
          <span className="text-accent-success inline-flex items-center gap-0.5 justify-end">
            <ChevronDown className="h-3 w-3" />
            {formatRate(t.dlspeed)}
          </span>
        ) : (
          <span className="text-text-subtle">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
        {t.upspeed > 0 ? (
          <span className="text-accent inline-flex items-center gap-0.5 justify-end">
            <ChevronUp className="h-3 w-3" />
            {formatRate(t.upspeed)}
          </span>
        ) : (
          <span className="text-text-subtle">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs text-text-muted tabular-nums">
        {t.eta > 0 && t.eta < 8640000 ? (
          <span className="inline-flex items-center gap-0.5 justify-end">
            <Clock className="h-3 w-3" />
            {formatEta(t.eta)}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="inline-flex items-center gap-1">
          <IconBtn
            label={isPaused ? 'Resume' : 'Pause'}
            onClick={() => onAction(isPaused ? 'resume' : 'pause')}
          >
            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </IconBtn>
          <IconBtn
            label="Remove with data"
            tone="danger"
            onClick={() => {
              if (confirm('Remove torrent and delete files?')) onAction('remove_with_data');
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </td>
    </tr>
  );
}

function ProgressBar({ pct }: { pct: number }): JSX.Element {
  const clamped = Math.max(0, Math.min(1, pct));
  const color = clamped >= 1 ? '#22c55e' : '#3b82f6';
  return (
    <div className="h-1.5 w-full bg-bg-elev rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${clamped * 100}%`, background: color }}
      />
    </div>
  );
}

function stateBadge(state: string): { label: string; dot: string } {
  if (/^downloading/i.test(state)) return { label: 'downloading', dot: 'bg-accent' };
  if (/^(uploading|queuedUP)/i.test(state)) return { label: 'seeding', dot: 'bg-accent-success' };
  if (/^stalledDL/i.test(state)) return { label: 'stalled', dot: 'bg-accent-warn' };
  if (/^stalledUP/i.test(state)) return { label: 'seeding (stall)', dot: 'bg-lime-500' };
  if (/^paused/i.test(state)) return { label: 'paused', dot: 'bg-text-subtle' };
  if (/^metaDL/i.test(state)) return { label: 'fetching meta', dot: 'bg-purple-500' };
  if (/checking/i.test(state)) return { label: 'checking', dot: 'bg-purple-500' };
  if (/error/i.test(state)) return { label: 'error', dot: 'bg-accent-danger' };
  return { label: state, dot: 'bg-zinc-500' };
}
