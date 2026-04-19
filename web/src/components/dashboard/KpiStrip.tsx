import { Activity, Award, Clock, TrendingUp } from 'lucide-react';
import type { DashboardSummary } from '@shared/types';
import { KpiTile } from './KpiTile';
import { DiskTile } from './DiskTile';
import { TorrentsTile } from './TorrentsTile';
import { VolumeTile } from './VolumeTile';
import { formatDurationShort } from '../../lib/format';

// KPI strip layout:
//   Ratio | SeedTime | Bonus | Grabs | Volume(2) | Torrents(2) | Disk
// Total = 8 slots at the widest breakpoint. Volume and Disk sit next to each
// other so the lifetime-volume + disk-state reads as one coherent block.

export function KpiStrip({ data }: { data: DashboardSummary | undefined }): JSX.Element {
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 2xl:grid-cols-8">
      <KpiTile
        label="Ratio"
        icon={TrendingUp}
        value={data?.ratio?.toFixed(3) ?? '—'}
        delta={data?.ratio_delta_1h ?? null}
        deltaFormatter={(d) => d.toFixed(3)}
        deltaSuffix="· 1h"
      />
      <KpiTile
        label="Seeding time"
        icon={Clock}
        value={formatDurationShort(data?.seedtime_sec)}
        delta={data?.seedtime_sec_delta_24h ?? null}
        deltaFormatter={(d) => formatDurationShort(d)}
        deltaSuffix="· 24h"
        hint={data?.seedtime_sec == null ? 'no probe yet' : undefined}
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
        deltaSuffix="vs prev"
      />
      <VolumeTile data={data} />
      <TorrentsTile data={data} />
      <DiskTile data={data} />
    </div>
  );
}
