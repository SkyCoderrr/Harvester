import path from 'node:path';
import fs from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import { ZodError } from 'zod';
import type { Logger } from '../logger/index.js';
import type { Db } from '../db/index.js';
import type { EventBus } from '../events/bus.js';
import type { Metrics } from '../observability/metrics.js';
import type { AppConfig } from '../config/schema.js';
import type { ConfigStore } from '../config/store.js';
import type { MTeamClient } from '../mteam/client.js';
import type { QbtClient } from '../qbt/client.js';
import type { ServiceStateStore } from '../services/serviceState.js';
import type { Downloader } from '../workers/downloader.js';
import type { AppPaths } from '../appPaths.js';
import { HarvesterError, ERROR_HTTP_STATUS, normalizeError } from '../errors/index.js';
import { registerHealthRoute } from './routes/health.js';
import { registerDashboardRoute } from './routes/dashboard.js';
import { registerTorrentsRoutes } from './routes/torrents.js';
import { registerRulesRoutes } from './routes/rules.js';
import { registerLogsRoutes } from './routes/logs.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerServiceRoutes } from './routes/service.js';
import { registerFirstRunRoutes } from './routes/firstRun.js';
import { registerMetricsRoute } from './routes/metrics.js';
import { registerStatsRoutes } from './routes/stats.js';
import { registerSseTicketRoute, createSseTicketStore } from './routes/sseTicket.js';
import { createAuthMiddleware } from '../auth/middleware.js';

export interface HttpDeps {
  config: ConfigStore;
  db: Db;
  logger: Logger;
  bus: EventBus;
  metrics: Metrics;
  serviceState: ServiceStateStore;
  mteam: MTeamClient;
  qbt: QbtClient;
  downloader: Downloader;
  paths: AppPaths;
  /** Called after first-run completion to bring workers online without restarting. */
  onFirstRunComplete?: () => Promise<void>;
  /** Bumps the auth cache epoch when the LAN password is rotated. */
  onPasswordChange?: () => void;
  /** Triggers a process exit so the supervisor relaunches with new bind settings. */
  onRestart?: () => void;
  /** FR-V2-37: bring workers online when the user resumes a previously-paused service. */
  onUserResume?: () => Promise<void>;
  /** FR-V2-37: gracefully stop workers when the user pauses. */
  onUserPause?: () => Promise<void>;
  /** Manual trigger — runs an out-of-band poller tick (fresh M-Team search). */
  onPollNow?: () => Promise<void>;
}

