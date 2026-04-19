import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, ChartEmpty, ChartSkeleton } from './shared';

// FR-V2-21 / HANDOFF §B.4.5: per-rule performance — one stacked segment per
// rule-set, width = grabs / total grabs. Legend below as chip-style.

interface Row {
  rule: string;
  grabs: number;
  skips: number;
  errors: number;
}

// Deterministic color from rule name — hash → HSL hue. Keeps the palette
// stable across reloads without a hand-picked mapping.
function ruleColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

export function RulePerformanceBar(): JSX.Element {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['stats', 'ruleset-performance', 14],
    queryFn: () => api.get<{ items: Row[] }>(`/api/stats/ruleset-performance?days=14`),
    refetchInterval: 60_000,
    staleTime: 55_000,
    structuralSharing: true,
  });

  const items = q.data?.items ?? [];
  const visibleItems = useMemo(() => items.filter((r) => r.grabs > 0), [items]);
  const totalGrabs = visibleItems.reduce((a, r) => a + r.grabs, 0);

  return (
    <Card title="Rule performance — 14d">
      {q.isLoading ? (
        <ChartSkeleton />
      ) : visibleItems.length === 0 ? (
        <ChartEmpty text="No grabs matched in the last 14 days. Add or enable a rule-set in /rules." />
      ) : (
        <div className="space-y-3">
          <div
            className="flex h-6 w-full rounded overflow-hidden border border-zinc-800"
            role="img"
            aria-label="Rule-set grab share, last 14 days"
          >
            {visibleItems.map((r) => (
              <button
                key={r.rule}
                type="button"
                onClick={() => navigate(`/rules#id=${encodeURIComponent(r.rule)}`)}
                title={`${r.rule} — ${r.grabs} grabs`}
                className="h-full cursor-pointer"
                style={{
                  width: `${(r.grabs / totalGrabs) * 100}%`,
                  background: ruleColor(r.rule),
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-mono">
            {visibleItems.map((r) => (
              <button
                key={r.rule}
                type="button"
                onClick={() => navigate(`/rules#id=${encodeURIComponent(r.rule)}`)}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-zinc-800 bg-bg-elev hover:bg-bg-base cursor-pointer"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: ruleColor(r.rule) }}
                />
                <span className="text-text-primary">{r.rule}</span>
                <span className="text-text-muted">
                  {r.grabs} · {Math.round((r.grabs / totalGrabs) * 100)}%
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
