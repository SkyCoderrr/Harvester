import { Suspense, lazy, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import { api, HarvesterClientError } from '../../api/client';
import type { RuleSet, RuleSetV1 } from '@shared/types';

// Monaco is ~2MB; lazy-load so Form-only users never pay for it.
const MonacoJsonEditor = lazy(() => import('../MonacoJsonEditor'));

export function JsonEditor({ rs }: { rs: RuleSet }): JSX.Element {
  const qc = useQueryClient();
  const initial = JSON.stringify(
    { name: rs.name, enabled: rs.enabled, rules: rs.rules },
    null,
    2,
  );
  const [text, setText] = useState(initial);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setText(initial);
  }, [initial]);

  const save = useMutation({
    mutationFn: async () => {
      let parsed: { name: string; enabled: boolean; rules: RuleSetV1 };
      try {
        parsed = JSON.parse(text) as typeof parsed;
      } catch (e) {
        throw new HarvesterClientError(
          'RULE_VALIDATION',
          'JSON is not parseable: ' + (e as Error).message,
        );
      }
      return api.put(`/api/rules/${rs.id}`, parsed);
    },
    onSuccess: () => {
      setErr(null);
      void qc.invalidateQueries({ queryKey: ['rules'] });
    },
    onError: (e) => {
      setErr(e instanceof HarvesterClientError ? e.user_message : String(e));
    },
  });

  const dirty = text !== initial;

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span>
          Schema-backed JSON. Hover for field descriptions; Monaco will highlight violations
          as you type.
        </span>
      </div>
      <Suspense
        fallback={
          <div className="h-80 border border-zinc-800 rounded flex items-center justify-center text-sm text-text-muted">
            Loading editor…
          </div>
        }
      >
        <MonacoJsonEditor value={text} onChange={setText} height={380} />
      </Suspense>
      <div className="flex items-center gap-2">
        <button
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent rounded text-sm font-medium disabled:opacity-50 cursor-pointer"
        >
          {save.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save JSON
        </button>
        <button
          onClick={() => setText(initial)}
          disabled={!dirty}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-elev border border-zinc-800 rounded text-sm hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
        >
          Reset
        </button>
        {err && <span className="text-xs text-accent-danger">{err}</span>}
      </div>
    </div>
  );
}
