import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  ChevronDown,
  ChevronUp,
  Clock,
  HardDrive,
  Pause,
  Play,
  TrendingUp,
  Trash2,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client';
import type { DashboardSummary, TorrentRow } from '@shared/types';
import { formatBytes, formatEta, formatRate } from '../lib/format';

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

export default function DashboardPage(): JSX.Element {
  const summaryQ = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api.get<DashboardSummary>('/api/dashboard/summary'),
    refetchInterval: 10_000,
  });

  return (
    <div className="p-6 space-y-4">
      <KpiStrip data={summaryQ.data} />

      <div className="grid grid-cols-2 gap-4">
        <Card title="Ratio & bonus — 24h">
          <RatioChart />
        </Card>
        <SpeedCard />
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <Card title="Grabs per day — by discount (14d)">
          <GrabsChart />
        </Card>
        <Card title="Account tier">
          <TierCard data={summaryQ.data} />
        </Card>
      </div>

      <Card title="Downloads" pad={false}>
        <DownloadsTable />
      </Card>
    </div>
  );
}

// ---------- KPI strip ----------

function KpiStrip({ data }: { data: DashboardSummary | undefined }): JSX.Element {
  return (
    <div className="grid grid-cols-6 gap-3">
      <KpiTile
        label="Ratio"
        icon={TrendingUp}
        value={data?.ratio?.toFixed(3) ?? '—'}
        delta={data?.ratio_delta_1h ?? null}
        deltaFormatter={(d) => d.toFixed(3)}
        deltaSuffix="· 1h"
      />
      <KpiTile
        label="Bonus points"
        icon={Award}
        value={data?.bonus_points?.toLocaleString() ?? '—'}
        delta={data?.bonus_delta_1h ?? null}
        deltaFormatter={(d) => Math.round(d).toLocaleString()}
        deltaSuffix="· 1h"
      />
      <KpiTile
        label="Grabs (24h)"
        icon={Activity}
        value={String(data?.grabs_24h ?? '—')}
        delta={data?.grabs_delta_24h ?? null}
        deltaFormatter={(d) => String(Math.round(d))}
        deltaSuffix="vs prev 24h"
      />
      <KpiTile
        label="Active"
        icon={Activity}
        value={String(data?.active_count ?? 0)}
        tone="text-accent-success"
        hint={
          data && (data.stalled_count > 0 || data.error_count > 0)
            ? `${data.stalled_count} stalled · ${data.error_count} error`
            : 'all moving'
        }
      />
      <KpiTile
        label="Stalled / error"
        icon={AlertTriangle}
        value={String((data?.stalled_count ?? 0) + (data?.error_count ?? 0))}
        tone={
          (data?.stalled_count ?? 0) + (data?.error_count ?? 0) > 0
            ? 'text-accent-warn'
            : 'text-text-muted'
        }
        hint={
          data
            ? `${data.stalled_count} stalled · ${data.error_count} error`
            : undefined
        }
      />
      <DiskTile data={data} />
    </div>
  );
}

interface KpiTileProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  tone?: string;
  hint?: string;
  delta?: number | null;
  deltaFormatter?: (v: number) => string;
  deltaSuffix?: string;
}

