import type { Logger } from '../logger/index.js';
import type { ServiceStateStore } from '../services/serviceState.js';
import type { Downloader } from './downloader.js';
import { createLoopWorker, type LoopWorker } from './loopWorker.js';

export function createGrabRetryWorker(deps: {
  logger: Logger;
  downloader: Downloader;
  serviceState: ServiceStateStore;
}): LoopWorker {
  const { logger, downloader, serviceState } = deps;
  async function tick(): Promise<void> {
    // Mirror the poller's gate: retrying queued grabs while the user has
    // paused would defeat the point. Keep ticking (so we don't desynchronize
    // with other workers) but no-op when paused.
    const svc = serviceState.get();
    if (svc.status !== 'RUNNING') return;
    await downloader.drainQueued();
  }
  return createLoopWorker({
    name: 'grabRetry',
    intervalMs: () => 30_000,
    tick,
    logger,
    runOnStart: false,
  });
}
