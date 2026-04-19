import { clsx } from 'clsx';
import {
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-react';

// Small primitives shared across the dashboard widgets after the Phase-2
// split. Extracted verbatim from the v1 DashboardPage.tsx to minimize
// behavior drift.

export function Card({
  title,
  children,
  pad = true,
  right,
  className,
}: {
  title: string;
  children: React.ReactNode;
  pad?: boolean;
  right?: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <section
      className={clsx(
        'bg-bg-sub border border-zinc-800 rounded-lg overflow-hidden',
        className,
      )}
    >
      <header className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-wider text-text-muted font-medium">
          {title}
        </span>
        {right}
      </header>
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function ChartEmpty({ text }: { text: string }): JSX.Element {
  // FR-V2-56: one-sentence recovery guidance.
  return (
    <div className="h-56 flex items-center justify-center text-sm text-text-muted text-center px-4">
      {text}
    </div>
  );
}

export function ChartSkeleton(): JSX.Element {
  return (
    <div className="h-56 flex items-center justify-center">
      <div className="h-4 w-4 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function DeltaPill({
  delta,
  formatter,
  suffix,
  invertColors,
}: {
  delta: number;
  formatter: (v: number) => string;
  suffix?: string;
  invertColors?: boolean;
}): JSX.Element {
  if (delta === 0) {
    return (
      <div className="text-[10px] text-text-muted font-mono mt-0.5">
        flat{suffix ? ` ${suffix}` : ''}
      </div>
    );
  }
  const up = delta > 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  // Download delta: "up" is bad (more data used), so invert.
  const positiveIsGood = !invertColors;
  const good = up === positiveIsGood;
  const tone = good ? 'text-accent-success' : 'text-accent-danger';
  return (
    <div className={clsx('inline-flex items-center gap-0.5 text-[10px] font-mono mt-0.5', tone)}>
      <Arrow className="h-3 w-3" />
      {up ? '+' : ''}
      {formatter(delta)}
      {suffix && <span className="text-text-muted ml-1">{suffix}</span>}
    </div>
  );
}

export function DarkTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}): JSX.Element | null {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-base border border-zinc-800 rounded-md px-3 py-2 shadow-lg text-xs">
      {label && <div className="text-text-muted mb-1">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 font-mono">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-text-muted">{p.name}:</span>
          <span className="text-text-primary font-semibold">
            {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}
