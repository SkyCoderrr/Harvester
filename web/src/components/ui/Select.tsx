import * as RS from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

// Thin Radix Select wrapper so native `<select>` renders consistently on
// dark themes. Kept minimal — just value + options + aria-label.

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> {
  value: T;
  onValueChange: (v: T) => void;
  options: ReadonlyArray<SelectOption<T>>;
  'aria-label'?: string;
  className?: string;
  placeholder?: string;
}

export function Select<T extends string>({
  value,
  onValueChange,
  options,
  className,
  placeholder,
  'aria-label': ariaLabel,
}: SelectProps<T>): JSX.Element {
  return (
    <RS.Root value={value} onValueChange={onValueChange as (v: string) => void}>
      <RS.Trigger
        aria-label={ariaLabel}
        className={
          'inline-flex items-center justify-between gap-2 px-2 py-1 bg-bg-elev border border-zinc-800 rounded font-mono text-xs min-w-[160px] focus:border-accent outline-none cursor-pointer ' +
          (className ?? '')
        }
      >
        <RS.Value placeholder={placeholder} />
        <RS.Icon>
          <ChevronDown className="h-3 w-3 text-text-muted" />
        </RS.Icon>
      </RS.Trigger>
      <RS.Portal>
        <RS.Content
          position="popper"
          sideOffset={4}
          className="z-50 overflow-hidden rounded-md border border-zinc-800 bg-bg-sub shadow-xl min-w-[var(--radix-select-trigger-width)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <RS.Viewport className="p-1">
            {options.map((opt) => (
              <RS.Item
                key={opt.value}
                value={opt.value}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs font-mono text-text-muted hover:bg-bg-elev hover:text-text-primary data-[state=checked]:text-text-primary data-[state=checked]:bg-bg-elev/60 cursor-pointer select-none outline-none"
              >
                <RS.ItemText>{opt.label}</RS.ItemText>
                <RS.ItemIndicator>
                  <Check className="h-3 w-3 text-accent" />
                </RS.ItemIndicator>
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  );
}
