import type { Logger } from '../logger/index.js';
import type { ConfigStore } from '../config/store.js';
import type { EventBus, DomainEvent } from '../events/bus.js';
import { fetchWithTimeout } from '../util/fetchWithTimeout.js';
import { backoffDelay } from '../util/retry.js';

// FR-V2-43 / FR-V2-44 / FR-V2-45: out-of-band webhook delivery. The
// dispatcher subscribes to the same bus events that drive in-app toasts;
// per config it fans them out to Discord / Telegram / ntfy / generic JSON
// endpoints. Failures are logged and retried up to 3× with jittered
// exponential backoff. Delivery MUST NOT block the originating event
// handler — every POST runs on its own microtask chain.

type Category =
  | 'grab_success'
  | 'grab_failed'
  | 'emergency'
  | 'account_warning'
  | 'preflight'
  | 'lifecycle'
  | 'error';

interface Target {
  url: string;
  kind: 'discord' | 'telegram' | 'ntfy' | 'generic';
}

interface EventDigest {
  title: string;
  body: string;
}

/**
 * Map a domain event onto (category, digest). Returns null for events we
 * don't forward (poll.started / poll.finished are too chatty, service.state
 * changes are handled by a different category, etc.).
 */
function digest(ev: DomainEvent): { category: Category; digest: EventDigest } | null {
  switch (ev.type) {
    case 'torrent.grab.success':
      return {
        category: 'grab_success',
        digest: { title: 'Grab success', body: ev.name },
      };
    case 'torrent.grab.failed':
      return {
        category: 'grab_failed',
        digest: {
          title: 'Grab failed',
          body: `${ev.mteam_id}: ${ev.error.user_message}`,
        },
      };
    case 'emergency.triggered':
      return {
        category: 'emergency',
        digest: {
          title: 'Ratio emergency triggered',
          body: `ratio=${ev.ratio.toFixed(3)} tier_min=${ev.tier_min}`,
        },
      };
    case 'emergency.cleared':
      return {
        category: 'emergency',
        digest: { title: 'Ratio emergency cleared', body: 'Poller resuming.' },
      };
    case 'poll.failed':
      return {
        category: 'error',
        digest: { title: 'Poll failed', body: ev.error.user_message },
      };
    case 'lifecycle.removed':
      return {
        category: 'lifecycle',
        digest: {
          title: 'Torrent removed',
          body: `${ev.infohash} (${ev.reason})`,
        },
      };
    default:
      return null;
  }
}

function payloadFor(target: Target, d: EventDigest): string {
  const text = `**${d.title}**\n${d.body}`;
  switch (target.kind) {
    case 'discord':
      return JSON.stringify({ content: text });
    case 'telegram':
      return JSON.stringify({ text });
    case 'ntfy':
      return text;
    case 'generic':
    default:
      return JSON.stringify({ title: d.title, body: d.body, ts: Date.now() });
  }
}

async function deliverOnce(target: Target, payload: string, logger: Logger): Promise<boolean> {
  const headers: Record<string, string> = {};
  if (target.kind === 'ntfy') {
    headers['Content-Type'] = 'text/plain; charset=utf-8';
  } else {
    headers['Content-Type'] = 'application/json';
  }
  try {
    const res = await fetchWithTimeout(target.url, {
      method: 'POST',
      headers,
      body: payload,
      totalTimeoutMs: 10_000,
    });
    if (!res.ok) {
      logger.warn(
        { component: 'webhooks', url: maskUrl(target.url), status: res.status },
        'webhook non-ok',
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ component: 'webhooks', url: maskUrl(target.url), err }, 'webhook failed');
    return false;
  }
}

async function deliverWithRetry(
  target: Target,
  payload: string,
  logger: Logger,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ok = await deliverOnce(target, payload, logger);
    if (ok) return;
    if (attempt === 2) break;
    await new Promise((r) => setTimeout(r, backoffDelay(attempt, 1_000, 15_000)));
  }
  logger.warn(
    { component: 'webhooks', url: maskUrl(target.url) },
    'webhook gave up after 3 attempts',
  );
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    // Scrub the path — tokens often sit in path or query.
    u.pathname = u.pathname.replace(/[^/]/g, '*');
    u.search = u.search ? '?*' : '';
    return u.toString();
  } catch {
    return '<invalid-url>';
  }
}

export function startWebhookDispatcher(deps: {
  config: ConfigStore;
  bus: EventBus;
  logger: Logger;
}): () => void {
  const { config, bus, logger } = deps;

  const off = bus.onAny((ev) => {
    const cfg = config.get();
    if (!cfg.webhooks?.enabled) return;
    const d = digest(ev);
    if (!d) return;
    const targets = cfg.webhooks.targets?.[d.category] ?? [];
    if (targets.length === 0) return;
    // Do NOT await — per FR-V2-45 delivery must not block the emitter.
    for (const t of targets) {
      const payload = payloadFor(t, d.digest);
      void deliverWithRetry(t, payload, logger);
    }
  });

  return off;
}
