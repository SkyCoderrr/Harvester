import { useMemo } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { DashboardSummary } from '@shared/types';
import { useDismissedBanners } from '../../store/dismissedBanners';

// FR-V2-23 / HANDOFF §B.4.7: account health banner. Renders only when warned
// or leech_warn is 1. Dismissal is keyed by (condition-hash, snapshot-ts) so
// the banner re-surfaces if the condition is still active at a later
// snapshot.

export function AccountHealthBanner({
  data,
  lastSnapshotTs,
}: {
  data: DashboardSummary | undefined;
  lastSnapshotTs: number | null;
}): JSX.Element | null {
  const dismissed = useDismissedBanners((s) => s.keys);
  const dismiss = useDismissedBanners((s) => s.dismiss);

  const condition = useMemo<'warned' | 'leech_warn' | null>(() => {
    if (!data) return null;
    if (data.account_warned === 1) return 'warned';
    if (data.account_leech_warn === 1) return 'leech_warn';
    return null;
  }, [data]);

  if (!condition) return null;

  // Key dismissal to the snapshot ts so a later, re-observed condition
  // re-opens the banner per FR-V2-23.
  const key = `${condition}:${lastSnapshotTs ?? 0}`;
  if (dismissed.has(key)) return null;

  const severe = condition === 'warned';
  const copy =
    condition === 'warned'
      ? 'M-Team account WARNED — review your account status on the tracker before grabbing more torrents.'
      : 'Leech-ratio warning on M-Team — resolve before further grabs, or raise your ratio by seeding existing torrents.';

  return (
    <div
      role="alert"
      className={clsx(
        'flex items-start gap-3 px-4 py-3 rounded-lg border',
        severe
          ? 'border-accent-danger/50 bg-accent-danger/10 text-accent-danger'
          : 'border-accent-warn/50 bg-accent-warn/10 text-accent-warn',
      )}
    >
      <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
      <div className="flex-1 text-sm">{copy}</div>
      <button
        type="button"
        aria-label="Dismiss banner"
        onClick={() => dismiss(key)}
        className="p-1 rounded hover:bg-black/10 cursor-pointer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
