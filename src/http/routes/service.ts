import type { FastifyInstance } from 'fastify';
import type { HttpDeps } from '../server.js';
import type { SseTicketStore } from './sseTicket.js';
import { emptyServiceBody } from '../schemas/service.js';

export function registerServiceRoutes(
  app: FastifyInstance,
  deps: HttpDeps,
  sseTickets: SseTicketStore,
): void {
  app.get('/service/state', async () => ({ ok: true, data: deps.serviceState.get() }));

  app.post('/service/pause', async (req) => {
    emptyServiceBody.parse(req.body);
    deps.serviceState.dispatch({ type: 'USER_PAUSE' });
    if (deps.onUserPause) {
      try {
        await deps.onUserPause();
      } catch (err) {
        deps.logger.warn({ component: 'service', err }, 'onUserPause hook failed');
      }
    }
    return { ok: true, data: { status: deps.serviceState.get().status } };
  });

  app.post('/service/resume', async (req) => {
    emptyServiceBody.parse(req.body);
    deps.serviceState.dispatch({ type: 'USER_RESUME' });
    if (deps.onUserResume) {
      try {
        await deps.onUserResume();
      } catch (err) {
        deps.logger.warn({ component: 'service', err }, 'onUserResume hook failed');
      }
    }
    return { ok: true, data: { status: deps.serviceState.get().status } };
  });

  app.post('/service/restart', async (req) => {
    emptyServiceBody.parse(req.body);
    // FR-V2-37: restart MUST preserve user intent. We don't touch
    // desired_user_intent here; the boot path reads it on the next launch.
    setTimeout(() => {
      deps.onRestart?.();
      setTimeout(() => process.exit(0), 100);
    }, 200);
    return { ok: true, data: { ok: true, message: 'Restarting…' } };
  });

  // FR-V2-08: SSE handlers consume a one-shot ticket from ?ticket=… instead
  // of accepting a long-lived bearer token.
  app.get('/service/events', async (req, reply) => {
    const q = req.query as { ticket?: string } | undefined;
    if (!q?.ticket || !sseTickets.consume(q.ticket, 'service-events')) {
      return reply.status(401).send({
        ok: false,
        error: {
          code: 'AUTH_UNAUTHENTICATED',
          user_message: 'A valid SSE ticket is required.',
        },
      });
    }

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders?.();

    const write = (type: string, payload: unknown): void => {
      try {
        reply.raw.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
      } catch {
        // Write failed — peer most likely closed. Fall through to cleanup.
        cleanup();
      }
    };
    write('hello', { status: deps.serviceState.get().status });
    const off = deps.bus.onAny((ev) => {
      write(ev.type, ev);
    });
    const hb = setInterval(() => {
      try {
        reply.raw.write(': hb\n\n');
      } catch {
        cleanup();
      }
    }, 15000);

    let cleanedUp = false;
    function cleanup(): void {
      if (cleanedUp) return;
      cleanedUp = true;
      clearInterval(hb);
      off();
    }
    req.raw.on('close', cleanup);
    reply.raw.on('error', cleanup);
    return reply;
  });

  app.get('/logs/stream', async (req, reply) => {
    const q = req.query as { ticket?: string } | undefined;
    if (!q?.ticket || !sseTickets.consume(q.ticket, 'logs')) {
      return reply.status(401).send({
        ok: false,
        error: {
          code: 'AUTH_UNAUTHENTICATED',
          user_message: 'A valid SSE ticket is required.',
        },
      });
    }

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders?.();

    let cleanedUp = false;
    function cleanup(): void {
      if (cleanedUp) return;
      cleanedUp = true;
      clearInterval(hb);
      off();
    }
    const off = deps.bus.on('log.entry', (ev) => {
      try {
        reply.raw.write(`event: log\ndata: ${JSON.stringify(ev.row)}\n\n`);
      } catch {
        cleanup();
      }
    });
    const hb = setInterval(() => {
      try {
        reply.raw.write(': hb\n\n');
      } catch {
        cleanup();
      }
    }, 15000);
    req.raw.on('close', cleanup);
    reply.raw.on('error', cleanup);
    return reply;
  });
}
