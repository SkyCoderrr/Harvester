import type { FastifyInstance } from 'fastify';
import type { HttpDeps } from '../server.js';

export function registerMetricsRoute(app: FastifyInstance, deps: HttpDeps): void {
  app.get('/metrics', async () => ({ ok: true, data: deps.metrics.snapshot() }));
}
