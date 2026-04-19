import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ChevronDown, ChevronUp, Clock, Pause, Play, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import type { TorrentRow } from '@shared/types';
import { formatBytes, formatEta, formatRate } from '../lib/format';
import { toast } from '../store/toast';

const DISCOUNT_COLOR: Record<string, string> = {
  FREE: '#22c55e',
  _2X_FREE: '#a855f7',
  _2X: '#3b82f6',
  PERCENT_50: '#eab308',
  PERCENT_70: '#f97316',
  PERCENT_30: '#f59e0b',
  _2X_PERCENT_50: '#ec4899',
  NORMAL: '#71717a',
};

export default function TorrentsPage(): JSX.Element {
  const q = useQuery({
    queryKey: ['torrents'],
    queryFn: () =>
      api.get<{ items: TorrentRow[]; next_cursor: number | null }>('/api/torrents?limit=200'),
    refetchInterval: 5_000,
  });
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openHash, setOpenHash] = useState<string | null>(null);

  const rows = q.data?.items ?? [];
  const selectedRows = useMemo(
    () => rows.filter((t) => t.infohash && selected.has(t.infohash)),
    [rows, selected],
  );

  const bulk = useMutation({
    mutationFn: async (action: 'pause' | 'resume' | 'remove_with_data') => {
      const infohashes = selectedRows.map((t) => t.infohash).filter(Boolean) as string[];
      return api.post<{ results: Array<{ infohash: string; ok: boolean; error?: string }> }>(
        '/api/torrents/bulk-action',
        { infohashes, action },
      );
    },
    onSuccess: (r, action) => {
      const ok = r.results.filter((x) => x.ok).length;
      const bad = r.results.length - ok;
      toast.success(`${action} · ${ok} succeeded`, bad ? `${bad} failed` : undefined, 'bulk');
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: ['torrents'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error('Bulk action failed', (err as Error).message, 'bulk'),
  });

  if (q.isLoading) return <div className="p-6 text-text-muted">Loading…</div>;
  if (rows.length === 0) {
    return (
      <div className="p-6 text-text-muted">
        No Harvester torrents yet. Matches from the next poll cycle will show up here.
      </div>
    );
  }

  function toggle(hash: string): void {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  }
  function toggleAll(): void {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.infohash).filter(Boolean) as string[]));
  }

  return (
    <div className="p-6">
      {selected.size > 0 && (
        <BulkToolbar
          count={selected.size}
          pending={bulk.isPending}
          onPause={() => bulk.mutate('pause')}
          onResume={() => bulk.mutate('resume')}
          onRemove={() => {
            if (confirm(`Remove ${selected.size} torrent(s) and delete files?`))
              bulk.mutate('remove_with_data');
          }}
          onCancel={() => setSelected(new Set())}
        />
      )}

      <div className="bg-bg-sub border border-zinc-800 rounded-lg overflow-hidden mt-3">
        <table className="w-full text-sm">
          <thead className="bg-bg-elev/60 text-text-subtle text-[10px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2.5 w-10">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={selected.size === rows.length && rows.length > 0}
                  onChange={toggleAll}
                  className="accent-accent cursor-pointer"
                />
              </th>
              <th className="text-left px-3 py-2.5 font-medium">Name</th>
              <th className="text-left px-3 py-2.5 font-medium w-36">Status</th>
              <th className="text-left px-3 py-2.5 font-medium w-48">Progress</th>
              <th className="text-right px-3 py-2.5 font-medium w-24">Down</th>
              <th className="text-right px-3 py-2.5 font-medium w-24">Up</th>
              <th className="text-right px-3 py-2.5 font-medium w-20">ETA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <Row
                key={t.infohash ?? t.mteam_id}
                t={t}
                selected={t.infohash ? selected.has(t.infohash) : false}
                onToggle={() => t.infohash && toggle(t.infohash)}
                onOpen={() => t.infohash && setOpenHash(t.infohash)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <DetailDrawer
        open={openHash !== null}
        torrent={rows.find((r) => r.infohash === openHash) ?? null}
        onClose={() => setOpenHash(null)}
      />
    </div>
  );
}

