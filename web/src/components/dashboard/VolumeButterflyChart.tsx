import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api/client';
import { formatBytes } from '../../lib/format';
import { Card, ChartEmpty, ChartSkeleton } from './shared';
import { SegmentedControl } from '../ui/SegmentedControl';

// FR-V2-20 / HANDOFF §B.4.4: butterfly chart of uploaded vs downloaded volume.
// Uploaded bars are rendered at positive Y (accent-success), downloaded bars
// at negative Y (accent). Window switcher 7/14/30/90 days, default 14.
//
// Edge noted in V2_Implementation §3.10: the first row's LAG baseline is 0,
// so its delta equals that day's absolute max. We render that first bar at
// reduced opacity and the tooltip flags it.

type Window = '7' | '14' | '30' | '90';

interface Row {
  day: string;
  uploaded_delta: number;
  downloaded_delta: number;
}

const OPTS: ReadonlyArray<{ value: Window; label: string }> = [
  { value: '7', label: '7d' },
  { value: '14', label: '14d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
];

export function VolumeButterflyChart(): JSX.Element {
  const [days, setDays] = useState<Window>('14');
  const q = useQuery({
    queryKey: ['stats', 'profile-volume', days],
    queryFn: () =>
      api.get<{ rows: Row[] }>(`/api/stats/profile-volume?days=${days}`),
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
    structuralSharing: true,
  });

  // Downloaded goes negative; also tag the first row as baseline for opacity.
  const chartData = useMemo(() => {
    const rows = q.data?.rows ?? [];
    return rows.map((r, i) => ({
      day: r.day.slice(5),
      uploaded: r.uploaded_delta,
      downloaded: -r.downloaded_delta,
      isBaseline: i === 0,
    }));
  }, [q.data]);

  const right = (
    <SegmentedControl
      value={days}
      onChange={setDays}
      options={OPTS}
      aria-label="Volume window"
    />
  );

  return (
    <Card title="Upload vs download — volume" right={right}>
      {q.isLoading ? (
        <ChartSkeleton />
      ) : chartData.length === 0 ? (
        <ChartEmpty text="No profile snapshots yet. The probe runs every 15 minutes." />
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                width={60}
                tickFormatter={(v: number) => formatBytes(Math.abs(v))}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const up = Number(payload.find((p) => p.name === 'Uploaded')?.value ?? 0);
                  const down = Math.abs(
                    Number(payload.find((p) => p.name === 'Downloaded')?.value ?? 0),
                  );
                  const baseline = Boolean(
                    (payload[0]?.payload as { isBaseline?: boolean } | undefined)?.isBaseline,
                  );
                  const ratio = down > 0 ? (up / down).toFixed(2) : '∞';
                  return (
                    <div className="bg-bg-base border border-zinc-800 rounded-md px-3 py-2 shadow-lg text-xs font-mono">
                      <div className="text-text-muted mb-1">{label}</div>
                      <div className="text-accent-success">Up: {formatBytes(up)}</div>
                      <div className="text-accent">Down: {formatBytes(down)}</div>
                      <div className="text-text-muted">Ratio: {ratio}</div>
                      {baseline && (
                        <div className="text-accent-warn mt-1">
                          First day — LAG baseline missing; may overstate
                        </div>
                      )}
                    </div>
                  );
                }}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Bar
                dataKey="uploaded"
                name="Uploaded"
                fill="#22c55e"
                fillOpacity={0.85}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="downloaded"
                name="Downloaded"
                fill="#3b82f6"
                fillOpacity={0.85}
                radius={[0, 0, 4, 4]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
