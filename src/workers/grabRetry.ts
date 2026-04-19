import type { Logger } from '../logger/index.js';
import type { Downloader } from './downloader.js';
import { createLoopWorker, type LoopWorker } from './loopWorker.js';

export function createGrabRetryWorker(deps: {
  logger: Logger;
  downloader: Downloader;
}): LoopWorker {
  const { logger, downloader } = deps;
  async function tick(): Promise<void> {
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
