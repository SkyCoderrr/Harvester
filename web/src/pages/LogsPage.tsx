import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { clsx } from 'clsx';
import {
  ChevronDown,
  ChevronsDown,
  Download,
  FileText,
  Pause,
  Play,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { openTicketedEventSource } from '../api/sse';
import type { LogLevel, LogRow } from '@shared/types';

const LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
/** Ring-buffer size. Anything older drops off as new entries arrive. */
const MAX_ROWS = 5000;
/** Approximate row height in px — used by the virtualizer. */
const ROW_HEIGHT = 28;

export default function LogsPage(): JSX.Element {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [tailing, setTailing] = useState(true);
  const [streamOk, setStreamOk] = useState(false);
  const [levels, setLevels] = useState<Set<LogLevel>>(new Set(LEVELS));
  const [component, setComponent] = useState<string>('');
  const [q, setQ] = useState('');
  const [fileOpsOnly, setFileOpsOnly] = useState(false);
  const [hoveredHash, setHoveredHash] = useState<string | null>(null);
  const [selected, setSelected] = useState<LogRow | null>(null);

  const parentRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);

  // --- initial history ---------------------------------------------------
  useEffect(() => {
    let mounted = true;
    api
      .get<{ items: LogRow[]; next_cursor: number | null }>(`/api/logs?limit=500`)
      .then((r) => {
        if (!mounted) return;
        // Server returns newest-first; we want oldest-first in the scrollback.
        setRows(r.items.slice().reverse());
      })
      .catch(() => {
        /* handled by 401 interceptor */
      });
    return () => {
      mounted = false;
    };
  }, []);

  // --- SSE live-tail -----------------------------------------------------
  useEffect(() => {
    if (!tailing) {
      setStreamOk(false);
      return;
    }
    let es: EventSource | null = null;
    let cancelled = false;
    void openTicketedEventSource('/api/logs/stream', 'logs')
      .then((source) => {
        if (cancelled) {
          source.close();
          return;
        }
        es = source;
        source.addEventListener('log', (e) => {
          try {
            const row = JSON.parse((e as MessageEvent).data) as LogRow;
            setRows((prev) => {
              const next = prev.concat(row);
              if (next.length > MAX_ROWS) next.splice(0, next.length - MAX_ROWS);
              return next;
            });
          } catch {
            /* ignore bad frames */
          }
        });
        source.onopen = (): void => setStreamOk(true);
        source.onerror = (): void => setStreamOk(false);
      })
      .catch(() => {
        setStreamOk(false);
      });
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [tailing]);

  // --- filtering ---------------------------------------------------------
  const components = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.component) set.add(r.component);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fileOpsOnly && !isFileOp(r)) return false;
      if (!levels.has(r.level)) return false;
      if (component && r.component !== component) return false;
      if (needle) {
        const hay = (r.message + ' ' + JSON.stringify(r.meta)).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, levels, component, q, fileOpsOnly]);

  // --- virtualizer -------------------------------------------------------
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // --- auto-scroll + scroll detection ------------------------------------
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onScroll = (): void => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      pinnedToBottomRef.current = atBottom;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!tailing || !pinnedToBottomRef.current) return;
    virtualizer.scrollToIndex(filtered.length - 1, { align: 'end', behavior: 'auto' });
  }, [filtered.length, tailing, virtualizer]);

  const jumpToLive = useCallback(() => {
    pinnedToBottomRef.current = true;
    virtualizer.scrollToIndex(filtered.length - 1, { align: 'end', behavior: 'smooth' });
  }, [filtered.length, virtualizer]);

  // --- actions -----------------------------------------------------------
  const toggleLevel = useCallback((lvl: LogLevel) => {
    setLevels((s) => {
      const next = new Set(s);
      if (next.has(lvl)) next.delete(lvl);
      else next.add(lvl);
      // Don't let the user deselect everything — show a clear signal instead.
      if (next.size === 0) return s;
      return next;
    });
  }, []);

  const exportLogs = useCallback(() => {
    const body = filtered
      .map((r) => JSON.stringify({ ts: r.ts, level: r.level, component: r.component, message: r.message, meta: r.meta }))
      .join('\n');
    const blob = new Blob([body], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `harvester-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.jsonl`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [filtered]);

  const clearBuffer = useCallback(() => {
    setRows([]);
    setSelected(null);
  }, []);

  const atBottom = pinnedToBottomRef.current;

  return (
    <div className="p-6 flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <button
          onClick={() => setFileOpsOnly((v) => !v)}
          title="Show only file-ops: grab success, grab failed, lifecycle remove"
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs cursor-pointer border',
            fileOpsOnly
              ? 'bg-accent/15 text-accent border-accent/40'
              : 'bg-bg-sub text-text-muted border-zinc-800 hover:bg-bg-elev',
          )}
        >
          <FileText className="h-3.5 w-3.5" />
          File ops
        </button>

        <div className="inline-flex bg-bg-sub border border-zinc-800 rounded overflow-hidden">
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => toggleLevel(l)}
              className={clsx(
                'px-3 py-1.5 text-xs font-mono border-l border-zinc-800 first:border-l-0 cursor-pointer',
                levels.has(l)
                  ? `${levelText(l)} bg-bg-elev`
                  : 'text-text-subtle hover:text-text-muted',
              )}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <select
            value={component}
            onChange={(e) => setComponent(e.target.value)}
            className="px-2 py-1.5 bg-bg-sub border border-zinc-800 rounded text-xs focus:border-accent outline-none min-w-[140px] cursor-pointer"
          >
            <option value="">all components</option>
            {components.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-[400px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="search messages and meta"
            className="w-full pl-7 pr-2 py-1.5 bg-bg-sub border border-zinc-800 rounded text-xs focus:border-accent outline-none"
          />
        </div>

        <button
          onClick={() => setTailing((t) => !t)}
          title={tailing ? 'Pause live tail' : 'Resume live tail'}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs cursor-pointer border',
            tailing
              ? 'bg-accent-success/10 text-accent-success border-accent-success/40 hover:bg-accent-success/20'
              : 'bg-bg-sub text-text-muted border-zinc-800 hover:bg-bg-elev',
          )}
        >
          {tailing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {tailing ? 'Tailing' : 'Paused'}
          <span
            className={clsx(
              'h-1.5 w-1.5 rounded-full ml-1',
              tailing && streamOk ? 'bg-accent-success animate-pulse' : 'bg-text-subtle',
            )}
            title={streamOk ? 'Connected' : 'Disconnected'}
          />
        </button>

        <button
          onClick={exportLogs}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-sub border border-zinc-800 rounded text-xs hover:bg-bg-elev cursor-pointer disabled:opacity-50"
          title="Export filtered view as .jsonl"
        >
          <Download className="h-3.5 w-3.5" /> Export
        </button>

        <button
          onClick={clearBuffer}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-sub border border-zinc-800 rounded text-xs text-text-muted hover:text-accent-danger hover:border-accent-danger/40 cursor-pointer"
          title="Clear the in-memory buffer (doesn't touch the server)"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        <div className="text-[10px] text-text-muted ml-auto">
          {filtered.length.toLocaleString()} / {rows.length.toLocaleString()} rows
        </div>
      </div>

      {/* List */}
      <div className="relative flex-1 min-h-0 border border-zinc-800 rounded-lg bg-bg-sub overflow-hidden">
        <div ref={parentRef} className="h-full overflow-auto">
          {filtered.length === 0 ? (
            <EmptyState tailing={tailing} hasRows={rows.length > 0} />
          ) : (
            <div
              style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}
            >
              {virtualizer.getVirtualItems().map((vr) => {
                const r = filtered[vr.index]!;
                const isSelected = selected?.id === r.id;
                const fop = fileOpKind(r);
                const hash = extractInfohash(r);
                const isLinked =
                  hoveredHash != null && hash != null && hash === hoveredHash;
                return (
                  <div
                    key={r.id}
                    data-index={vr.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: ROW_HEIGHT,
                      transform: `translateY(${vr.start}px)`,
                    }}
                    onMouseEnter={() => hash && setHoveredHash(hash)}
                    onMouseLeave={() => setHoveredHash(null)}
                    onClick={() => setSelected(isSelected ? null : r)}
                    className={clsx(
                      'grid grid-cols-[96px_72px_140px_1fr] items-center gap-3 px-3 text-[11px] font-mono cursor-pointer border-b border-zinc-900 hover:bg-bg-elev/40',
                      isSelected && 'bg-accent/10',
                      isLinked && !isSelected && 'bg-accent-warn/10 ring-1 ring-accent-warn/40',
                    )}
                  >
                    <span className="text-text-subtle">{fmtTime(r.ts)}</span>
                    <span className="flex items-center gap-1.5">
                      {fop && <FileOpIcon kind={fop} />}
                      <span className={clsx('font-semibold', levelText(r.level))}>{r.level}</span>
                    </span>
                    <span className="text-text-muted truncate" title={r.component}>
                      {r.component}
                    </span>
                    <span className="truncate" title={r.message}>
                      {r.message}
                      {fop && (
                        <span className="ml-2 text-text-subtle">
                          {String(r.meta?.['name'] ?? r.meta?.['infohash']?.toString().slice(0, 12) ?? '')}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Jump to live */}
        {filtered.length > 0 && !atBottom && (
          <button
            onClick={jumpToLive}
            className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent text-white text-xs shadow-lg cursor-pointer"
          >
            <ChevronsDown className="h-3.5 w-3.5" />
            Jump to live
          </button>
        )}
      </div>

      {/* Detail */}
      {selected && <DetailPanel row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function DetailPanel({ row, onClose }: { row: LogRow; onClose: () => void }): JSX.Element {
  return (
    <div className="mt-3 border border-zinc-800 rounded-lg bg-bg-sub overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 text-xs">
        <span className={clsx('font-semibold font-mono', levelText(row.level))}>{row.level}</span>
        <span className="text-text-muted font-mono">{row.component}</span>
        <span className="text-text-subtle">·</span>
        <span className="text-text-muted font-mono">{new Date(row.ts * 1000).toISOString()}</span>
        <button
          onClick={onClose}
          className="ml-auto h-6 w-6 flex items-center justify-center rounded hover:bg-bg-elev cursor-pointer"
          aria-label="Close detail"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div className="text-sm break-words">{row.message}</div>
        {Object.keys(row.meta).length > 0 && (
          <details open>
            <summary className="text-xs text-text-muted cursor-pointer mb-2 inline-flex items-center gap-1">
              <ChevronDown className="h-3 w-3" />
              meta
            </summary>
            <pre className="text-[11px] font-mono bg-bg-base rounded border border-zinc-800 p-3 overflow-auto max-h-64">
              {JSON.stringify(row.meta, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

function EmptyState({ tailing, hasRows }: { tailing: boolean; hasRows: boolean }): JSX.Element {
  return (
    <div className="h-full flex items-center justify-center text-text-muted text-sm p-8 text-center">
      {hasRows
        ? 'No rows match the current filters.'
        : tailing
          ? 'Waiting for log entries…'
          : 'No logs yet.'}
    </div>
  );
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

type FileOp = 'create' | 'delete' | 'create_failed';

/**
 * Classify a log row as a file operation based on the `op` meta field the backend
 * attaches to downloader/lifecycle entries. Falls back to the message text when `op`
 * is missing (older rows).
 */
function fileOpKind(r: LogRow): FileOp | null {
  const op = r.meta?.['op'];
  if (op === 'create' || op === 'delete' || op === 'create_failed') return op;
  if (r.component === 'downloader' && r.message === 'grab success') return 'create';
  if (r.component === 'downloader' && r.message === 'grab failed') return 'create_failed';
  if (r.component === 'lifecycle' && r.message === 'removed torrent') return 'delete';
  return null;
}

function isFileOp(r: LogRow): boolean {
  return fileOpKind(r) != null;
}

function extractInfohash(r: LogRow): string | null {
  const v = r.meta?.['infohash'] ?? r.meta?.['hash'];
  return typeof v === 'string' ? v : null;
}

function FileOpIcon({ kind }: { kind: FileOp }): JSX.Element {
  if (kind === 'create') {
    return <Download className="h-3 w-3 text-accent-success" aria-label="create" />;
  }
  if (kind === 'delete') {
    return <Trash2 className="h-3 w-3 text-accent-danger" aria-label="delete" />;
  }
  return <X className="h-3 w-3 text-accent-warn" aria-label="create failed" />;
}

function levelText(level: LogLevel): string {
  switch (level) {
    case 'ERROR':
      return 'text-accent-danger';
    case 'WARN':
      return 'text-accent-warn';
    case 'INFO':
      return 'text-accent-success';
    case 'DEBUG':
      return 'text-text-muted';
  }
}
