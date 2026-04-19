import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { DashboardSummary } from '@shared/types';

import { AccountHealthBanner } from '../components/dashboard/AccountHealthBanner';
import { KpiStrip } from '../components/dashboard/KpiStrip';
import { StateStripBar } from '../components/dashboard/StateStripBar';
import { SpeedCard } from '../components/dashboard/SpeedCard';
import { RatioChart } from '../components/dashboard/RatioChart';
import { GrabsChart } from '../components/dashboard/GrabsChart';
import { VolumeButterflyChart } from '../components/dashboard/VolumeButterflyChart';
import { DownloadsTable } from '../components/dashboard/DownloadsTable';

// Dashboard layout (post-review):
//   Row 0  AccountHealthBanner (conditional)
//   Row 1  KpiStrip
//   Row 2  StateStripBar
//   Row 3  SpeedCard (8) | RatioChart (4)
//   Row 4  GrabsChart (6) | VolumeButterflyChart (6)
//   Row 5  DownloadsTable
// RulePerformanceBar removed — low signal; the Rules page has what the
// user needs when actually tuning rules.

interface LatestProfileSnap {
  items: Array<{ ts: number }>;
}

export default function DashboardPage(): JSX.Element {
  const summaryQ = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api.get<DashboardSummary>('/api/dashboard/summary'),
    refetchInterval: 10_000,
    staleTime: 9_000,
    structuralSharing: true,
  });

  const snapQ = useQuery({
    queryKey: ['dashboard', 'latest-snap-ts'],
    queryFn: () =>
      api.get<LatestProfileSnap>('/api/stats/profile-snapshots?hours=1'),
    refetchInterval: 60_000,
    staleTime: 55_000,
    structuralSharing: true,
  });
  const lastSnapshotTs =
    snapQ.data?.items.length ? snapQ.data.items[snapQ.data.items.length - 1]!.ts : null;

  return (
    <div className="p-6 space-y-4">
      <AccountHealthBanner data={summaryQ.data} lastSnapshotTs={lastSnapshotTs} />

      <KpiStrip data={summaryQ.data} />

      <StateStripBar />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-8">
          <SpeedCard />
        </div>
        <div className="col-span-12 xl:col-span-4">
          <RatioChart />
        </div>
        <div className="col-span-12 xl:col-span-6">
          <GrabsChart />
        </div>
        <div className="col-span-12 xl:col-span-6">
          <VolumeButterflyChart />
        </div>
      </div>

      <DownloadsTable />
    </div>
  );
}
