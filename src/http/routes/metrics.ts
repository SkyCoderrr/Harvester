import type { FastifyInstance } from 'fastify';
import type { HttpDeps } from '../server.js';
import { renderPrometheus } from '../../observability/prom.js';

// FR-V2-48: content-negotiated exposition. Default is the existing JSON
// snapshot; `Accept: text/plain` returns Prometheus exposition format.
export function registerMetricsRoute(app: FastifyInstance, deps: HttpDeps): void {
  app.get('/metrics', async (req, reply) => {
    const accept = String(req.headers['accept'] ?? '').toLowerCase();
    if (accept.includes('text/plain') || accept.includes('openmetrics')) {
      const body = renderPrometheus(deps.metrics);
      return reply
        .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
        .send(body);
    }
    return { ok: true, data: deps.metrics.snapshot() };
  });
}
