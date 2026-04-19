import { resolveAppPaths } from './appPaths.js';
import { loadConfig } from './config/load.js';
import { createConfigStore } from './config/store.js';
import { createLogger } from './logger/index.js';
import { openDatabase } from './db/index.js';
import { createEventBus } from './events/bus.js';
import { createMetrics } from './observability/metrics.js';
import { createServiceState } from './services/serviceState.js';
import { runPreflight } from './services/preflight.js';
import { createMTeamClient } from './mteam/client.js';
import { createQbtClient } from './qbt/client.js';
import { migrateRuleSets } from './rules/migrate.js';
import { createHttpServer } from './http/server.js';
import { startWorkers, type WorkerSet } from './workers/index.js';
import { createDownloader } from './workers/downloader.js';
import { normalizeError } from './errors/index.js';
import { benchArgon2 } from './auth/argon2.js';

async function main(): Promise<void> {
  const paths = resolveAppPaths();
  const initialConfig = loadConfig(paths);
  const configStore = createConfigStore(paths, initialConfig);
  const logger = await createLogger(initialConfig, paths);

  logger.info(
    {
      component: 'bootstrap',
      port: initialConfig.port,
      data_dir: paths.dataDir,
      first_run_completed: initialConfig.first_run_completed,
    },
    'harvester starting',
  );

  const db = openDatabase(paths, logger);
  migrateRuleSets(db, logger);

  // TECH_DEBT L1 (V2 drive-by): one-shot argon2 bench. Doesn't block startup —
  // it runs in the background and logs a warning if cost is out of the
  // ≥200 ms target band.
  void benchArgon2()
    .then((ms) => {
      if (ms > 500) {
        logger.warn(
          { component: 'bootstrap', argon2_hash_ms: ms },
          'argon2 hash cost is high — consider lowering memoryCost',
        );
      } else if (ms < 50) {
        logger.warn(
          { component: 'bootstrap', argon2_hash_ms: ms },
          'argon2 hash cost is low — consider raising memoryCost',
        );
      } else {
        logger.info({ component: 'bootstrap', argon2_hash_ms: ms }, 'argon2 bench ok');
      }
    })
    .catch((err) => {
      logger.warn({ component: 'bootstrap', err }, 'argon2 bench failed');
    });

  const bus = createEventBus(logger);
  // Attach DB sink *after* the bus exists so `log.entry` events propagate to SSE.
  logger.attachDbSink(db, bus);
  const metrics = createMetrics();
  const serviceState = createServiceState(db, bus, logger);
  serviceState.dispatch({
    type: 'LAN_BIND_UPDATE',
    enabled: initialConfig.bind_host === '0.0.0.0',
    listening_on: initialConfig.bind_host,
  });

  const mteam = createMTeamClient(configStore, logger, metrics);
  const qbt = createQbtClient(configStore, logger, metrics);

  // Run preflight in the background — don't block startup if M-Team/qBt are transient down.
  let workerSet: WorkerSet | null = null;

  async function ensureWorkersStarted(): Promise<void> {
    const cfg = configStore.get();
    if (!cfg.first_run_completed) return;
    if (workerSet) return;
    // FR-V2-38: persisted user intent gates worker startup. The boot path
    // never overwrites the intent — only an explicit /service/resume does.
    if (serviceState.get().desired_user_intent === 'paused') {
      logger.info(
        { component: 'bootstrap' },
        'workers not started: persisted user intent is paused',
      );
      return;
    }
    const report = await runPreflight({ config: cfg, logger, mteam, qbt });
    serviceState.dispatch({
      type: 'PREFLIGHT_UPDATE',
      preflight: {
        mteam: report.mteam,
        qbt: report.qbt,
        allowed_client: report.allowed_client,
        disk: report.disk,
      },
    });
    if (report.allowed_client) serviceState.dispatch({ type: 'ALLOWED_CLIENT_ACK' });
    if (report.ok) {
      serviceState.dispatch({ type: 'START' });
      workerSet = startWorkers({
        db,
        logger,
        bus,
        metrics,
        config: cfg,
        mteam,
        qbt,
        serviceState,
      });
    } else {
      logger.warn({ component: 'bootstrap', report }, 'workers not started');
    }
  }

  const preflightPromise = ensureWorkersStarted().catch((err) => {
    logger.error({ component: 'bootstrap', err: normalizeError(err) }, 'preflight crashed');
  });

  // A downloader is needed by HTTP routes that may request a manual grab in the future;
  // stand one up even if workers haven't started.
  const downloader = createDownloader({
    db,
    logger,
    bus,
    metrics,
    config: initialConfig,
    mteam,
    qbt,
  });

  // Keep logger secrets in sync with config.
  configStore.on('change', (next) => {
    const secrets: string[] = [];
    if (next.mteam.api_key && !next.mteam.api_key.startsWith('__FIRST_RUN')) {
      secrets.push(next.mteam.api_key);
    }
    if (next.qbt.password && !next.qbt.password.startsWith('__FIRST_RUN')) {
      secrets.push(next.qbt.password);
    }
    try {
      logger.setSecrets(secrets);
    } catch {
      /* ignore */
    }
    serviceState.dispatch({
      type: 'LAN_BIND_UPDATE',
      enabled: next.bind_host === '0.0.0.0',
      listening_on: next.bind_host,
    });
  });

  async function stopWorkers(): Promise<void> {
    if (!workerSet) return;
    try {
      await workerSet.stopAll();
    } catch (err) {
      logger.warn({ component: 'bootstrap', err }, 'stopAll failed during pause');
    }
    workerSet = null;
  }

  const app = await createHttpServer({
    config: configStore,
    db,
    logger,
    bus,
    metrics,
    serviceState,
    mteam,
    qbt,
    downloader,
    paths,
    onFirstRunComplete: ensureWorkersStarted,
    onUserResume: ensureWorkersStarted,
    onUserPause: stopWorkers,
    onRestart: () => {
      logger.info({ component: 'bootstrap' }, 'restart requested');
    },
  });

  try {
    await app.listen({ host: initialConfig.bind_host, port: initialConfig.port });
    logger.info(
      { component: 'bootstrap', address: `http://${initialConfig.bind_host}:${initialConfig.port}` },
      'http listening',
    );
  } catch (err) {
    logger.error({ component: 'bootstrap', err }, 'listen failed');
    process.exit(1);
  }

  await preflightPromise;

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      logger.warn({ signal }, 'second signal — hard exit');
      process.exit(1);
    }
    shuttingDown = true;
    logger.info({ component: 'bootstrap', signal }, 'shutdown begin');
    try {
      await Promise.race([
        (async () => {
          if (workerSet) await workerSet.stopAll();
          await app.close();
          db.close();
        })(),
        new Promise((r) => setTimeout(r, 15_000)),
      ]);
    } catch (err) {
      logger.error({ err }, 'shutdown error');
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => {
    logger.error({ component: 'bootstrap', err }, 'unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logger.error({ component: 'bootstrap', err }, 'uncaughtException');
  });
}

main().catch((err) => {
  console.error('fatal', err);
  process.exit(1);
});
