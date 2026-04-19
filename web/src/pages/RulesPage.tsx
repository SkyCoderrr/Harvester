import { Suspense, lazy, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Check, Code, FlaskConical, LayoutList, Loader2, Save, X } from 'lucide-react';
import { api, HarvesterClientError } from '../api/client';
import type { Discount, RuleSet, RuleSetV1 } from '@shared/types';

// Monaco is ~2MB; lazy-load so Form-only users never pay for it.
const MonacoJsonEditor = lazy(() => import('../components/MonacoJsonEditor'));

type ViewMode = 'form' | 'json';

/**
 * UI buckets — each maps to one or more backend `Discount` values. We collapse upload-boost
 * variants onto the same bucket as their plain counterpart because what matters for the
 * rule decision is the *download cost*; the 2x upload credit is a bonus the user always
 * wants when available.
 */
interface DiscountBucket {
  key: string;
  label: string;
  backend: Discount[];
  color: string;
}

const DISCOUNT_BUCKETS: DiscountBucket[] = [
  { key: 'FREE', label: 'FREE', backend: ['FREE', '_2X_FREE'], color: '#22c55e' },
  { key: 'PERCENT_50', label: '50% off', backend: ['PERCENT_50', '_2X_PERCENT_50'], color: '#eab308' },
  { key: 'PERCENT_70', label: '30% off', backend: ['PERCENT_70'], color: '#f97316' },
  { key: 'NORMAL', label: 'NORMAL', backend: ['NORMAL', '_2X'], color: '#71717a' },
];

/** True iff every backend value of `bucket` is in `whitelist`. */
function bucketSelected(bucket: DiscountBucket, whitelist: Discount[]): boolean {
  return bucket.backend.every((d) => whitelist.includes(d));
}

function toggleBucket(bucket: DiscountBucket, whitelist: Discount[]): Discount[] {
  if (bucketSelected(bucket, whitelist)) {
    return whitelist.filter((d) => !bucket.backend.includes(d));
  }
  const set = new Set<Discount>(whitelist);
  for (const d of bucket.backend) set.add(d);
  return Array.from(set);
}

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
        No rule-sets configured. A factory default should have been seeded on first-run.
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

function RuleCard({ rs }: { rs: RuleSet }): JSX.Element {
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

  // Reset form if the saved rule changes (e.g. an outside update).
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
          // Keep the deprecated field untouched so old values round-trip cleanly.
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

  function toggleBucketClick(b: DiscountBucket): void {
    setWhitelist((prev) => toggleBucket(b, prev));
  }

  return (
    <section className="bg-bg-sub border border-zinc-800 rounded-lg overflow-hidden">
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
                onClick={() => toggleBucketClick(b)}
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
              <span className="text-[10px] text-text-muted ml-1">Cap "max" to skip saturated swarms</span>
            </div>
            <span className="text-xs text-text-muted">Leechers</span>
            <div className="flex items-center gap-2">
              <NullableNum value={minLeechers} onChange={setMinLeechers} min={0} placeholder="min" />
              <span className="text-text-subtle">—</span>
              <NullableNum value={maxLeechers} onChange={setMaxLeechers} min={0} placeholder="max" />
              <span className="text-[10px] text-text-muted ml-1">More leechers = more upload opportunity</span>
            </div>
          </div>
          {minSeeders != null && maxSeeders != null && minSeeders > maxSeeders && (
            <div className="mt-2 text-xs text-accent-danger">min seeders must be ≤ max seeders</div>
          )}
          {minLeechers != null && maxLeechers != null && minLeechers > maxLeechers && (
            <div className="mt-2 text-xs text-accent-danger">min leechers must be ≤ max leechers</div>
          )}
        </Field>

        <DryRunPanel ruleId={rs.id} dirty={dirty} />
      </div>
      )}
    </section>
  );
}

