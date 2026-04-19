import { useState } from 'react';
import { Check, FlaskConical, Loader2, X } from 'lucide-react';
import { api } from '../../api/client';
import type { Discount } from '@shared/types';
import { discountLabel } from '../../lib/discount';

interface DryRunItem {
  mteam_id: string;
  name: string;
  discount: Discount;
  size_gib: number;
  seeders: number;
  leechers: number;
  would_grab: boolean;
  failing_condition: string | null;
}

export function DryRunPanel({
  ruleId,
  dirty,
}: {
  ruleId: number;
  dirty: boolean;
}): JSX.Element {
  const [data, setData] = useState<
    { items: DryRunItem[]; total: number; grab_count: number } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{
        items: DryRunItem[];
        total: number;
        grab_count: number;
      }>(`/api/rules/${ruleId}/dry-run`, { sample_size: 200 });
      setData(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => {
            void run();
          }}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-elev border border-zinc-800 rounded text-sm hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
          title={dirty ? 'Save the rule first — dry-run uses the saved version' : undefined}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FlaskConical className="h-3.5 w-3.5" />
          )}
          Dry-run against last 200 events
        </button>
        {data && (
          <span className="text-xs text-text-muted">
            {data.grab_count} / {data.total} would be grabbed
          </span>
        )}
        {dirty && (
          <span className="text-xs text-accent-warn">
            unsaved — results reflect saved version
          </span>
        )}
        {error && <span className="text-xs text-accent-danger">{error}</span>}
      </div>
      {data && data.items.length > 0 && (
        <div className="max-h-80 overflow-auto border border-zinc-800 rounded">
          <table className="w-full text-xs">
            <thead className="bg-bg-elev/60 text-text-subtle uppercase tracking-wider">
              <tr>
                <th scope="col" className="text-left px-2 py-1.5 font-medium">
                  Would grab?
                </th>
                <th scope="col" className="text-left px-2 py-1.5 font-medium">
                  Name
                </th>
                <th scope="col" className="text-left px-2 py-1.5 font-medium">
                  Discount
                </th>
                <th scope="col" className="text-right px-2 py-1.5 font-medium">
                  Size
                </th>
                <th scope="col" className="text-right px-2 py-1.5 font-medium">
                  S/L
                </th>
                <th scope="col" className="text-left px-2 py-1.5 font-medium">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.slice(0, 200).map((i) => (
                <tr key={i.mteam_id} className="border-t border-zinc-800">
                  <td className="px-2 py-1.5">
                    {i.would_grab ? (
                      <Check className="h-3.5 w-3.5 text-accent-success" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-text-muted" />
                    )}
                  </td>
                  <td className="px-2 py-1.5 max-w-[320px] truncate" title={i.name}>
                    {i.name}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{discountLabel(i.discount)}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                    {i.size_gib.toFixed(1)} GiB
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-text-muted tabular-nums">
                    {i.seeders}/{i.leechers}
                  </td>
                  <td className="px-2 py-1.5 text-text-muted">
                    {i.failing_condition ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
