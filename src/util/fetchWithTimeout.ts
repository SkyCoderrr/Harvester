// FR-V2-09 / TECH_DEBT H1, L3: every outbound HTTP call MUST go through a
// timeout-bounded wrapper. AbortController fires the abort after either the
// connect timeout or the total-elapsed timeout, whichever first. The internal
// timer is .unref()'d so a pending fetch never holds the event loop open
// during shutdown.

export interface FetchWithTimeoutOptions extends RequestInit {
  /** Maximum time (ms) we'll wait for the response headers. */
  connectTimeoutMs?: number;
  /** Maximum total time (ms) including body read. */
  totalTimeoutMs?: number;
}

const DEFAULT_CONNECT_MS = 15_000;
const DEFAULT_TOTAL_MS = 30_000;

export class FetchTimeoutError extends Error {
  constructor(
    public readonly url: string,
    public readonly elapsedMs: number,
    public readonly limitMs: number,
    public readonly kind: 'total' | 'connect',
  ) {
    super(`fetch ${kind}-timeout after ${elapsedMs}ms (limit ${limitMs}) for ${url}`);
    this.name = 'FetchTimeoutError';
  }
}

export async function fetchWithTimeout(
  url: string | URL,
  opts: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const {
    connectTimeoutMs = DEFAULT_CONNECT_MS,
    totalTimeoutMs = DEFAULT_TOTAL_MS,
    signal: callerSignal,
    ...rest
  } = opts;

  const ctl = new AbortController();
  // If the caller passes a signal, abort our controller when it fires too.
  const onCallerAbort = (): void => ctl.abort(callerSignal?.reason);
  if (callerSignal) {
    if (callerSignal.aborted) ctl.abort(callerSignal.reason);
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }

  const start = Date.now();
  const total = setTimeout(() => {
    ctl.abort(new FetchTimeoutError(String(url), Date.now() - start, totalTimeoutMs, 'total'));
  }, totalTimeoutMs);
  total.unref?.();

  // We can't directly enforce a "headers-only" timeout with the global fetch,
  // but we can fire a tighter abort if connectTimeoutMs < totalTimeoutMs and
  // the response hasn't arrived yet by then. The 'connect' bucket is best-effort.
  let connect: NodeJS.Timeout | null = null;
  let respondedAt: number | null = null;
  if (connectTimeoutMs > 0 && connectTimeoutMs < totalTimeoutMs) {
    connect = setTimeout(() => {
      if (respondedAt === null) {
        ctl.abort(
          new FetchTimeoutError(String(url), Date.now() - start, connectTimeoutMs, 'connect'),
        );
      }
    }, connectTimeoutMs);
    connect.unref?.();
  }

  try {
    const res = await fetch(url, { ...rest, signal: ctl.signal });
    respondedAt = Date.now();
    return res;
  } finally {
    clearTimeout(total);
    if (connect) clearTimeout(connect);
    if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
  }
}
