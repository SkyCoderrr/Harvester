import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  // FR-V2-24: window switcher added; default 30d per V2 plan.
  const [days, setDays] = useState<Window>('30');
  const q = useQuery({
    queryKey: ['stats', 'grabs-by-day', days],
    queryFn: () => api.get<{ items: GrabDay[] }>(`/api/stats/grabs-by-day?days=${days}`),
    refetchInterval: 60_000,
    staleTime: 55_000,
    structuralSharing: true,
  });

  const pivot = useMemo(() => {
    const items = q.data?.items ?? [];
    const byDay = new Map<string, Record<string, number | string>>();
    for (const r of items) {
      const day = r.day.slice(5); // MM-DD
      if (!byDay.has(day)) byDay.set(day, { day });
      byDay.get(day)![r.discount] = r.c;
    }
    const discounts = Array.from(new Set(items.map((i) => i.discount)));
    return { data: Array.from(byDay.values()), discounts };
  }, [q.data]);

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