function KpiTile({
  label,
  icon: Icon,
  value,
  tone,
  hint,
  delta,
  deltaFormatter,
  deltaSuffix,
}: KpiTileProps): JSX.Element {
  return (
    <div className="bg-bg-sub border border-zinc-800 rounded-lg px-4 py-3 flex items-start gap-3">
      <Icon className={clsx('h-5 w-5 mt-0.5', tone ?? 'text-text-muted')} />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-text-subtle">{label}</div>
        <div className="text-lg font-semibold truncate font-mono">{value}</div>
        {delta != null && deltaFormatter && (
          <DeltaPill delta={delta} formatter={deltaFormatter} suffix={deltaSuffix} />
        )}
        {hint && !delta && <div className="text-[10px] text-text-muted truncate mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

function DeltaPill({
  delta,
  formatter,
  suffix,
}: {
  delta: number;
  formatter: (v: number) => string;
  suffix?: string;
}): JSX.Element {
  if (delta === 0) {
    return (
      <div className="text-[10px] text-text-muted font-mono mt-0.5">
        flat{suffix ? ` ${suffix}` : ''}
      </div>
    );
  }
  const up = delta > 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  const tone = up ? 'text-accent-success' : 'text-accent-danger';
  return (
    <div className={clsx('inline-flex items-center gap-0.5 text-[10px] font-mono mt-0.5', tone)}>
      <Arrow className="h-3 w-3" />
      {up ? '+' : ''}
      {formatter(delta)}
      {suffix && <span className="text-text-muted ml-1">{suffix}</span>}
    </div>
  );
}

function DiskTile({ data }: { data: DashboardSummary | undefined }): JSX.Element {
  const usedBytes = data?.harvester_used_bytes ?? 0;
  const freeGib = data?.disk_free_gib ?? 0;
  const usedGib = usedBytes / 2 ** 30;
  const totalGib = usedGib + freeGib;
  const pctUsed = totalGib > 0 ? (usedGib / totalGib) * 100 : 0;
  const tone =
    freeGib < 10 ? 'text-accent-danger' : freeGib < 50 ? 'text-accent-warn' : 'text-accent-success';
  return (
    <div className="bg-bg-sub border border-zinc-800 rounded-lg px-4 py-3 flex items-start gap-3">
      <HardDrive className={clsx('h-5 w-5 mt-0.5', tone)} />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-text-subtle">Disk (Harvester)</div>
        <div className="text-sm font-semibold font-mono">
          {usedGib.toFixed(1)}{' '}
          <span className="text-text-muted font-normal">used</span>
          <span className="text-text-subtle mx-1">/</span>
          <span className={tone}>{freeGib.toFixed(1)}</span>{' '}
          <span className="text-text-muted font-normal">free</span>
        </div>
        <div className="mt-1 h-1 w-full bg-bg-elev rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all',
              freeGib < 10
                ? 'bg-accent-danger'
                : freeGib < 50
                  ? 'bg-accent-warn'
                  : 'bg-accent',
            )}
            style={{ width: `${Math.min(100, pctUsed)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- Card wrapper ----------

function Card({
  title,
  children,
  pad = true,
}: {
  title: string;
  children: React.ReactNode;
  pad?: boolean;
}): JSX.Element {
  return (
    <section className="bg-bg-sub border border-zinc-800 rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-zinc-800 text-xs uppercase tracking-wider text-text-muted font-medium">
        {title}
      </header>
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

// ---------- Ratio trend ----------

interface ProfileSnap {
  ts: number;
  ratio: number;
  bonus_points: number | null;
  uploaded_bytes: number;
  downloaded_bytes: number;
}

function RatioChart(): JSX.Element {
  const q = useQuery({
    queryKey: ['stats', 'profile-snapshots', 24],
    queryFn: () => api.get<{ items: ProfileSnap[] }>('/api/stats/profile-snapshots?hours=24'),
    refetchInterval: 60_000,
  });

  if (q.isLoading) return <ChartSkeleton />;
  const items = q.data?.items ?? [];
  if (items.length === 0) {
    return <ChartEmpty text="No profile snapshots yet — the probe runs every 15 minutes." />;
  }

  const data = items.map((i) => ({
    t: new Date(i.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    ratio: Number(i.ratio.toFixed(3)),
    bonus: i.bonus_points ?? 0,
  }));

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradRatio" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradBonus" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="t"
            tick={{ fontSize: 10, fill: '#a1a1aa' }}
            axisLine={{ stroke: '#27272a' }}
            tickLine={false}
          />
          <YAxis
            yAxisId="ratio"
            tick={{ fontSize: 10, fill: '#a1a1aa' }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <YAxis
            yAxisId="bonus"
            orientation="right"
            tick={{ fontSize: 10, fill: '#a1a1aa' }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <Tooltip content={<DarkTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} />
          <Area
            yAxisId="ratio"
            type="monotone"
            dataKey="ratio"
            name="Ratio"
            stroke="#22c55e"
            fill="url(#gradRatio)"
            strokeWidth={2}
          />
          <Area
            yAxisId="bonus"
            type="monotone"
            dataKey="bonus"
            name="Bonus"
            stroke="#3b82f6"
            fill="url(#gradBonus)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- Grabs by day ----------

interface GrabDay {
  day: string;
  discount: string;
  c: number;
}

function GrabsChart(): JSX.Element {
  const q = useQuery({
    queryKey: ['stats', 'grabs-by-day', 14],
    queryFn: () => api.get<{ items: GrabDay[] }>('/api/stats/grabs-by-day?days=14'),
    refetchInterval: 60_000,
  });

  if (q.isLoading) return <ChartSkeleton />;
  const items = q.data?.items ?? [];
  if (items.length === 0) {
    return <ChartEmpty text="No grabs yet — the poller will populate this as rules match." />;
  }

  // Pivot: one row per day, with each discount as a key.
  const byDay = new Map<string, Record<string, number | string>>();
  for (const r of items) {
    const day = r.day.slice(5); // MM-DD
    if (!byDay.has(day)) byDay.set(day, { day });
    byDay.get(day)![r.discount] = r.c;
  }
  const discounts = Array.from(new Set(items.map((i) => i.discount)));
  const data = Array.from(byDay.values());

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="day"
            tick={{ fontSize: 10, fill: '#a1a1aa' }}
            axisLine={{ stroke: '#27272a' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#a1a1aa' }}
            axisLine={false}
            tickLine={false}
            width={30}
            allowDecimals={false}
          />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} />
          {discounts.map((d) => (
            <Bar
              key={d}
              dataKey={d}
              stackId="a"
              fill={DISCOUNT_COLOR[d] ?? '#71717a'}
              radius={[4, 4, 0, 0]}
              name={d.replace(/^_/, '')}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- Download/upload speed card ----------

interface TransferSnap {
  ts: number;
  dlspeed: number;
  upspeed: number;
}

function SpeedCard(): JSX.Element {
  const q = useQuery({
    queryKey: ['stats', 'transfer-snapshots', 60],
    queryFn: () => api.get<{ items: TransferSnap[] }>('/api/stats/transfer-snapshots?minutes=60'),
    refetchInterval: 10_000,
  });
  const [scale, setScale] = useState<'linear' | 'log'>('linear');

  const items = q.data?.items ?? [];
  const latest = items[items.length - 1];
  const maxDown = items.reduce((m, s) => Math.max(m, s.dlspeed), 0);
  const maxUp = items.reduce((m, s) => Math.max(m, s.upspeed), 0);

  return (
    <section className="bg-bg-sub border border-zinc-800 rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <span className="text-xs uppercase tracking-wider text-text-muted font-medium">
            Speed — 60m
          </span>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 font-mono">
              <ChevronDown className="h-3 w-3 text-accent" />
              <span className="text-accent font-semibold">
                {formatRate(latest?.dlspeed ?? 0)}
              </span>
              <span className="text-text-subtle">peak {formatRate(maxDown)}</span>
            </span>
            <span className="inline-flex items-center gap-1 font-mono">
              <ChevronUp className="h-3 w-3 text-accent-success" />
              <span className="text-accent-success font-semibold">
                {formatRate(latest?.upspeed ?? 0)}
              </span>
              <span className="text-text-subtle">peak {formatRate(maxUp)}</span>
            </span>
          </div>
        </div>
        <div className="inline-flex bg-bg-elev rounded border border-zinc-800 overflow-hidden text-[10px] font-mono">
          {(['linear', 'log'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScale(s)}
              className={clsx(
                'px-2 py-0.5 cursor-pointer',
                scale === s
                  ? 'bg-bg-sub text-text-primary'
                  : 'text-text-muted hover:text-text-primary',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </header>
      <div className="p-4">
        {q.isLoading ? (
          <ChartSkeleton />
        ) : items.length === 0 ? (
          <ChartEmpty text="Waiting for the first transfer sample (runs every 60s)." />
        ) : (
          <SpeedChart items={items} scale={scale} />
        )}
      </div>
    </section>
  );
}

function SpeedChart({
  items,
  scale,
}: {
  items: TransferSnap[];
  scale: 'linear' | 'log';
}): JSX.Element {
  // Two stacked mini-charts: download on top, upload on bottom. Each auto-scales to its
  // own Y-range so 90 Mbit/s and 80 KiB/s each get their full vertical space.
  const floor = scale === 'log' ? 1 : 0;
  const downData = items.map((i) => ({
    t: new Date(i.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    v: Math.max(floor, i.dlspeed),
  }));
  const upData = items.map((i) => ({
    t: new Date(i.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    v: Math.max(floor, i.upspeed),
  }));

  return (
    <div className="space-y-2">
      <MiniSpeedChart data={downData} color="#3b82f6" label="Download" scale={scale} />
      <MiniSpeedChart data={upData} color="#22c55e" label="Upload" scale={scale} />
    </div>
  );
}

function MiniSpeedChart({
  data,
  color,
  label,
  scale,
}: {
  data: Array<{ t: string; v: number }>;
  color: string;
  label: string;
  scale: 'linear' | 'log';
}): JSX.Element {
  const gradId = `grad-${label}`;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-subtle mb-1 font-mono">
        {label}
      </div>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              tick={{ fontSize: 9, fill: '#a1a1aa' }}
              axisLine={{ stroke: '#27272a' }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            {scale === 'log' ? (
              <YAxis
                scale="log"
                domain={[1, 'dataMax']}
                allowDataOverflow
                tick={{ fontSize: 9, fill: '#a1a1aa' }}
                axisLine={false}
                tickLine={false}
                width={60}
                tickFormatter={(v: number) => formatRate(v)}
                ticks={[1, 1024, 1024 * 128, 1024 * 1024, 10 * 1024 * 1024, 100 * 1024 * 1024]}
              />
            ) : (
              <YAxis
                domain={[0, 'dataMax']}
                tick={{ fontSize: 9, fill: '#a1a1aa' }}
                axisLine={false}
                tickLine={false}
                width={60}
                tickFormatter={(v: number) => formatRate(v)}
              />
            )}
            <Tooltip
              content={({ active, payload, label: tlabel }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="bg-bg-base border border-zinc-800 rounded-md px-3 py-2 shadow-lg text-xs">
                    <div className="text-text-muted mb-1">{tlabel}</div>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                      <span className="text-text-muted">{label}:</span>
                      <span className="text-text-primary font-semibold">
                        {formatRate(Number(payload[0]?.value))}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="v"
              name={label}
              stroke={color}
              fill={`url(#${gradId})`}
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------- Tier card ----------

function TierCard({ data }: { data: DashboardSummary | undefined }): JSX.Element {
  if (!data?.tier) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-text-muted text-center px-4">
        Tier will appear here after the first profile probe (runs every 15 min).
      </div>
    );
  }
  const ratio = data.ratio ?? 0;
  const min = data.tier_min_ratio ?? 0;
  const headroom = ratio - min;
  const tone =
    headroom < 0.2 ? 'text-accent-danger' : headroom < 0.5 ? 'text-accent-warn' : 'text-accent-success';
  return (
    <div className="h-48 flex flex-col items-center justify-center gap-2">
      <div className="text-[10px] uppercase tracking-wider text-text-subtle">Current tier</div>
      <div className="text-3xl font-bold font-mono">{data.tier}</div>
      <div className="flex items-center gap-4 mt-2 text-sm">
        <div className="text-center">
          <div className="text-text-subtle text-[10px] uppercase tracking-wide">Ratio</div>
          <div className={clsx('font-mono font-semibold', tone)}>{ratio.toFixed(3)}</div>
        </div>
        <div className="text-text-subtle">/</div>
        <div className="text-center">
          <div className="text-text-subtle text-[10px] uppercase tracking-wide">Min</div>
          <div className="font-mono">{min.toFixed(2)}</div>
        </div>
      </div>
      <div className="text-xs text-text-muted mt-1">Headroom: {headroom.toFixed(2)}</div>
    </div>
  );
}

// ---------- Downloads table ----------

function DownloadsTable(): JSX.Element {
  const q = useQuery({
    queryKey: ['dashboard', 'torrents'],
    queryFn: () =>
      api.get<{ items: TorrentRow[]; next_cursor: number | null }>(
        '/api/torrents?limit=50',
      ),
    refetchInterval: 3_000,
  });
  const qc = useQueryClient();

  async function doAction(
    infohash: string,
    action: 'pause' | 'resume' | 'remove_with_data',
  ): Promise<void> {
    // The /action route expects mteam_id; we don't always have it. Use direct qBt path.
    // Easiest: find the matching item by infohash → fall back to no-op if missing.
    const item = q.data?.items.find((i) => i.infohash === infohash);
    if (!item || !item.mteam_id) {
      // No mteam_id means we can't hit the standard endpoint; refresh and bail.
      await qc.invalidateQueries({ queryKey: ['dashboard', 'torrents'] });
      return;
    }
    await api.post(`/api/torrents/${item.mteam_id}/action`, { action });
    await qc.invalidateQueries({ queryKey: ['dashboard', 'torrents'] });
  }

  const rows = q.data?.items ?? [];
  if (q.isLoading) {
    return <div className="p-6 text-text-muted text-sm">Loading…</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-text-muted text-sm">
        No Harvester torrents yet. Matches from the next poll cycle will show up here.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-bg-elev/60 text-text-subtle text-[10px] uppercase tracking-wider">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium">Name</th>
            <th className="text-left px-3 py-2.5 font-medium w-36">Status</th>
            <th className="text-left px-3 py-2.5 font-medium w-48">Progress</th>
            <th className="text-right px-3 py-2.5 font-medium w-24">Down</th>
            <th className="text-right px-3 py-2.5 font-medium w-24">Up</th>
            <th className="text-right px-3 py-2.5 font-medium w-20">ETA</th>
            <th className="text-right px-3 py-2.5 font-medium w-24">Actions</th>
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

// ---------- Small bits ----------

function IconBtn({
  children,
  label,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'danger';
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx(
        'h-7 w-7 rounded flex items-center justify-center cursor-pointer transition-colors',
        tone === 'danger'
          ? 'text-text-muted hover:text-accent-danger hover:bg-accent-danger/10'
          : 'text-text-muted hover:text-text-primary hover:bg-bg-elev',
      )}
    >
      {children}
    </button>
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

function DiscountTag({ discount }: { discount: string }): JSX.Element {
  const color = DISCOUNT_COLOR[discount] ?? '#71717a';
  return (
    <span
      className="text-[10px] font-mono px-1.5 py-0.5 rounded border font-medium"
      style={{
        borderColor: color + '44',
        background: color + '1a',
        color,
      }}
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

function ChartEmpty({ text }: { text: string }): JSX.Element {
  return (
    <div className="h-56 flex items-center justify-center text-sm text-text-muted text-center px-4">
      {text}
    </div>
  );
}

function ChartSkeleton(): JSX.Element {
  return (
    <div className="h-56 flex items-center justify-center">
      <div className="h-4 w-4 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function DarkTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}): JSX.Element | null {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-base border border-zinc-800 rounded-md px-3 py-2 shadow-lg text-xs">
      {label && <div className="text-text-muted mb-1">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 font-mono">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-text-muted">{p.name}:</span>
          <span className="text-text-primary font-semibold">
            {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}
