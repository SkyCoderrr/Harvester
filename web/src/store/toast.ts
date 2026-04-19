import { create } from 'zustand';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warn' | 'error';
  title: string;
  message?: string;
  createdAt: number;
  /** Category key for mute/filter; e.g. 'grab.success', 'grab.failed', 'auth'. */
  category?: string;
}

/**
 * Known toast categories. Listed in Settings → Notifications so the user can mute
 * categories they don't want to see even if none have fired yet.
 */
export const TOAST_CATEGORIES: Array<{ key: string; label: string; description: string }> = [
  {
    key: 'grab.success',
    label: 'Grab success',
    description: 'A rule matched and the torrent was added to qBittorrent.',
  },
  {
    key: 'grab.failed',
    label: 'Grab failed',
    description: 'A grab attempt errored (qBt unreachable, token expired).',
  },
  {
    key: 'lifecycle.removed',
    label: 'Lifecycle removed',
    description: 'A torrent was auto-removed (seed-time, zero peers, discount flip).',
  },
  {
    key: 'emergency',
    label: 'Emergency pause',
    description: 'Poller paused because ratio dropped below tier minimum.',
  },
  { key: 'bulk', label: 'Bulk actions', description: 'Result of bulk pause/resume/remove.' },
  {
    key: 'lan',
    label: 'LAN access',
    description: 'LAN-binding + password changes that require a restart.',
  },
  {
    key: 'auth',
    label: 'Authentication',
    description: 'Failed sign-in attempts, rate-limit lockouts.',
  },
];

interface ToastStore {
  items: Toast[];
  mutedCategories: Set<string>;
  push(t: Omit<Toast, 'id' | 'createdAt'>): void;
  dismiss(id: number): void;
  muteCategory(category: string, muted: boolean): void;
}

let nextId = 1;
const PERSIST_KEY = 'harvester:toast:muted';

function loadMuted(): Set<string> {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function persistMuted(s: Set<string>): void {
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

export const useToastStore = create<ToastStore>((set, get) => ({
  items: [],
  mutedCategories: loadMuted(),
  push(t) {
    const muted = get().mutedCategories;
    if (t.category && muted.has(t.category)) return;
    const id = nextId++;
    set((s) => ({ items: [...s.items, { ...t, id, createdAt: Date.now() }] }));
    // Auto-dismiss after 6s (errors stick around 12s)
    const ttl = t.kind === 'error' ? 12_000 : 6_000;
    setTimeout(() => {
      set((s) => ({ items: s.items.filter((x) => x.id !== id) }));
    }, ttl);
  },
  dismiss(id) {
    set((s) => ({ items: s.items.filter((x) => x.id !== id) }));
  },
  muteCategory(category, muted) {
    set((s) => {
      const next = new Set(s.mutedCategories);
      if (muted) next.add(category);
      else next.delete(category);
      persistMuted(next);
      return { mutedCategories: next };
    });
  },
}));

/** Helper wrapper for common toast shapes. */
export const toast = {
  info(title: string, message?: string, category?: string): void {
    useToastStore.getState().push({ kind: 'info', title, message, category });
  },
  success(title: string, message?: string, category?: string): void {
    useToastStore.getState().push({ kind: 'success', title, message, category });
  },
  warn(title: string, message?: string, category?: string): void {
    useToastStore.getState().push({ kind: 'warn', title, message, category });
  },
  error(title: string, message?: string, category?: string): void {
    useToastStore.getState().push({ kind: 'error', title, message, category });
  },
};
