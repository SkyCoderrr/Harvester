import { clsx } from 'clsx';

/**
 * Client-side password strength approximation. Mirrors the backend `scorePassword`
 * shape so the UI signals the same policy the server enforces.
 */

const DENY_PATTERNS = [
  'password',
  'harvester',
  'admin',
  'letmein',
  'qwerty',
  'welcome',
  'abcdef',
  '12345',
  'root',
  'mteam',
  'torrent',
];

const LEET_MAP: Record<string, string> = {
  '4': 'a',
  '@': 'a',
  '3': 'e',
  '!': 'i',
  '1': 'i',
  '0': 'o',
  '5': 's',
  $: 's',
  '7': 't',
};

function unleet(s: string): string {
  return s
    .toLowerCase()
    .split('')
    .map((c) => LEET_MAP[c] ?? c)
    .join('');
}

function evaluatePassword(p: string): {
  score: number;
  missing: string[];
  denyHit: boolean;
} {
  const missing: string[] = [];
  if (p.length < 12) missing.push('at least 12 characters');
  if (!/[a-z]/.test(p)) missing.push('a lowercase letter');
  if (!/[A-Z]/.test(p)) missing.push('an uppercase letter');
  if (!/[0-9]/.test(p)) missing.push('a digit');
  if (!/[^A-Za-z0-9]/.test(p)) missing.push('a symbol');

  let classes = 0;
  if (/[a-z]/.test(p)) classes++;
  if (/[A-Z]/.test(p)) classes++;
  if (/[0-9]/.test(p)) classes++;
  if (/[^A-Za-z0-9]/.test(p)) classes++;

  const normalized = unleet(p);
  const denyHit = DENY_PATTERNS.some((d) => normalized.includes(d));

  let score = 0;
  if (p.length >= 12) score++;
  if (p.length >= 16) score++;
  score += Math.max(0, classes - 2);
  if (denyHit) score = Math.min(score, 1);
  return { score: Math.max(0, Math.min(4, score)), missing, denyHit };
}

export default function PasswordStrengthMeter({ password }: { password: string }): JSX.Element {
  const { score, missing, denyHit } = evaluatePassword(password);
  const tones = ['bg-accent-danger', 'bg-accent-danger', 'bg-accent-warn', 'bg-accent', 'bg-accent-success'];
  const label = ['too weak', 'weak', 'fair', 'good', 'strong'][score];
  return (
    <div className="mt-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={clsx(
              'h-1 flex-1 rounded transition-colors',
              i < score ? tones[score] : 'bg-bg-elev',
            )}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1 text-[10px]">
        <span className="text-text-muted">{label}</span>
        {denyHit && <span className="text-accent-danger">matches a common pattern</span>}
      </div>
      {missing.length > 0 && (
        <ul className="mt-1.5 text-[10px] text-text-muted list-disc list-inside space-y-0.5">
          {missing.map((m) => (
            <li key={m}>needs {m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
