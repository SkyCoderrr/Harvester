/**
 * Per-IP sliding-window failure counter with lockout. Localhost is exempt (FR-AUTH-05).
 * On N failures within `windowSec`, the IP is locked out for `lockoutSec`.
 */

export interface RateLimiter {
  isLocked(ip: string): { locked: boolean; retryAfterSec: number };
  fail(ip: string): void;
  success(ip: string): void;
  reset(ip?: string): void;
}

export interface RateLimiterOpts {
  maxFailures: number;
  windowSec: number;
  lockoutSec: number;
  now?: () => number;
}

export function createRateLimiter(opts: RateLimiterOpts): RateLimiter {
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  const failures = new Map<string, number[]>();
  const lockouts = new Map<string, number>();

  function pruneFailures(ip: string): number[] {
    const tsList = failures.get(ip) ?? [];
    const cutoff = now() - opts.windowSec;
    const fresh = tsList.filter((t) => t >= cutoff);
    if (fresh.length !== tsList.length) failures.set(ip, fresh);
    return fresh;
  }

  return {
    isLocked(ip) {
      if (isLocalhost(ip)) return { locked: false, retryAfterSec: 0 };
      const until = lockouts.get(ip);
      if (until && until > now()) return { locked: true, retryAfterSec: until - now() };
      if (until && until <= now()) lockouts.delete(ip);
      return { locked: false, retryAfterSec: 0 };
    },
    fail(ip) {
      if (isLocalhost(ip)) return;
      const fresh = pruneFailures(ip);
      fresh.push(now());
      failures.set(ip, fresh);
      if (fresh.length >= opts.maxFailures) {
        lockouts.set(ip, now() + opts.lockoutSec);
      }
    },
    success(ip) {
      failures.delete(ip);
      lockouts.delete(ip);
    },
    reset(ip) {
      if (ip) {
        failures.delete(ip);
        lockouts.delete(ip);
      } else {
        failures.clear();
        lockouts.clear();
      }
    },
  };
}

function isLocalhost(ip: string): boolean {
  if (!ip) return false;
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('127.') ||
    ip === 'localhost'
  );
}
