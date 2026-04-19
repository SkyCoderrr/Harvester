import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Code, LayoutList, Loader2, Save } from 'lucide-react';
import { api, HarvesterClientError } from '../../api/client';
import type { Discount, RuleSet } from '@shared/types';
import {
  DISCOUNT_BUCKETS,
  bucketSelected,
  toggleBucket,
} from './buckets';
import {
  BucketPill,
  Field,
  NullableNum,
  NumInput,
  Toggle,
  ViewToggle,
} from './primitives';
import { DryRunPanel } from './DryRunPanel';
import { JsonEditor } from './JsonEditor';

type ViewMode = 'form' | 'json';

export function RuleCard({ rs }: { rs: RuleSet }): JSX.Element {
  const qc = useQueryClient();
  const [mode, setMode] = useState<ViewMode>('form');
  const [name, setName] = useState(rs.name);
  const [enabled, setEnabled] = useState(rs.enabled);
  const [sizeMin, setSizeMin] = useState(rs.rules.size_gib_min);
  const [sizeMax, setSizeMax] = useState(rs.rules.size_gib_max);
  const [whitelist, setWhitelist] = useState<Discount[]>(rs.rules.discount_whitelist);
  const [minFreeH, setMinFreeH] = useState<number | null>(rs.rules.min_free_hours_remaining);
  const [minSeeders, setMinSeeders] = useState<number | null>(rs.rules.min_seeders);
  const [maxSeeders, setMaxSeeders] = useState<number | null>(rs.rules.max_seeders);
  const [minLeechers, setMinLeechers] = useState<number | null>(rs.rules.min_leechers);
  const [maxLeechers, setMaxLeechers] = useState<number | null>(rs.rules.max_leechers ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(rs.name);
    setEnabled(rs.enabled);
    setSizeMin(rs.rules.size_gib_min);
    setSizeMax(rs.rules.size_gib_max);
    setWhitelist(rs.rules.discount_whitelist);
    setMinFreeH(rs.rules.min_free_hours_remaining);
    setMinSeeders(rs.rules.min_seeders);
    setMaxSeeders(rs.rules.max_seeders);
    setMinLeechers(rs.rules.min_leechers);
    setMaxLeechers(rs.rules.max_leechers ?? null);
  }, [rs]);

  const dirty =
    name !== rs.name ||
    enabled !== rs.enabled ||
    sizeMin !== rs.rules.size_gib_min ||
    sizeMax !== rs.rules.size_gib_max ||
    minFreeH !== rs.rules.min_free_hours_remaining ||
    minSeeders !== rs.rules.min_seeders ||
    maxSeeders !== rs.rules.max_seeders ||
    minLeechers !== rs.rules.min_leechers ||
    maxLeechers !== (rs.rules.max_leechers ?? null) ||
    JSON.stringify([...whitelist].sort()) !==
      JSON.stringify([...rs.rules.discount_whitelist].sort());

  const save = useMutation({
    mutationFn: async () => {
      const next = {
        name,
        enabled,
        rules: {
          ...rs.rules,
          size_gib_min: sizeMin,
          size_gib_max: sizeMax,
          discount_whitelist: whitelist,
          min_free_hours_remaining: minFreeH,
          min_seeders: minSeeders,
          max_seeders: maxSeeders,
          min_leechers: minLeechers,
          max_leechers: maxLeechers,
          leecher_seeder_ratio_min: rs.rules.leecher_seeder_ratio_min,
        },
      };
      return api.put(`/api/rules/${rs.id}`, next);
    },
    onSuccess: async () => {
      setError(null);
      await qc.invalidateQueries({ queryKey: ['rules'] });
    },
    onError: (err) => {
      setError(err instanceof HarvesterClientError ? err.user_message : String(err));
    },
  });

  return (
    <section
      id={`rule-${rs.id}`}
      className="bg-bg-sub border border-zinc-800 rounded-lg overflow-hidden"
    >
      <header className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-transparent border-none text-base font-medium focus:outline-none focus:bg-bg-elev rounded px-2 py-0.5 min-w-[160px]"
            aria-label="Rule name"
          />
          <Toggle checked={enabled} onChange={setEnabled} label={enabled ? 'enabled' : 'disabled'} />
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex bg-bg-elev rounded border border-zinc-800 overflow-hidden">
            <ViewToggle mode={mode} target="form" onClick={() => setMode('form')}>
              <LayoutList className="h-3.5 w-3.5" /> Form
            </ViewToggle>
            <ViewToggle mode={mode} target="json" onClick={() => setMode('json')}>
              <Code className="h-3.5 w-3.5" /> JSON
            </ViewToggle>
          </div>
          {error && <span className="text-xs text-accent-danger">{error}</span>}
          {mode === 'form' && dirty && (
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent rounded text-sm font-medium disabled:opacity-50 cursor-pointer"
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save
            </button>
          )}
        </div>
      </header>

      {mode === 'json' ? (
        <JsonEditor rs={rs} />
      ) : (
        <div className="p-5 space-y-5">
          <Field
            label="Discount whitelist"
            hint="Only grab torrents whose download cost matches one of these categories. Upload-boost variants (2× credit) are included automatically."
          >
            <div className="flex flex-wrap gap-1.5">
              {DISCOUNT_BUCKETS.map((b) => (
                <BucketPill
                  key={b.key}
                  bucket={b}
                  selected={bucketSelected(b, whitelist)}
                  onClick={() => setWhitelist((prev) => toggleBucket(b, prev))}
                />
              ))}
            </div>
            {whitelist.length === 0 && (
              <div className="mt-2 text-xs text-accent-danger">Select at least one discount.</div>
            )}
          </Field>

          <Field
            label="Size limit (GiB)"
            hint="Skip torrents smaller than min or larger than max. Use this to avoid huge files (anime box sets, 4K remuxes)."
          >
            <div className="flex items-center gap-3">
              <NumInput
                value={sizeMin}
                onChange={setSizeMin}
                min={0}
                max={100000}
                step={0.1}
                placeholder="min"
                width={100}
              />
              <span className="text-text-subtle">—</span>
              <NumInput
                value={sizeMax}
                onChange={setSizeMax}
                min={0}
                max={100000}
                step={0.1}
                placeholder="max"
                width={100}
              />
              <span className="text-xs text-text-muted font-mono">GiB</span>
              <div className="flex items-center gap-1.5 ml-2">
                {[5, 10, 20, 50, 100].map((n) => (
                  <button
                    key={n}
                    onClick={() => setSizeMax(n)}
                    className="text-[10px] px-2 py-0.5 rounded border border-zinc-800 text-text-muted hover:text-text-primary hover:border-zinc-700 cursor-pointer"
                    type="button"
                  >
                    ≤ {n}
                  </button>
                ))}
              </div>
            </div>
            {sizeMin > sizeMax && (
              <div className="mt-2 text-xs text-accent-danger">min must be ≤ max</div>
            )}
          </Field>

          <Field
            label="Minimum free-window hours remaining"
            hint="Skip if the discount window expires in less than this many hours. Null = no check."
          >
            <div className="flex items-center gap-3">
              <NumInput
                value={minFreeH ?? 0}
                onChange={(v) => setMinFreeH(v)}
                min={0}
                max={168}
                step={0.5}
                width={100}
                disabled={minFreeH == null}
              />
              <button
                type="button"
                onClick={() => setMinFreeH(minFreeH == null ? 4 : null)}
                className="text-xs text-text-muted hover:text-text-primary cursor-pointer"
              >
                {minFreeH == null ? 'enable' : 'clear'}
              </button>
            </div>
          </Field>

          <Field
            label="Swarm limits"
            hint="Control seeder and leecher counts. Leave a slot as 'any' to skip that check. If the first-seeder fast path is on, all of these are bypassed during the grace window for FREE torrents."
          >
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 items-center max-w-xl">
              <span className="text-xs text-text-muted">Seeders</span>
              <div className="flex items-center gap-2">
                <NullableNum value={minSeeders} onChange={setMinSeeders} min={0} placeholder="min" />
                <span className="text-text-subtle">—</span>
                <NullableNum value={maxSeeders} onChange={setMaxSeeders} min={0} placeholder="max" />
                <span className="text-[10px] text-text-muted ml-1">
                  Cap "max" to skip saturated swarms
                </span>
              </div>
              <span className="text-xs text-text-muted">Leechers</span>
              <div className="flex items-center gap-2">
                <NullableNum
                  value={minLeechers}
                  onChange={setMinLeechers}
                  min={0}
                  placeholder="min"
                />
                <span className="text-text-subtle">—</span>
                <NullableNum
                  value={maxLeechers}
                  onChange={setMaxLeechers}
                  min={0}
                  placeholder="max"
                />
                <span className="text-[10px] text-text-muted ml-1">
                  More leechers = more upload opportunity
                </span>
              </div>
            </div>
            {minSeeders != null && maxSeeders != null && minSeeders > maxSeeders && (
              <div className="mt-2 text-xs text-accent-danger">min seeders must be ≤ max seeders</div>
            )}
            {minLeechers != null && maxLeechers != null && minLeechers > maxLeechers && (
              <div className="mt-2 text-xs text-accent-danger">
                min leechers must be ≤ max leechers
              </div>
            )}
          </Field>

          <DryRunPanel ruleId={rs.id} dirty={dirty} />
        </div>
      )}
    </section>
  );
}
