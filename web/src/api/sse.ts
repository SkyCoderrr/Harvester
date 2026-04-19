import { api } from './client';

// FR-V2-08: SSE endpoints accept ?ticket=… (one-shot, ≤60 s) instead of a
// long-lived bearer in the URL.
//
// FR-V2-57: reconnection uses capped exponential backoff with jitter, not
// the browser's default "instant retry after each error" behavior. Callers
// get a small handle that owns the current EventSource and manages the
// reconnect loop.

export type SseScope = 'service-events' | 'logs';

interface SseTicketResponse {
  ticket: string;
  ttl_sec: number;
}

export async function mintSseTicket(scope: SseScope): Promise<string> {
  const r = await api.post<SseTicketResponse>('/api/sse-ticket', { scope });
  return r.ticket;
}

export interface TicketedSseHandle {
  /** True while the underlying EventSource is alive. */
  open: boolean;
  /** Stop reconnecting and close the current EventSource. */
  close(): void;
}

export interface OpenSseOpts {
  /** Fires each time a fresh EventSource connects. Attach listeners here. */
  onOpen?: (es: EventSource) => void;
  /** Fires when the stream errors or disconnects; transient unless `fatal`. */
  onError?: (e: Event, fatal: boolean) => void;
}

/**
 * Open a ticket-authenticated SSE stream that reconnects with capped
 * exponential backoff + jitter. Base 500 ms, cap 30 s. Ticket is minted fresh
 * on every (re)connect — the old one-shot is already consumed.
 */
export async function openTicketedSse(
  path: string,
  scope: SseScope,
  opts: OpenSseOpts = {},
): Promise<TicketedSseHandle> {
  let attempt = 0;
  let current: EventSource | null = null;
  let closed = false;
  const handle: TicketedSseHandle = {
    get open() {
      return current != null && !closed;
    },
    close() {
      closed = true;
      current?.close();
      current = null;
    },
  };

  async function connect(): Promise<void> {
    if (closed) return;
    let ticket: string;
    try {
      ticket = await mintSseTicket(scope);
    } catch (err) {
      opts.onError?.(new Event('ticket-failed'), false);
      schedule();
      return;
    }
    if (closed) return;
    const sep = path.includes('?') ? '&' : '?';
    const es = new EventSource(`${path}${sep}ticket=${encodeURIComponent(ticket)}`);
    current = es;
    es.onopen = () => {
      attempt = 0;
      opts.onOpen?.(es);
    };
    es.onerror = (ev) => {
      // The browser will reconnect on its own using the same URL — but our
      // ticket is one-shot, so that retry will 401. Close, backoff, retry
      // with a fresh ticket instead.
      const wasOpen = es.readyState === EventSource.OPEN;
      es.close();
      if (current === es) current = null;
      opts.onError?.(ev, closed);
      if (closed) return;
      if (!wasOpen) attempt++;
      schedule();
    };
  }

  function schedule(): void {
    if (closed) return;
    const base = 500;
    const cap = 30_000;
    const pure = Math.min(cap, base * 2 ** attempt);
    const delay = pure + Math.floor(Math.random() * base);
    setTimeout(() => {
      void connect();
    }, delay);
  }

  await connect();
  return handle;
}

/**
 * Legacy helper kept for any caller that wants a one-shot EventSource
 * without managed reconnect.
 */
export async function openTicketedEventSource(
  path: string,
  scope: SseScope,
): Promise<EventSource> {
  const ticket = await mintSseTicket(scope);
  const sep = path.includes('?') ? '&' : '?';
  return new EventSource(`${path}${sep}ticket=${encodeURIComponent(ticket)}`);
}
