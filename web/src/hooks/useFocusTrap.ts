import { useEffect, useRef } from 'react';

// FR-V2-15 / TECH_DEBT H8: focus trap + Esc close + restore-on-close. Used by
// LoginModal, the torrent drawer, and the rules dry-run drawer.

export interface UseFocusTrapOpts {
  active: boolean;
  onEscape?: () => void;
}

/**
 * Traps Tab/Shift-Tab inside the returned ref while `active` is true. Invokes
 * `onEscape` on the Escape key. Restores focus to the previously-active
 * element on deactivate.
 *
 * Usage:
 *   const ref = useFocusTrap<HTMLDivElement>({ active: open, onEscape: close });
 *   return <div ref={ref} role="dialog" aria-modal>…</div>;
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  opts: UseFocusTrapOpts,
): React.RefObject<T> {
  const { active, onEscape } = opts;
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the container on open (if nothing inside is already focused).
    if (!container.contains(document.activeElement)) {
      const first = findFocusable(container)[0];
      first?.focus();
    }

    function handler(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscape?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = findFocusable(container!);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (activeEl === first || !container!.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handler, true);
    return () => {
      document.removeEventListener('keydown', handler, true);
      // Restore focus to the element that had it before the modal opened.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try {
          previouslyFocused.focus();
        } catch {
          /* ignore */
        }
      }
    };
  }, [active, onEscape]);

  return containerRef;
}

const FOCUSABLE_SELECTOR =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function findFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}
