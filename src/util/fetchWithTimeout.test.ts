import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithTimeout, FetchTimeoutError } from './fetchWithTimeout.js';

// Phase-1 minimal test for the timeout wrapper. We stub global fetch so no
// network I/O happens.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchWithTimeout', () => {
  it('returns the response when fetch resolves within the total budget', async () => {
    const fakeRes = new Response('ok');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeRes),
    );
    const res = await fetchWithTimeout('http://example.test', { totalTimeoutMs: 1000 });
    expect(res).toBe(fakeRes);
  });

  it('aborts with FetchTimeoutError past the total budget', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(
              (init.signal as AbortSignal).reason ??
                new FetchTimeoutError(String(_url), 0, 0, 'total'),
            );
          });
        });
      }),
    );
    const start = Date.now();
    await expect(
      fetchWithTimeout('http://slow.test', { totalTimeoutMs: 80 }),
    ).rejects.toMatchObject({ name: 'FetchTimeoutError', kind: 'total' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(70);
    expect(elapsed).toBeLessThan(800);
  });

  it('forwards the caller-supplied AbortSignal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }),
    );
    const ctl = new AbortController();
    const p = fetchWithTimeout('http://x.test', { signal: ctl.signal });
    ctl.abort();
    await expect(p).rejects.toThrow(/abort/i);
  });
});
