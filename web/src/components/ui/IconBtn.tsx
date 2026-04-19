import { clsx } from 'clsx';
import { Tooltip } from './Tooltip';

// Icon-only button with a Radix Tooltip replacing the native `title=` so the
// hover hint renders on dark backgrounds with no 2s delay. `aria-label`
// remains for AT users (FR-V2-28 still satisfied).

export function IconBtn({
  children,
  label,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'danger';
}): JSX.Element {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={clsx(
          'h-7 w-7 rounded flex items-center justify-center cursor-pointer transition-colors',
          tone === 'danger'
            ? 'text-text-muted hover:text-accent-danger hover:bg-accent-danger/10'
            : 'text-text-muted hover:text-text-primary hover:bg-bg-elev',
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}
