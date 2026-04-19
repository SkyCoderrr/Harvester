import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { DashboardSummary } from '@shared/types';

// Dashboard v2 — composition only. All widgets live in
// web/src/components/dashboard/*. Page file is intentionally slim per
// FR-V2-29 (target < 300 LoC).
import { AccountHealthBanner } from '../components/dashboard/AccountHealthBanner';
import { KpiStrip } from '../components/dashboard/KpiStrip';
import { StateStripBar } from '../components/dashboard/StateStripBar';
import { SpeedCard } from '../components/dashboard/SpeedCard';
import { RatioChart } from '../components/dashboard/RatioChart';
import { GrabsChart } from '../components/dashboard/GrabsChart';
import { VolumeButterflyChart } from '../components/dashboard/VolumeButterflyChart';
import { RulePerformanceBar } from '../components/dashboard/RulePerformanceBar';
import { DownloadsTable } from '../components/dashboard/DownloadsTable';

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

  // Minimal extra call so the AccountHealthBanner can key dismissal by the
  // newest snapshot timestamp (FR-V2-23: re-surfaces on next observation).
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

  // FR-V2-27: 12-column grid with row-level composition. AccountHealthBanner
  // sits above the KPI strip, state bar between strip and chart grid.
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
        <div className="col-span-12 xl:col-span-8">
          <GrabsChart />
        </div>
        <div className="col-span-12 xl:col-span-4">
          <RulePerformanceBar />
        </div>
        <div className="col-span-12">
          <VolumeButterflyChart />
        </div>
      </div>

      <DownloadsTable />
    </div>
  );
}
