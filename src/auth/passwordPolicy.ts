/**
 * Password policy validator (IMPLEMENTATION.md §4.13).
 *
 * Rules:
 *  - length ≥ 12
 *  - 3 of 4 character classes (lowercase, uppercase, digit, symbol)
 *  - not equal to known secrets (mteam key, qbt password)
 *  - not a common weak pattern (password, admin, qwerty, etc.) — including leet variants
 */

const DENYLIST_PATTERNS = [
  'password',
  'harvester',
  'admin',
  'letmein',
  'qwerty',
  'welcome',
  'abcdef',
  '12345',
  '123456',
  '1234567',
  '12345678',
  'administrator',
  'root',
  'mteam',
  'torrent',
];

const LEET_MAP: Record<string, string> = {
  '4': 'a',
  '@': 'a',
  '8': 'b',
  '3': 'e',
  '!': 'i',
  '1': 'i',
  '0': 'o',
  '5': 's',
  $: 's',
  '7': 't',
};

function delete_leet(s: string): string {
  return s
    .toLowerCase()
    .split('')
    .map((c) => LEET_MAP[c] ?? c)
    .join('');
}

export interface PolicyContext {
  mteamApiKey?: string;
  qbtPassword?: string;
}

export function validatePasswordPolicy(
  plain: string,
  context: PolicyContext = {},
): { ok: boolean; reason?: string } {
  if (!plain || plain.length < 12) {
    return { ok: false, reason: 'Password must be at least 12 characters.' };
  }

  let classes = 0;
  if (/[a-z]/.test(plain)) classes++;
  if (/[A-Z]/.test(plain)) classes++;
  if (/[0-9]/.test(plain)) classes++;
  if (/[^A-Za-z0-9]/.test(plain)) classes++;
  if (classes < 3) {
    return {
      ok: false,
      reason: 'Password must include 3 of 4: lowercase, uppercase, digit, symbol.',
    };
  }

  if (context.mteamApiKey && plain === context.mteamApiKey) {
    return { ok: false, reason: 'Password must not equal the M-Team API key.' };
  }
  if (context.qbtPassword && plain === context.qbtPassword) {
    return { ok: false, reason: 'Password must not equal the qBittorrent password.' };
  }

  const normalized = delete_leet(plain);
  for (const deny of DENYLIST_PATTERNS) {
    if (normalized.startsWith(deny) || normalized.includes(deny)) {
      return { ok: false, reason: 'Password matches a common weak pattern.' };
    }
  }

  return { ok: true };
}

/**
 * Returns a 0..4 strength score plus the list of missing requirements. Used by the UI
 * strength meter.
 */
export function scorePassword(plain: string): { score: number; missing: string[] } {
  const missing: string[] = [];
  if (plain.length < 12) missing.push('at least 12 characters');
  if (!/[a-z]/.test(plain)) missing.push('a lowercase letter');
  if (!/[A-Z]/.test(plain)) missing.push('an uppercase letter');
  if (!/[0-9]/.test(plain)) missing.push('a digit');
  if (!/[^A-Za-z0-9]/.test(plain)) missing.push('a symbol');

  let score = 0;
  if (plain.length >= 12) score++;
  if (plain.length >= 16) score++;
  let classes = 0;
  if (/[a-z]/.test(plain)) classes++;
  if (/[A-Z]/.test(plain)) classes++;
  if (/[0-9]/.test(plain)) classes++;
  if (/[^A-Za-z0-9]/.test(plain)) classes++;
  score += Math.min(2, Math.max(0, classes - 2));
  const { ok } = validatePasswordPolicy(plain);
  if (!ok) score = Math.min(score, 2);
  return { score: Math.max(0, Math.min(4, score)), missing };
}
