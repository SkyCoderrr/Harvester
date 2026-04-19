import { clsx } from 'clsx';
import { HardDrive } from 'lucide-react';
import type { DashboardSummary } from '@shared/types';
import { formatBytes } from '../../lib/format';

// Simple used / free readout. The dual-bar experiment from Phase 2 was
// visually noisy; a plain numeric readout with a used-% underneath reads
// faster on the dashboard and matches the rest of the KPI strip.

export function DiskTile({ data }: { data: DashboardSummary | undefined }): JSX.Element {
  const totalGib = data?.disk_total_gib ?? 0;
  const usedGib = data?.disk_used_gib ?? 0;
  const freeGib = data?.disk_free_gib ?? 0;

  if (totalGib === 0) {
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

  const pctUsed = (usedGib / totalGib) * 100;
  const danger = pctUsed >= 85;
  const warn = pctUsed >= 70 && !danger;
  const pctTone = danger
    ? 'text-accent-danger'
    : warn
      ? 'text-accent-warn'
      : 'text-accent-success';
  const iconTone = pctTone;

  return (
    <div className="bg-bg-sub border border-zinc-800 rounded-lg px-4 py-3 flex items-start gap-3">
      <HardDrive className={clsx('h-5 w-5 mt-0.5', iconTone)} />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-text-subtle">Disk</div>
        <div className="text-sm font-semibold font-mono tabular-nums">
          <span className="text-text-primary">{formatBytes(usedGib * 2 ** 30)}</span>
          <span className="text-text-subtle mx-1">/</span>
          <span className={pctTone}>{formatBytes(freeGib * 2 ** 30)}</span>
          <span className="text-text-muted font-normal ml-1">free</span>
        </div>
        <div className={clsx('text-[10px] font-mono mt-0.5', pctTone)}>
          {pctUsed.toFixed(1)}% used
        </div>
      </div>
    </div>
  );
}
