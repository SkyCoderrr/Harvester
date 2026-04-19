import { clsx } from 'clsx';
import { useCallback, useRef } from 'react';

// FR-V2-16 / HANDOFF §B.4.1: shared SegmentedControl primitive. Used by the
// dashboard chart time-window switchers (Ratio, Grabs, Volume) and by the
// SpeedCard linear/log toggle, among others.

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  ariaLabel?: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  size?: 'sm' | 'md';
  'aria-label'?: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'sm',
  'aria-label': ariaLabel,
  className,
}: SegmentedControlProps<T>): JSX.Element {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const focusAt = useCallback(
    (idx: number) => {
      const next = (idx + options.length) % options.length;
      buttonsRef.current[next]?.focus();
      const v = options[next]?.value;
      if (v !== undefined) onChange(v);
    },
    [onChange, options],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number): void => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusAt(idx + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusAt(idx - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusAt(options.length - 1);
    }
  };

  const heights = size === 'md' ? 'h-8 text-xs' : 'h-7 text-[11px]';

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={clsx(
        'inline-flex bg-bg-elev rounded border border-zinc-800 overflow-hidden font-mono',
        className,
      )}
    >
      {options.map((opt, idx) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              buttonsRef.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.ariaLabel ?? opt.label}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={clsx(
              'px-2.5 cursor-pointer transition-colors',
              heights,
              active
                ? 'bg-bg-sub text-text-primary'
                : 'text-text-muted hover:text-text-primary',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
