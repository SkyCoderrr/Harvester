import { create } from 'zustand';
import { toast as sonnerToast } from 'sonner';

// Migrated toast layer. Sonner owns rendering now; this module keeps the
// domain-specific muting store + the `toast.*` helper so existing call sites
// don't need to change. Category mute state still lives in localStorage and
// is surfaced by the Settings → Notifications UI.

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
  {
    key: 'config',
    label: 'Config updates',
    description: 'Settings changes saved to disk (M-Team key, qBt credentials, …).',
  },
];

interface MuteStore {
  mutedCategories: Set<string>;
  muteCategory(category: string, muted: boolean): void;
}

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

export const useToastStore = create<MuteStore>((set) => ({
  mutedCategories: loadMuted(),
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

function shouldSkip(category?: string): boolean {
  if (!category) return false;
  return useToastStore.getState().mutedCategories.has(category);
}

export const toast = {
  info(title: string, message?: string, category?: string): void {
    if (shouldSkip(category)) return;
    sonnerToast.info(title, message ? { description: message } : undefined);
  },
  success(title: string, message?: string, category?: string): void {
    if (shouldSkip(category)) return;
    sonnerToast.success(title, message ? { description: message } : undefined);
  },
  warn(title: string, message?: string, category?: string): void {
    if (shouldSkip(category)) return;
    sonnerToast.warning(title, message ? { description: message } : undefined);
  },
  error(title: string, message?: string, category?: string): void {
    if (shouldSkip(category)) return;
    sonnerToast.error(title, {
      ...(message ? { description: message } : {}),
      // Errors stick around longer than the 4s default.
      duration: 12_000,
    });
  },
};