export async function createHttpServer(deps: HttpDeps): Promise<FastifyInstance> {
  // FR-V2-06: explicit body cap (256 KiB). Rules routes opt up to 1 MiB
  // per-route since rule-set JSON can be larger.
  const app = Fastify({
    logger: false,
    trustProxy: false,
    disableRequestLogging: true,
    bodyLimit: 256 * 1024,
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(sensible);
  await app.register(cors, { origin: false });

  // Auth preHandler (no-op unless lan_access.password_hash is set).
  const auth = createAuthMiddleware({
    config: deps.config,
    logger: deps.logger,
    bus: deps.bus,
  });
  app.addHook('preHandler', auth.preHandler);
  // Expose epoch bump to callers so password rotation invalidates cached verifications.
  if (deps.onPasswordChange) {
    const userBump = deps.onPasswordChange;
    deps.onPasswordChange = () => {
      auth.bumpEpoch();
      userBump();
    };
  } else {
    deps.onPasswordChange = () => auth.bumpEpoch();
  }

  // Per-request logging + req_id binding
  app.addHook('onRequest', async (req) => {
    (req as unknown as { log: Logger }).log = deps.logger.child({ req_id: req.id });
  });
  app.addHook('onResponse', async (req, reply) => {
    deps.logger.debug(
      {
        component: 'http',
        req_id: req.id,
        method: req.method,
        // FR-V2-08: never let SSE tickets reach access logs.
        url: scrubUrl(req.url),
        status: reply.statusCode,
        duration_ms: reply.elapsedTime,
      },
      'request',
    );
  });

  // FR-V2-13: strict security headers on every response. `script-src 'self'`
  // would break Monaco (which self-hosts from /node_modules via Vite), so we
  // allow `blob:` for worker-src where Monaco spawns its web workers. Inline
  // styles are still permitted for recharts' inlined SVG styles.
  app.addHook('onSend', async (_req, reply, payload) => {
    void reply.header(
      'Content-Security-Policy',
      "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; " +
        "font-src 'self' data:; " +
        "connect-src 'self'; " +
        "worker-src 'self' blob:; " +
        "frame-ancestors 'none'; " +
        "base-uri 'self'",
    );
    void reply.header('X-Frame-Options', 'DENY');
    void reply.header('Referrer-Policy', 'no-referrer');
    void reply.header('X-Content-Type-Options', 'nosniff');
    return payload;
  });

  app.setErrorHandler((err, req, reply) => {
    // FR-V2-01: zod failures from `schema.parse(req.body)` become 400 VALIDATION_FAILED.
    let herr: HarvesterError;
    if (err instanceof HarvesterError) {
      herr = err;
    } else if (err instanceof ZodError) {
      herr = new HarvesterError({
        code: 'VALIDATION_FAILED',
        user_message: 'Request body failed validation.',
        context: { issues: err.issues },
      });
    } else {
      herr = normalizeError(err);
    }
    const status = ERROR_HTTP_STATUS[herr.code] ?? 500;
    deps.logger.warn(
      { component: 'http', req_id: req.id, url: req.url, err: herr },
      'error handler',
    );
    void reply.status(status).send({
      ok: false,
      error: {
        code: herr.code,
        user_message: herr.user_message,
        details: herr.context,
        retryable: herr.retryable,
      },
    });
  });

  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.status(404).send({ ok: false, error: { code: 'NOT_FOUND', user_message: 'Not found.' } });
    }
    // SPA fallback: serve index.html if built, else a JSON placeholder.
    const indexHtml = path.join(deps.paths.migrationsDir, '..', '..', 'web', 'dist', 'index.html');
    if (fs.existsSync(indexHtml)) {
      return reply.type('text/html').send(fs.readFileSync(indexHtml));
    }
    return reply
      .type('text/html')
      .send(
        `<!doctype html><html><head><meta charset="utf-8"><title>Harvester</title></head><body style="font-family:sans-serif;padding:2rem;background:#0a0a0f;color:#fafafa"><h1>Harvester</h1><p>Server running on <code>${req.hostname}</code>. The web UI has not been built yet. Run <code>npm run build:web</code> or <code>npm run dev:web</code>.</p><p><a href="/api/health" style="color:#60a5fa">/api/health</a></p></body></html>`,
      );
  });

  // Serve built frontend if present
  const webDist = resolveWebDist(deps.paths);
  if (webDist && fs.existsSync(webDist)) {
    await app.register(staticPlugin, { root: webDist, prefix: '/' });
  }

  // FR-V2-08: SSE ticket store. Lives for the life of the http server.
  const sseTickets = createSseTicketStore();
  (app as unknown as { sseTickets: typeof sseTickets }).sseTickets = sseTickets;

  // Register API routes
  await app.register(
    async (scope) => {
      registerHealthRoute(scope, deps);
      registerDashboardRoute(scope, deps);
      registerTorrentsRoutes(scope, deps);
      registerRulesRoutes(scope, deps);
      registerLogsRoutes(scope, deps);
      registerSettingsRoutes(scope, deps);
      registerServiceRoutes(scope, deps, sseTickets);
      registerFirstRunRoutes(scope, deps);
      registerMetricsRoute(scope, deps);
      registerStatsRoutes(scope, deps);
      registerSseTicketRoute(scope, deps, sseTickets);
    },
    { prefix: '/api' },
  );

  return app;
}

/**
 * Replace any `ticket=…` and `token=…` query values with REDACTED. Used
 * before any URL is written to the access log. FR-V2-08.
 */
export function scrubUrl(url: string): string {
  return url.replace(/([?&])(ticket|token)=[^&]*/g, '$1$2=REDACTED');
}

function resolveWebDist(paths: AppPaths): string | null {
  const candidates = [
    path.resolve(paths.migrationsDir, '..', '..', 'web', 'dist'),
    path.resolve(process.cwd(), 'web', 'dist'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}
