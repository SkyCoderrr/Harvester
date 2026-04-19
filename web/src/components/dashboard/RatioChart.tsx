import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePersistedState } from '../../hooks/usePersistedState';
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
import { Card, ChartEmpty, ChartSkeleton, DarkTooltip } from './shared';
import { SegmentedControl } from '../ui/SegmentedControl';

interface ProfileSnap {
  ts: number;
  ratio: number;
  bonus_points: number | null;
  uploaded_bytes: number;
  downloaded_bytes: number;
}

type Window = '1h' | '24h' | '7d' | '30d';
const OPTS: ReadonlyArray<{ value: Window; label: string }> = [
  { value: '1h', label: '1h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

function hoursFor(w: Window): number {
  switch (w) {
    case '1h':
      return 1;
    case '24h':
      return 24;
    case '7d':
      return 24 * 7;
    case '30d':
      return 24 * 30;
  }
}

export function RatioChart(): JSX.Element {
  const [win, setWin] = usePersistedState<Window>(
    'dashboard.ratio.window',
    '1h',
    (v): v is Window => v === '1h' || v === '24h' || v === '7d' || v === '30d',
  );
  const hours = hoursFor(win);
  const q = useQuery({
    queryKey: ['stats', 'profile-snapshots', hours],
    queryFn: () =>
      api.get<{ items: ProfileSnap[] }>(`/api/stats/profile-snapshots?hours=${hours}`),
    refetchInterval: 60_000,
    staleTime: 55_000,
    structuralSharing: true,
  });

  const items = q.data?.items ?? [];
  const data = useMemo(
    () =>
      items.map((i) => ({
        t: new Date(i.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        ratio: Number(i.ratio.toFixed(3)),
        bonus: i.bonus_points ?? 0,
      })),
    [items],
  );

  const right = (
    <SegmentedControl value={win} onChange={setWin} options={OPTS} aria-label="Ratio window" />
  );

  return (
    <Card title="Ratio & bonus" right={right} className="h-full">
      {q.isLoading ? (
        <ChartSkeleton />
      ) : data.length === 0 ? (
        <ChartEmpty text="No profile snapshots yet. The probe runs every 15 minutes." />
      ) : (
        <div className="flex-1 min-h-[224px]">
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
      )}
    </Card>
  );
}
