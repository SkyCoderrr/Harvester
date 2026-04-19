import type { FastifyInstance } from 'fastify';
import type { HttpDeps } from '../server.js';

export function registerServiceRoutes(app: FastifyInstance, deps: HttpDeps): void {
  app.get('/service/state', async () => ({ ok: true, data: deps.serviceState.get() }));

  app.post('/service/pause', async () => {
    deps.serviceState.dispatch({ type: 'USER_PAUSE' });
    return { ok: true, data: { status: deps.serviceState.get().status } };
  });

  app.post('/service/resume', async () => {
    deps.serviceState.dispatch({ type: 'USER_RESUME' });
    return { ok: true, data: { status: deps.serviceState.get().status } };
  });

  app.post('/service/restart', async () => {
    // Flush response before exiting so the browser learns restart is in progress.
    setTimeout(() => {
      deps.onRestart?.();
      setTimeout(() => process.exit(0), 100);
    }, 200);
    return { ok: true, data: { ok: true, message: 'Restarting…' } };
  });

  // SSE stream
  app.get('/service/events', async (req, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders?.();

    const write = (type: string, payload: unknown) => {
      reply.raw.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
    };
    write('hello', { status: deps.serviceState.get().status });
    const off = deps.bus.onAny((ev) => {
      write(ev.type, ev);
    });
    const hb = setInterval(() => {
      try {
        reply.raw.write(': hb\n\n');
      } catch {
        /* ignore */
      }
    }, 15000);
    req.raw.on('close', () => {
      clearInterval(hb);
      off();
    });
    return reply;
  });

  app.get('/logs/stream', async (req, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders?.();
    const off = deps.bus.on('log.entry', (ev) => {
      reply.raw.write(`event: log\ndata: ${JSON.stringify(ev.row)}\n\n`);
    });
    const hb = setInterval(() => {
      try {
        reply.raw.write(': hb\n\n');
      } catch {
        /* ignore */
      }
    }, 15000);
    req.raw.on('close', () => {
      clearInterval(hb);
      off();
    });
    return reply;
  });
}
