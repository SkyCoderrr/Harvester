import { clsx } from 'clsx';
import { HardDrive } from 'lucide-react';
import type { DashboardSummary } from '@shared/types';
import { formatBytesDecimal } from '../../lib/format';
import { TileFrame, TileHeader } from './KpiTile';

// Disk tile — stacks Harvester's footprint over filesystem free space. Same
// 1-wide footprint as Volume so they sit together in the KPI strip.

export function DiskTile({ data }: { data: DashboardSummary | undefined }): JSX.Element {
  const harvesterBytes = data?.harvester_used_bytes ?? 0;
  const freeGib = data?.disk_free_gib ?? 0;
  const totalGib = data?.disk_total_gib ?? 0;

  if (totalGib === 0 && harvesterBytes === 0) {
    return (
      <TileFrame>
        <TileHeader
          icon={<HardDrive className="h-3.5 w-3.5 text-accent" />}
          tintBg="bg-accent/10"
          label="Disk"
        />
        <div className="mt-auto text-[11px] text-text-muted">no probe yet</div>
      </TileFrame>
    );
  }

  const freeBytes = freeGib * 2 ** 30;
  const danger = freeBytes < 50 * 1e9;
  const warn = freeBytes < 200 * 1e9 && !danger;
  const freeTone = danger
    ? 'text-accent-danger'
    : warn
      ? 'text-accent-warn'
      : 'text-accent-success';

  // Icon accent follows the free-disk pressure so a glance is enough to
  // know if we're OK, getting tight, or at risk.
  const iconAccentClass = danger
    ? 'bg-accent-danger/10'
    : warn
      ? 'bg-accent-warn/10'
      : 'bg-accent-success/10';
  const iconGlyphClass = danger
    ? 'text-accent-danger'
    : warn
      ? 'text-accent-warn'
      : 'text-accent-success';

  return (
    <TileFrame>
      <TileHeader
        icon={<HardDrive className={clsx('h-3.5 w-3.5', iconGlyphClass)} />}
        tintBg={iconAccentClass}
        label="Disk"
      />
      <div className="mt-auto space-y-1.5">
        <Row
          label="Harvester"
          value={formatBytesDecimal(harvesterBytes)}
          tone="text-text-primary"
        />
        <Row label="Free" value={formatBytesDecimal(freeBytes)} tone={freeTone} />
      </div>
    </TileFrame>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wide text-text-subtle">{label}</span>
      <span className={clsx('text-sm font-semibold font-mono tabular-nums', tone)}>{value}</span>
    </div>
  );
}
