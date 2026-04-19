import { AlertCircle } from 'lucide-react';
import { explainRejection } from '../../lib/rejectionReasons';

// FR-V2-39 / FR-V2-40: surface the most recent rejection_reason for a
// skipped torrent, with a human-readable explanation. Source data is the
// existing /api/torrents/:id endpoint (already returns transitions).

interface TransitionRow {
  seen_at: number;
  decision: string;
  rejection_reason: string | null;
  matched_rule: string | null;
}

export function WhySkippedPanel({
  transitions,
}: {
  transitions: Array<Record<string, unknown>>;
}): JSX.Element | null {
  // Pick the most recent transition (transitions come back newest-first).
  const latest = (transitions[0] as unknown as TransitionRow | undefined) ?? null;
  if (!latest) return null;

  const isSkip =
    typeof latest.decision === 'string' &&
    (latest.decision.startsWith('SKIPPED') || latest.decision.startsWith('RE_EVALUATED_SKIPPED'));
  if (!isSkip) return null;

  const reason = explainRejection(latest.rejection_reason);
  if (!reason) return null;

  const when = new Date(Number(latest.seen_at) * 1000).toLocaleString();

  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-accent-warn/50 bg-accent-warn/10 text-accent-warn">
      <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
      <div className="flex-1 text-sm space-y-0.5">
        <div className="font-medium">Why was this skipped?</div>
        <div>{reason}</div>
        <div className="text-[11px] text-text-muted font-mono">
          {latest.rejection_reason ?? '—'} · {when}
          {latest.matched_rule && ` · rule: ${latest.matched_rule}`}
        </div>
      </div>
    </div>
  );
}
