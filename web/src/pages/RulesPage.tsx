import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { RuleSet } from '@shared/types';
import { RuleCard } from '../components/rules/RuleCard';

// Rules page v2 — composition only. Each rule-set renders through RuleCard;
// form primitives, the JSON editor, and the dry-run panel live in
// web/src/components/rules/*. Keeps this page file under 300 LoC
// (FR-V2-29).

export default function RulesPage(): JSX.Element {
  const q = useQuery({
    queryKey: ['rules'],
    queryFn: () => api.get<{ items: RuleSet[] }>('/api/rules'),
  });
  if (q.isLoading) return <div className="p-6 text-text-muted">Loading…</div>;
  const items = q.data?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="p-6 text-text-muted">
        No rule-sets configured. A factory default should have been seeded on first-run — check
        <code className="mx-1 text-text-primary">/api/rules</code>
        or re-run first-run setup.
      </div>
    );
  }
  return (
    <div className="p-6 space-y-4 max-w-4xl">
      {items.map((rs) => (
        <RuleCard key={rs.id} rs={rs} />
      ))}
    </div>
  );
}
