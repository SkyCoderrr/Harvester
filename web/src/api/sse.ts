import { api } from './client';

// FR-V2-08: SSE endpoints accept ?ticket=… (one-shot, ≤60 s) instead of a
// long-lived bearer in the URL. The bearer never appears in URLs, server
// access logs, or browser history.

export type SseScope = 'service-events' | 'logs';

interface SseTicketResponse {
  ticket: string;
  ttl_sec: number;
}

export async function mintSseTicket(scope: SseScope): Promise<string> {
  const r = await api.post<SseTicketResponse>('/api/sse-ticket', { scope });
  return r.ticket;
}

/**
 * Open an EventSource against `path` after minting a fresh one-shot ticket.
 * Each reconnect must mint a new ticket.
 */
export async function openTicketedEventSource(
  path: string,
  scope: SseScope,
): Promise<EventSource> {
  const ticket = await mintSseTicket(scope);
  const sep = path.includes('?') ? '&' : '?';
  return new EventSource(`${path}${sep}ticket=${encodeURIComponent(ticket)}`);
}