function ViewToggle({
  mode,
  target,
  onClick,
  children,
}: {
  mode: ViewMode;
  target: ViewMode;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-2.5 py-1 text-xs cursor-pointer transition-colors',
        mode === target ? 'bg-bg-sub text-text-primary' : 'text-text-muted hover:text-text-primary',
      )}
    >
      {children}
    </button>
  );
}

function JsonEditor({ rs }: { rs: RuleSet }): JSX.Element {
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
        throw new HarvesterClientError('RULE_VALIDATION', 'JSON is not parseable: ' + (e as Error).message);
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
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
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

function DryRunPanel({ ruleId, dirty }: { ruleId: number; dirty: boolean }): JSX.Element {
  const [data, setData] = useState<{ items: DryRunItem[]; total: number; grab_count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ items: DryRunItem[]; total: number; grab_count: number }>(
        `/api/rules/${ruleId}/dry-run`,
        { sample_size: 200 },
      );
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
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
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
                <th className="text-left px-2 py-1.5 font-medium">Would grab?</th>
                <th className="text-left px-2 py-1.5 font-medium">Name</th>
                <th className="text-left px-2 py-1.5 font-medium">Discount</th>
                <th className="text-right px-2 py-1.5 font-medium">Size</th>
                <th className="text-right px-2 py-1.5 font-medium">S/L</th>
                <th className="text-left px-2 py-1.5 font-medium">Reason</th>
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
                  <td className="px-2 py-1.5 font-mono">{i.discount.replace(/^_/, '')}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{i.size_gib.toFixed(1)} GiB</td>
                  <td className="px-2 py-1.5 text-right font-mono text-text-muted">
                    {i.seeders}/{i.leechers}
                  </td>
                  <td className="px-2 py-1.5 text-text-muted">{i.failing_condition ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium">{label}</div>
      {hint && <div className="text-xs text-text-muted mb-2">{hint}</div>}
      {children}
    </div>
  );
}

/** Like NumInput but nullable: renders a subtle "any" state when null, click to set. */
function NullableNum({
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}): JSX.Element {
  if (value == null) {
    return (
      <button
        type="button"
        onClick={() => onChange(0)}
        className="px-3 py-1.5 bg-bg-elev border border-dashed border-zinc-800 rounded text-xs text-text-subtle hover:text-text-primary hover:border-zinc-700 font-mono cursor-pointer w-[96px]"
      >
        any
      </button>
    );
  }
  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step ?? 1}
        placeholder={placeholder}
        className="w-[96px] px-3 py-1.5 bg-bg-elev border border-zinc-800 rounded text-sm font-mono focus:border-accent outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(null)}
        title="Clear limit"
        aria-label="Clear"
        className="h-6 w-6 flex items-center justify-center text-text-subtle hover:text-accent-danger cursor-pointer"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function NumInput({
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
  width = 100,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  width?: number;
  disabled?: boolean;
}): JSX.Element {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      disabled={disabled}
      style={{ width }}
      className="px-3 py-1.5 bg-bg-elev border border-zinc-800 rounded text-sm font-mono focus:border-accent outline-none disabled:opacity-40"
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={clsx(
        'inline-flex items-center gap-2 text-xs px-2 py-1 rounded cursor-pointer transition-colors',
        checked
          ? 'bg-accent-success/20 text-accent-success hover:bg-accent-success/30'
          : 'bg-zinc-800 text-text-muted hover:bg-zinc-700',
      )}
    >
      {checked ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {label}
    </button>
  );
}

function BucketPill({
  bucket,
  selected,
  onClick,
}: {
  bucket: DiscountBucket;
  selected: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'text-xs font-mono px-3 py-1 rounded border cursor-pointer transition-all',
        selected ? 'font-semibold' : 'opacity-40 hover:opacity-70',
      )}
      style={{
        borderColor: selected ? bucket.color : '#27272a',
        background: selected ? bucket.color + '22' : 'transparent',
        color: selected ? bucket.color : '#a1a1aa',
      }}
    >
      {bucket.label}
    </button>
  );
}
