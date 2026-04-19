/** Tiny retry helper with exponential backoff. No external deps. */

export interface RetryOptions {
  attempts: number;
  baseMs: number;
  factor?: number;
  maxMs?: number;
  /** Return true to retry, false to surface the error immediately. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  onAttempt?: (attempt: number, err: unknown) => void;
  signal?: AbortSignal;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const factor = opts.factor ?? 2;
  const maxMs = opts.maxMs ?? 30_000;
  let lastErr: unknown;
  for (let i = 1; i <= opts.attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (opts.onAttempt) opts.onAttempt(i, err);
      if (opts.shouldRetry && !opts.shouldRetry(err, i)) throw err;
      if (i >= opts.attempts) throw err;
      // FR-V2-12 / TECH_DEBT H6: full-jitter backoff. Adds 0..baseMs of
      // randomness so concurrent retriers don't synchronize.
      const pure = Math.min(opts.baseMs * factor ** (i - 1), maxMs);
      const delay = pure + Math.floor(Math.random() * opts.baseMs);
      await sleep(delay, opts.signal);
    }
  }
  throw lastErr;
}

/**
 * Compute a jittered delay (FR-V2-12). Standalone so worker timer loops can
 * use it directly.
 */
export function backoffDelay(attempt: number, base = 1000, cap = 60_000): number {
  const pure = Math.min(cap, base * 2 ** attempt);
  return pure + Math.floor(Math.random() * base);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    const to = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(to);
      reject(new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
