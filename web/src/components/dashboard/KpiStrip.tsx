import {
  Activity,
  ArrowDown,
  ArrowUp,
  Award,
  Clock,
  TrendingUp,
} from 'lucide-react';
import type { DashboardSummary } from '@shared/types';
import { KpiTile } from './KpiTile';
import { DiskTile } from './DiskTile';
import { TorrentsTile } from './TorrentsTile';
import { formatBytes, formatDurationShort } from '../../lib/format';

// KPI strip: 7 cells wide at 2xl (one is the 2-col TorrentsTile → 8 grid
// slots). Wraps responsively down to 2 columns.

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
      <KpiTile
        label="Uploaded"
        icon={ArrowUp}
        tone="text-accent-success"
        value={
          data?.uploaded_bytes_total != null ? formatBytes(data.uploaded_bytes_total) : '—'
        }
        delta={data?.uploaded_bytes_delta_24h ?? null}
        deltaFormatter={(d) => formatBytes(Math.abs(d))}
        deltaSuffix="· 24h"
      />
      <KpiTile
        label="Downloaded"
        icon={ArrowDown}
        tone="text-accent"
        value={
          data?.downloaded_bytes_total != null ? formatBytes(data.downloaded_bytes_total) : '—'
        }
        delta={data?.downloaded_bytes_delta_24h ?? null}
        deltaFormatter={(d) => formatBytes(Math.abs(d))}
        deltaSuffix="· 24h"
        deltaInvert
      />
      <TorrentsTile data={data} />
      <DiskTile data={data} />
    </div>
  );
}
