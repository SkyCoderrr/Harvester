import { describe, it, expect } from 'vitest';
import { withRetry, backoffDelay } from './retry.js';

// Phase-1 test for FR-V2-12 jitter and the retry driver.

describe('backoffDelay', () => {
  it('grows with attempt (monotonic base)', () => {
    const d0 = backoffDelay(0, 1000, 60_000);
    const d3 = backoffDelay(3, 1000, 60_000);
    expect(d3).toBeGreaterThan(d0);
  });

  it('is capped at cap + base jitter', () => {
    const d = backoffDelay(20, 1000, 5_000);
    // Pure = min(cap, 1000 * 2^20) = 5000. Add up to 1000 jitter.
    expect(d).toBeGreaterThanOrEqual(5000);
    expect(d).toBeLessThan(6001);
  });

  it('produces varied values across calls (jitter is nonzero)', () => {
    const samples = new Set<number>();
    for (let i = 0; i < 20; i++) samples.add(backoffDelay(2, 1000));
    expect(samples.size).toBeGreaterThan(1);
  });
});

describe('withRetry', () => {
  it('retries on throw and returns the eventual value', async () => {
    let n = 0;
    const v = await withRetry(
      async () => {
        n++;
        if (n < 3) throw new Error('nope');
        return 'ok';
      },
      { attempts: 5, baseMs: 1 },
    );
    expect(v).toBe('ok');
    expect(n).toBe(3);
  });

  it('stops retrying when shouldRetry returns false', async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new Error('fatal');
        },
        { attempts: 5, baseMs: 1, shouldRetry: () => false },
      ),
    ).rejects.toThrow('fatal');
    expect(n).toBe(1);
  });

  it('surfaces the last error after exhausting attempts', async () => {
    await expect(
      withRetry(
        async () => {
          throw new Error('still broken');
        },
        { attempts: 2, baseMs: 1 },
      ),
    ).rejects.toThrow('still broken');
  });
});
