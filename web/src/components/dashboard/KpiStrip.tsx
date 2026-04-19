import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Award,
  Clock,
  TrendingUp,
} from 'lucide-react';
import type { DashboardSummary } from '@shared/types';
import { KpiTile } from './KpiTile';
import { DiskTile } from './DiskTile';
import { formatBytes, formatDurationShort } from '../../lib/format';

// FR-V2-17 / FR-V2-18: new UPLOAD, DOWNLOAD, SEEDING TIME tiles. Strip is a
// responsive 9-tile grid at xl/2xl; 5+4 wrap at lg; single column at sm.

export function KpiStrip({ data }: { data: DashboardSummary | undefined }): JSX.Element {
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-9">
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
