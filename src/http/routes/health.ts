import type { FastifyInstance } from 'fastify';
import type { HttpDeps } from '../server.js';

export function registerHealthRoute(app: FastifyInstance, deps: HttpDeps): void {
  const bootedAt = Date.now();
  app.get('/health', async () => ({
    ok: true,
    data: {
      status: 'ok' as const,
      uptime_sec: Math.floor((Date.now() - bootedAt) / 1000),
      service_status: deps.serviceState.get().status,
      last_poll_at: deps.serviceState.get().last_poll_at,
      version: '0.1.0',
    },
  }));
}
