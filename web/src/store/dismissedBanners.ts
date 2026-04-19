import { create } from 'zustand';

// FR-V2-23: persisted dismissal keys for AccountHealthBanner. A banner stays
// dismissed until the condition-hash OR the snapshot ts advances past the
// recorded key. sessionStorage is fine — users don't need this to persist
// across browser restarts, and a reboot is a signal to show again.

interface DismissedState {
  keys: Set<string>;
  dismiss: (key: string) => void;
  has: (key: string) => boolean;
}

const STORAGE_KEY = 'harvester.dismissedBanners';

function load(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function save(keys: Set<string>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(keys)));
  } catch {
    /* ignore quota / private mode */
  }
}

export const useDismissedBanners = create<DismissedState>((set, get) => ({
  keys: load(),
  dismiss(key) {
    const next = new Set(get().keys);
    next.add(key);
    save(next);
    set({ keys: next });
  },
  has(key) {
    return get().keys.has(key);
  },
}));
