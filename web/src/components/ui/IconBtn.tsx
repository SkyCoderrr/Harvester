import { clsx } from 'clsx';

// FR-V2-28: aria-label (announced to screen readers) + title (sighted hover).

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
    <button
      type="button"
      aria-label={label}
      title={label}
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
  );
}
