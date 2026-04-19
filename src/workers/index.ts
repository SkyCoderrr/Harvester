import type { Logger } from '../logger/index.js';
import type { Db } from '../db/index.js';
import type { EventBus } from '../events/bus.js';
import type { Metrics } from '../observability/metrics.js';
import type { AppConfig } from '../config/schema.js';
import type { MTeamClient } from '../mteam/client.js';
import type { QbtClient } from '../qbt/client.js';
import type { ServiceStateStore } from '../services/serviceState.js';
import { createPoller } from './poller.js';
import { createLifecycleWorker } from './lifecycle.js';
import { createProfileProbeWorker } from './profileProbe.js';
import { createTransferProbeWorker } from './transferProbe.js';
import { createStatsDailyRollupWorker } from './statsDailyRollup.js';
import { createEmergencyMonitor } from './emergencyMonitor.js';
import { createGrabRetryWorker } from './grabRetry.js';
import { createDownloader, type Downloader } from './downloader.js';
import type { LoopWorker } from './loopWorker.js';

export interface WorkerSet {
  workers: LoopWorker[];
  downloader: Downloader;
  stopAll(): Promise<void>;
}

export function startWorkers(deps: {
  db: Db;
  logger: Logger;
  bus: EventBus;
  metrics: Metrics;
  config: AppConfig;
  mteam: MTeamClient;
  qbt: QbtClient;
  serviceState: ServiceStateStore;
}): WorkerSet {
  const downloader = createDownloader(deps);
  const poller = createPoller({ ...deps, downloader });
  const lifecycle = createLifecycleWorker(deps);
  const profile = createProfileProbeWorker(deps);
  const transfer = createTransferProbeWorker({ db: deps.db, logger: deps.logger, qbt: deps.qbt });
  const statsDaily = createStatsDailyRollupWorker({
    db: deps.db,
    logger: deps.logger,
    qbt: deps.qbt,
  });
  const emergency = createEmergencyMonitor(deps);
  const grabRetry = createGrabRetryWorker({
    logger: deps.logger,
    downloader,
    serviceState: deps.serviceState,
  });

  const workers = [poller, lifecycle, profile, transfer, statsDaily, emergency, grabRetry];
  for (const w of workers) w.start();
  deps.logger.info({ component: 'workers' }, 'workers started');

  return {
    workers,
    downloader,
    async stopAll() {
      await Promise.all(workers.map((w) => w.stop()));
      deps.logger.info({ component: 'workers' }, 'workers stopped');
    },
  };
}
