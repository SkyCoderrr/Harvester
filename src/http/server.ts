import path from 'node:path';
import fs from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
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
}

export async function createHttpServer(deps: HttpDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: false,
    disableRequestLogging: true,
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
        url: req.url,
        status: reply.statusCode,
        duration_ms: reply.elapsedTime,
      },
      'request',
    );
  });

  app.setErrorHandler((err, req, reply) => {
    const herr = err instanceof HarvesterError ? err : normalizeError(err);
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

  // Register API routes
  await app.register(
    async (scope) => {
      registerHealthRoute(scope, deps);
      registerDashboardRoute(scope, deps);
      registerTorrentsRoutes(scope, deps);
      registerRulesRoutes(scope, deps);
      registerLogsRoutes(scope, deps);
      registerSettingsRoutes(scope, deps);
      registerServiceRoutes(scope, deps);
      registerFirstRunRoutes(scope, deps);
      registerMetricsRoute(scope, deps);
      registerStatsRoutes(scope, deps);
    },
    { prefix: '/api' },
  );

  return app;
}

function resolveWebDist(paths: AppPaths): string | null {
  const candidates = [
    path.resolve(paths.migrationsDir, '..', '..', 'web', 'dist'),
    path.resolve(process.cwd(), 'web', 'dist'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}
