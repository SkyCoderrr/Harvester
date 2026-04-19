import * as RT from '@radix-ui/react-tooltip';

// Thin styled wrapper over Radix Tooltip. Provider goes at app root (App.tsx).
// Use: <Tooltip content="…"><button>⋯</button></Tooltip>

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Milliseconds before the tooltip opens on hover/focus. */
  delay?: number;
}

export function Tooltip({ content, children, side = 'top', delay = 300 }: TooltipProps): JSX.Element {
  return (
    <RT.Root delayDuration={delay}>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={6}
          className="z-50 px-2 py-1 rounded-md border border-zinc-800 bg-bg-base text-xs text-text-primary shadow-lg font-mono select-none data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95"
        >
          {content}
          <RT.Arrow className="fill-zinc-800" />
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}

export { Provider as TooltipProvider } from '@radix-ui/react-tooltip';