function BulkToolbar({
  count,
  pending,
  onPause,
  onResume,
  onRemove,
  onCancel,
}: {
  count: number;
  pending: boolean;
  onPause: () => void;
  onResume: () => void;
  onRemove: () => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-bg-elev border border-zinc-800 rounded-lg">
      <span className="text-sm">{count} selected</span>
      <div className="flex items-center gap-1 ml-auto">
        <button
          onClick={onPause}
          disabled={pending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded hover:bg-bg-sub cursor-pointer disabled:opacity-50"
        >
          <Pause className="h-3.5 w-3.5" /> Pause
        </button>
        <button
          onClick={onResume}
          disabled={pending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded hover:bg-bg-sub cursor-pointer disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" /> Resume
        </button>
        <button
          onClick={onRemove}
          disabled={pending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded text-accent-danger hover:bg-accent-danger/10 cursor-pointer disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove with data
        </button>
        <button
          onClick={onCancel}
          className="h-8 w-8 flex items-center justify-center rounded hover:bg-bg-sub text-text-muted cursor-pointer"
          aria-label="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Row({
  t,
  selected,
  onToggle,
  onOpen,
}: {
  t: TorrentRow;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}): JSX.Element {
  const state = stateBadge(t.state);
  return (
    <tr
      className={clsx(
        'border-t border-zinc-800 hover:bg-bg-elev/30 cursor-pointer',
        selected && 'bg-accent/5',
      )}
      onClick={onOpen}
    >
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          aria-label={`Select ${t.name}`}
          checked={selected}
          onChange={onToggle}
          className="accent-accent cursor-pointer"
        />
      </td>
      <td className="px-3 py-2.5">
        <div className="truncate max-w-[380px]" title={t.name}>
          {t.name}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <DiscountTag discount={t.discount} />
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
        <div className="text-[10px] text-text-muted font-mono mt-0.5">
          {(t.progress * 100).toFixed(1)}% · {formatBytes(t.size_bytes * t.progress)} /{' '}
          {formatBytes(t.size_bytes)}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs">
        {t.dlspeed > 0 ? (
          <span className="text-accent-success inline-flex items-center gap-0.5 justify-end">
            <ChevronDown className="h-3 w-3" />
            {formatRate(t.dlspeed)}
          </span>
        ) : (
          <span className="text-text-subtle">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs">
        {t.upspeed > 0 ? (
          <span className="text-accent inline-flex items-center gap-0.5 justify-end">
            <ChevronUp className="h-3 w-3" />
            {formatRate(t.upspeed)}
          </span>
        ) : (
          <span className="text-text-subtle">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs text-text-muted">
        {t.eta > 0 && t.eta < 8640000 ? (
          <span className="inline-flex items-center gap-0.5 justify-end">
            <Clock className="h-3 w-3" />
            {formatEta(t.eta)}
          </span>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}

function DetailDrawer({
  open,
  torrent,
  onClose,
}: {
  open: boolean;
  torrent: TorrentRow | null;
  onClose: () => void;
}): JSX.Element | null {
  const q = useQuery({
    queryKey: ['torrents', torrent?.mteam_id],
    queryFn: () =>
      api.get<{
        torrent: unknown;
        transitions: Array<Record<string, unknown>>;
        mteam_payload: unknown;
      }>(`/api/torrents/${torrent?.mteam_id}`),
    enabled: open && !!torrent?.mteam_id,
  });

  if (!open || !torrent) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <aside
        className="relative w-[560px] max-w-full bg-bg-sub border-l border-zinc-800 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-bg-sub z-10 px-5 py-3 border-b border-zinc-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium break-words">{torrent.name}</div>
            <div className="flex items-center gap-2 mt-1">
              <DiscountTag discount={torrent.discount} />
              <span className="text-xs text-text-muted font-mono">{torrent.state}</span>
              {torrent.matched_rule && (
                <span className="text-xs text-text-muted">· {torrent.matched_rule}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-bg-elev text-text-muted cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <section className="p-5 space-y-5 text-sm">
          <KvBlock>
            <Kv k="Infohash" v={<code className="text-[10px] font-mono">{torrent.infohash}</code>} />
            <Kv k="Size" v={formatBytes(torrent.size_bytes)} />
            <Kv k="Progress" v={(torrent.progress * 100).toFixed(2) + '%'} />
            <Kv k="Ratio" v={torrent.ratio?.toFixed(3) ?? '—'} />
            <Kv k="Uploaded" v={formatBytes(torrent.uploaded_bytes ?? 0)} />
            <Kv k="Downloaded" v={formatBytes(torrent.downloaded_bytes ?? 0)} />
            <Kv k="Save path" v={<code className="text-[10px] font-mono">{torrent.save_path ?? '—'}</code>} />
            <Kv k="Tags" v={torrent.tags.join(', ')} />
          </KvBlock>

          <div>
            <div className="text-xs uppercase tracking-wider text-text-muted mb-2">
              State transitions
            </div>
            {q.isLoading ? (
              <div className="text-xs text-text-muted">Loading…</div>
            ) : q.data?.transitions?.length ? (
              <div className="space-y-1.5">
                {q.data.transitions.map((row, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 text-xs font-mono border border-zinc-800 rounded px-2.5 py-1.5"
                  >
                    <span className="text-text-subtle">
                      {new Date(Number(row['seen_at']) * 1000).toLocaleString()}
                    </span>
                    <span className="text-text-primary">{String(row['decision'])}</span>
                    {row['rejection_reason'] ? (
                      <span className="text-accent-warn">
                        · {String(row['rejection_reason'])}
                      </span>
                    ) : row['matched_rule'] ? (
                      <span className="text-accent-success">· {String(row['matched_rule'])}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-text-muted">
                No transitions recorded (was this grab predating the DB?)
              </div>
            )}
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-text-muted mb-2">
              M-Team payload
            </div>
            {q.isLoading ? (
              <div className="text-xs text-text-muted">Loading…</div>
            ) : q.data?.mteam_payload ? (
              <pre className="text-[10px] font-mono bg-bg-base border border-zinc-800 rounded p-3 overflow-auto max-h-96">
                {JSON.stringify(q.data.mteam_payload, null, 2)}
              </pre>
            ) : (
              <div className="text-xs text-text-muted">
                No stored payload for this torrent.
              </div>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-baseline gap-3 py-1 border-b border-zinc-800 last:border-0">
      <span className="text-xs text-text-muted w-28 flex-shrink-0">{k}</span>
      <span className="text-sm break-all min-w-0">{v}</span>
    </div>
  );
}

function KvBlock({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="bg-bg-base rounded border border-zinc-800 px-3 py-2">{children}</div>;
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

function DiscountTag({ discount }: { discount: string }): JSX.Element {
  const color = DISCOUNT_COLOR[discount] ?? '#71717a';
  return (
    <span
      className="text-[10px] font-mono px-1.5 py-0.5 rounded border font-medium"
      style={{ borderColor: color + '44', background: color + '1a', color }}
    >
      {discount.replace(/^_/, '')}
    </span>
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
