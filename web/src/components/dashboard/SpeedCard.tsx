import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../api/client';
import { formatRate } from '../../lib/format';
import { ChartEmpty, ChartSkeleton } from './shared';
import { SegmentedControl } from '../ui/SegmentedControl';

interface TransferSnap {
  ts: number;
  dlspeed: number;
  upspeed: number;
}

const SCALE_OPTS = [
  { value: 'linear' as const, label: 'Linear' },
  { value: 'log' as const, label: 'Log' },
];

const VIEW_OPTS = [
  { value: 'split' as const, label: 'Split' },
  { value: 'combined' as const, label: 'Combined' },
];

export function SpeedCard(): JSX.Element {
  const q = useQuery({
    queryKey: ['stats', 'transfer-snapshots', 60],
    queryFn: () => api.get<{ items: TransferSnap[] }>('/api/stats/transfer-snapshots?minutes=60'),
    refetchInterval: 60_000,
    staleTime: 55_000,
    structuralSharing: true,
  });
  const [scale, setScale] = useState<'linear' | 'log'>('linear');
  const [view, setView] = useState<'split' | 'combined'>('split');

  const items = q.data?.items ?? [];
  const latest = items[items.length - 1];
  const maxDown = items.reduce((m, s) => Math.max(m, s.dlspeed), 0);
  const maxUp = items.reduce((m, s) => Math.max(m, s.upspeed), 0);

  return (
    <section className="bg-bg-sub border border-zinc-800 rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <span className="text-xs uppercase tracking-wider text-text-muted font-medium">
            Speed — 60m
          </span>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <ChevronDown className="h-3 w-3 text-accent" />
              <span className="text-accent font-semibold">
                {formatRate(latest?.dlspeed ?? 0)}
              </span>
              <span className="text-text-subtle">peak {formatRate(maxDown)}</span>
            </span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <ChevronUp className="h-3 w-3 text-accent-success" />
              <span className="text-accent-success font-semibold">
                {formatRate(latest?.upspeed ?? 0)}
              </span>
              <span className="text-text-subtle">peak {formatRate(maxUp)}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            value={view}
            onChange={setView}
            options={VIEW_OPTS}
            aria-label="Speed chart view"
          />
          <SegmentedControl
            value={scale}
            onChange={setScale}
            options={SCALE_OPTS}
            aria-label="Speed chart scale"
          />
        </div>
      </header>
      <div className="p-4">
        {q.isLoading ? (
          <ChartSkeleton />
        ) : items.length === 0 ? (
          <ChartEmpty text="No transfer samples in the last 60m. The probe writes every 60s while the service is running." />
        ) : view === 'combined' ? (
          <CombinedSpeedChart items={items} scale={scale} />
        ) : (
          <SplitSpeedChart items={items} scale={scale} />
        )}
      </div>
    </section>
  );
}

function SplitSpeedChart({
  items,
  scale,
}: {
  items: TransferSnap[];
  scale: 'linear' | 'log';
}): JSX.Element {
  const floor = scale === 'log' ? 1 : 0;
  const downData = useMemo(
    () =>
      items.map((i) => ({
        t: new Date(i.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        v: Math.max(floor, i.dlspeed),
      })),
    [items, floor],
  );
  const upData = useMemo(
    () =>
      items.map((i) => ({
        t: new Date(i.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        v: Math.max(floor, i.upspeed),
      })),
    [items, floor],
  );

  return (
    <div className="space-y-2">
      <MiniSpeedChart data={downData} color="#3b82f6" label="Download" scale={scale} />
      <MiniSpeedChart data={upData} color="#22c55e" label="Upload" scale={scale} />
    </div>
  );
}

function CombinedSpeedChart({
  items,
  scale,
}: {
  items: TransferSnap[];
  scale: 'linear' | 'log';
}): JSX.Element {
  const floor = scale === 'log' ? 1 : 0;
  const data = useMemo(
    () =>
      items.map((i) => ({
        t: new Date(i.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        dl: Math.max(floor, i.dlspeed),
        up: Math.max(floor, i.upspeed),
      })),
    [items, floor],
  );

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradCombinedDl" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradCombinedUp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="t"
            tick={{ fontSize: 10, fill: '#a1a1aa' }}
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
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              axisLine={false}
              tickLine={false}
              width={70}
              tickFormatter={(v: number) => formatRate(v)}
              ticks={[1, 1024, 1024 * 128, 1024 * 1024, 10 * 1024 * 1024, 100 * 1024 * 1024]}
            />
          ) : (
            <YAxis
              domain={[0, 'dataMax']}
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              axisLine={false}
              tickLine={false}
              width={70}
              tickFormatter={(v: number) => formatRate(v)}
            />
          )}
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const dl = Number(payload.find((p) => p.name === 'Download')?.value ?? 0);
              const up = Number(payload.find((p) => p.name === 'Upload')?.value ?? 0);
              return (
                <div className="bg-bg-base border border-zinc-800 rounded-md px-3 py-2 shadow-lg text-xs font-mono">
                  <div className="text-text-muted mb-1">{label}</div>
                  <div className="text-accent">↓ {formatRate(dl)}</div>
                  <div className="text-accent-success">↑ {formatRate(up)}</div>
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} />
          <Area
            type="monotone"
            dataKey="dl"
            name="Download"
            stroke="#3b82f6"
            fill="url(#gradCombinedDl)"
            strokeWidth={1.5}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="up"
            name="Upload"
            stroke="#22c55e"
            fill="url(#gradCombinedUp)"
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
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
