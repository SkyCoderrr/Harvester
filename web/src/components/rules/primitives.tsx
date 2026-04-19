import { clsx } from 'clsx';
import { Check, X } from 'lucide-react';
import type { DiscountBucket } from './buckets';

export function Field({
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

export function NumInput({
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

export function NullableNum({
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

export function Toggle({
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

export function BucketPill({
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

export function ViewToggle({
  mode,
  target,
  onClick,
  children,
}: {
  mode: 'form' | 'json';
  target: 'form' | 'json';
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
