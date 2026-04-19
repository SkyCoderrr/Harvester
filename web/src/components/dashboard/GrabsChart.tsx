import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePersistedState } from '../../hooks/usePersistedState';
import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../api/client';
import { Card, ChartEmpty, ChartSkeleton, DarkTooltip } from './shared';
import { SegmentedControl } from '../ui/SegmentedControl';
import { discountLabel, discountToken } from '../../lib/discount';

interface GrabDay {
  day: string;
  discount: string;
  c: number;
}

type Window = '7' | '14' | '30' | '90';
const OPTS: ReadonlyArray<{ value: Window; label: string }> = [
  { value: '7', label: '7d' },
  { value: '14', label: '14d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
];

export function GrabsChart(): JSX.Element {
  const [days, setDays] = usePersistedState<Window>(
    'dashboard.grabs.days',
    '30',
    (v): v is Window => v === '7' || v === '14' || v === '30' || v === '90',
  );
  const q = useQuery({
    queryKey: ['stats', 'grabs-by-day', days],
    queryFn: () => api.get<{ items: GrabDay[] }>(`/api/stats/grabs-by-day?days=${days}`),
    refetchInterval: 60_000,
    staleTime: 55_000,
    structuralSharing: true,
  });

  // Two bugs previously showed up here:
  //   (1) counts on a given calendar day shifted when switching windows —
  //       caused by a rolling `since` on the backend that left the oldest
  //       day partial. Fixed server-side by anchoring `since` to local
  //       midnight (see src/http/routes/stats.ts).
  //   (2) days with zero grabs disappeared because GROUP BY returned no
  //       row for them. Fix: pre-seed the full calendar range here and
  //       overlay server rows on top.
  const pivot = useMemo(() => {
    const items = q.data?.items ?? [];
    const byDay = new Map<string, Record<string, number | string>>();
    const discountSet = new Set<string>();

    // Seed every day in the window with zeros so empty days still render.
    const n = Number(days);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      byDay.set(key, { day: key });
    }

    for (const r of items) {
      const day = r.day.slice(5); // MM-DD
      if (!byDay.has(day)) byDay.set(day, { day });
      byDay.get(day)![r.discount] = r.c;
      discountSet.add(r.discount);
    }

    // Fill zeros for every discount on every day so stacked bars are stable.
    const discounts = Array.from(discountSet);
    for (const row of byDay.values()) {
      for (const d of discounts) {
        if (row[d] == null) row[d] = 0;
      }
    }

    return { data: Array.from(byDay.values()), discounts };
  }, [q.data, days]);

  const right = (
    <SegmentedControl value={days} onChange={setDays} options={OPTS} aria-label="Grabs window" />
  );

  return (
    <Card title="Grabs per day — by discount" right={right} className="h-full">
      {q.isLoading ? (
        <ChartSkeleton />
      ) : pivot.data.length === 0 ? (
        <ChartEmpty text="No grabs yet. The poller fills this in as rules match on new torrents." />
      ) : (
        <div className="flex-1 min-h-[224px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pivot.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
              {pivot.discounts.map((d) => (
                <Bar
                  key={d}
                  dataKey={d}
                  stackId="a"
                  fill={discountToken(d)}
                  radius={[4, 4, 0, 0]}
                  name={discountLabel(d)}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
