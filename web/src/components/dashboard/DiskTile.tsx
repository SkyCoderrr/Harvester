import { clsx } from 'clsx';
import { HardDrive } from 'lucide-react';
import type { DashboardSummary } from '@shared/types';
import { formatBytes } from '../../lib/format';

// FR-V2-19: dual-bar disk tile. Top bar = full-disk utilization (what the
// filesystem reports). Bottom bar = Harvester's share of total. Below the
// bars a "free: X · total: Y" line. Fixes the v1 issue where "Disk" read as
// "Harvester's usage vs its own subset" and misleadingly tracked 100% full.

export function DiskTile({ data }: { data: DashboardSummary | undefined }): JSX.Element {
  const totalGib = data?.disk_total_gib ?? 0;
  const usedGib = data?.disk_used_gib ?? 0;
  const freeGib = data?.disk_free_gib ?? 0;

  const fullPct = totalGib > 0 ? (usedGib / totalGib) * 100 : 0;
  const harvesterBytes = data?.harvester_used_bytes ?? 0;
  const harvesterGib = harvesterBytes / 2 ** 30;
  const harvesterPct = totalGib > 0 ? (harvesterGib / totalGib) * 100 : 0;

  // Threshold on full-disk utilization (not Harvester's share).
  const danger = fullPct >= 85;
  const warn = fullPct >= 70 && !danger;
  const topColor = danger ? 'bg-accent-danger' : warn ? 'bg-accent-warn' : 'bg-accent-success';
  const iconTone = danger
    ? 'text-accent-danger'
    : warn
      ? 'text-accent-warn'
      : 'text-accent-success';

  if (totalGib === 0) {
    // Cold DB / statfs failure — degrade gracefully.
    return (
      <div className="bg-bg-sub border border-zinc-800 rounded-lg px-4 py-3 flex items-start gap-3">
        <HardDrive className="h-5 w-5 mt-0.5 text-text-muted" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-text-subtle">Disk</div>
          <div className="text-sm text-text-muted mt-1">
            Waiting for first probe; check save path is reachable.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-sub border border-zinc-800 rounded-lg px-4 py-3 flex items-start gap-3">
      <HardDrive className={clsx('h-5 w-5 mt-0.5', iconTone)} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="text-[10px] uppercase tracking-wide text-text-subtle">Disk</div>
        <div>
          <div className="flex items-center justify-between text-[10px] font-mono text-text-muted">
            <span>Full disk</span>
            <span className={iconTone}>{fullPct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-bg-elev rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all', topColor)}
              style={{ width: `${Math.min(100, fullPct)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[10px] font-mono text-text-muted">
            <span>Harvester</span>
            <span>{harvesterPct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-bg-elev rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${Math.min(100, harvesterPct)}%` }}
            />
          </div>
        </div>
        <div className="text-[10px] font-mono text-text-muted">
          free {formatBytes(freeGib * 2 ** 30)} · total {formatBytes(totalGib * 2 ** 30)}
        </div>
      </div>
    </div>
  );
}
