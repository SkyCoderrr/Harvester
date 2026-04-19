import type { Logger } from '../logger/index.js';

export interface LoopWorker {
  readonly name: string;
  start(): void;
  stop(): Promise<void>;
  tick(): Promise<void>;
  readonly nextTickAt: number;
}

export interface LoopWorkerOpts {
  name: string;
  intervalMs: () => number;
  tick: () => Promise<void>;
  onWakeFromSleep?: () => Promise<void>;
  logger: Logger;
  /** Run tick once immediately on start. Defaults to true. */
  runOnStart?: boolean;
}

/**
 * Base worker — recursive setTimeout with sleep/wake detection + in-flight guard.
 * Swallows tick errors into a WARN log so the worker keeps running.
 */
export function createLoopWorker(opts: LoopWorkerOpts): LoopWorker {
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let running = false;
  let lastTickWallMs = 0;
  let nextTickAt = 0;
  const logger = opts.logger.child({ component: 'worker', worker: opts.name });

  async function runTick(): Promise<void> {
    if (stopped) return;
    if (running) return;
    running = true;
    try {
      const wallDelta = lastTickWallMs ? Date.now() - lastTickWallMs : 0;
      const interval = opts.intervalMs();
      if (wallDelta > 0 && wallDelta > interval * 3 && opts.onWakeFromSleep) {
        logger.info({ wallDelta, interval }, 'detected sleep/wake, running catch-up');
        try {
          await opts.onWakeFromSleep();
        } catch (err) {
          logger.warn({ err }, 'onWakeFromSleep threw');
        }
      }
      lastTickWallMs = Date.now();
      await opts.tick();
    } catch (err) {
      logger.warn({ err }, 'tick threw');
    } finally {
      running = false;
      schedule();
    }
  }

  function schedule(): void {
    if (stopped) return;
    const ms = Math.max(100, opts.intervalMs());
    nextTickAt = Date.now() + ms;
    timer = setTimeout(() => {
      void runTick();
    }, ms);
  }

  return {
    name: opts.name,
    get nextTickAt() {
      return nextTickAt;
    },
    start() {
      if (timer) return;
      stopped = false;
      if (opts.runOnStart !== false) {
        lastTickWallMs = Date.now();
        void runTick();
      } else {
        schedule();
      }
    },
    async stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      // Wait for any in-flight tick to complete (up to 15s)
      const deadline = Date.now() + 15_000;
      while (running && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
      }
    },
    async tick() {
      await runTick();
    },
  };
}
