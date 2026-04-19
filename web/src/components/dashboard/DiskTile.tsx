import { clsx } from 'clsx';
import { HardDrive } from 'lucide-react';
import type { DashboardSummary } from '@shared/types';
import { formatBytesDecimal } from '../../lib/format';

// Disk tile with a Harvester-specific "used" reading. Format:
//   425 GB used · 3326 GB free
// "Used" is the sum of bytes Harvester is actually managing on disk
// (harvester_used_bytes), NOT the whole filesystem. "Free" is what the
// filesystem reports.
//
// Decimal labels per dashboard convention (1 GB = 1e9 B).
export function DiskTile({ data }: { data: DashboardSummary | undefined }): JSX.Element {
  const harvesterBytes = data?.harvester_used_bytes ?? 0;
  const freeGib = data?.disk_free_gib ?? 0;
  const totalGib = data?.disk_total_gib ?? 0;

  if (totalGib === 0 && harvesterBytes === 0) {
    return (
      <div className="bg-bg-sub border border-zinc-800 rounded-lg px-4 py-3 flex items-start gap-3">
        <HardDrive className="h-5 w-5 mt-0.5 text-text-muted" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-text-subtle">Disk</div>
          <div className="text-sm text-text-muted mt-1">no probe yet</div>
        </div>
      </div>
    );
  }

  // Free-disk color cue: we don't know the full disk %, but we know bytes
  // free. Users who configured a free-disk-min on their rule set care when
  // free drops low in absolute terms; thresholds picked to be roughly
  // sensible defaults.
  const freeBytes = freeGib * 2 ** 30;
  const danger = freeBytes < 50 * 1e9;
  const warn = freeBytes < 200 * 1e9 && !danger;
  const freeTone = danger
    ? 'text-accent-danger'
    : warn
      ? 'text-accent-warn'
      : 'text-accent-success';

  return (
    <div className="bg-bg-sub border border-zinc-800 rounded-lg px-4 py-3 flex items-start gap-3">
      <HardDrive className={clsx('h-5 w-5 mt-0.5', freeTone)} />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-text-subtle">Disk</div>
        <div className="flex items-baseline gap-3 mt-0.5">
          <div className="font-mono tabular-nums">
            <div className="text-sm font-semibold">
              {formatBytesDecimal(harvesterBytes)}
            </div>
            <div className="text-[9px] uppercase tracking-wide text-text-subtle">Harvester</div>
          </div>
          <div className="text-text-subtle">·</div>
          <div className="font-mono tabular-nums">
            <div className={clsx('text-sm font-semibold', freeTone)}>
              {formatBytesDecimal(freeBytes)}
            </div>
            <div className="text-[9px] uppercase tracking-wide text-text-subtle">Free</div>
          </div>
        </div>
      </div>
    </div>
  );
}
