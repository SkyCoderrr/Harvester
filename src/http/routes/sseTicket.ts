import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { HttpDeps } from '../server.js';
import { sseTicketBody } from '../schemas/service.js';

// FR-V2-07 / FR-V2-08: a short-lived (≤60 s) one-shot opaque ticket replaces
// the long-lived bearer-via-?token=… path on SSE endpoints. The ticket is
// minted by an authenticated POST /api/sse-ticket and consumed once on the
// SSE URL via ?ticket=…. The bearer never appears in URLs or referer headers.

export type SseScope = 'service-events' | 'logs';

export interface SseTicketStore {
  mint(scope: SseScope): string;
  consume(ticket: string, scope: SseScope): boolean;
  /** Test-only: count of live (un-expired) tickets. */
  size(): number;
  /** Stop the periodic sweep. Idempotent. */
  dispose(): void;
}

export function createSseTicketStore(opts?: { ttlMs?: number }): SseTicketStore {
  const ttlMs = opts?.ttlMs ?? 60_000;
  const tickets = new Map<string, { expires: number; scope: SseScope }>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of tickets) if (v.expires < now) tickets.delete(k);
  }, 30_000);
  // Don't keep the process alive for the sake of the sweep timer.
  sweep.unref?.();

  return {
    mint(scope) {
      const id = randomBytes(24).toString('base64url');
      tickets.set(id, { expires: Date.now() + ttlMs, scope });
      return id;
    },
    consume(ticket, scope) {
      const t = tickets.get(ticket);
      if (!t) return false;
      tickets.delete(ticket); // one-shot
      if (t.expires < Date.now()) return false;
      if (t.scope !== scope) return false;
      return true;
    },
    size() {
      const now = Date.now();
      let n = 0;
      for (const v of tickets.values()) if (v.expires >= now) n++;
      return n;
    },
    dispose() {
      clearInterval(sweep);
      tickets.clear();
    },
  };
}

export function registerSseTicketRoute(
  app: FastifyInstance,
  deps: HttpDeps,
  store: SseTicketStore,
): void {
  app.post('/sse-ticket', async (req) => {
    const { scope } = sseTicketBody.parse(req.body);
    const ticket = store.mint(scope);
    return { ok: true, data: { ticket, ttl_sec: 60 } };
  });
  // Make sure the sweep timer is cleaned up on Fastify close.
  app.addHook('onClose', async () => store.dispose());
}
