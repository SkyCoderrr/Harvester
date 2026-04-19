import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest, onRequestHookHandler } from 'fastify';
import type { Logger } from '../logger/index.js';
import type { ConfigStore } from '../config/store.js';
import type { EventBus } from '../events/bus.js';
import { createRateLimiter, type RateLimiter } from './rateLimiter.js';
import { createVerifyCache, type VerifyCache } from './verifyCache.js';
import { verifyPassword } from './argon2.js';

/**
 * Per-request auth preHandler. Bypasses:
 *   - /api/health
 *   - /api/first-run/*  (chicken-and-egg during setup)
 *
 * Accepts the bearer token via either:
 *   - Authorization: Bearer <token>
 *   - ?token=<token> query param (SSE endpoints only per FR-AUTH-07)
 *
 * Rate-limited per IP. Localhost is never locked out (FR-AUTH-05).
 */
export interface AuthDeps {
  config: ConfigStore;
  logger: Logger;
  bus: EventBus;
}

export interface AuthInstance {
  preHandler: onRequestHookHandler;
  rateLimiter: RateLimiter;
  verifyCache: VerifyCache;
  /** Call after the password hash is changed to invalidate cached verifications. */
  bumpEpoch(): void;
}

// FR-V2-07: SSE endpoints no longer accept ?token=<bearer>. They use a
// short-lived one-shot ticket minted by the authenticated POST /api/sse-ticket
// route and validated by the SSE handler itself. Because the SSE handler does
// its own auth (ticket consume) we bypass the bearer check on those paths;
// /api/sse-ticket itself stays under bearer auth.
const BYPASS_PATH_RE =
  /^\/api\/(?:health|first-run(?:\/|$)|service\/events|logs\/stream)/;

export function createAuthMiddleware(deps: AuthDeps): AuthInstance {
  const { config, logger, bus } = deps;
  const cfg = config.get();
  const limitCfg = cfg.lan_access.rate_limit;
  const rateLimiter = createRateLimiter({
    maxFailures: limitCfg.max_failures,
    windowSec: limitCfg.window_sec,
    lockoutSec: limitCfg.lockout_sec,
  });
  const verifyCache = createVerifyCache({ ttlMs: 60_000, cap: 16 });

  async function preHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    // Skip non-/api paths (let SPA be served).
    if (!req.url.startsWith('/api/')) return;

    // Skip bypassed paths.
    const path = req.url.split('?')[0] ?? '';
    if (BYPASS_PATH_RE.test(path)) return;

    // If no password is configured, the server only binds to 127.0.0.1 and auth is a no-op.
    const current = config.get();
    if (current.lan_access.password_hash == null) return;

    const ip = req.ip;

    // Rate limit
    const lock = rateLimiter.isLocked(ip);
    if (lock.locked) {
      bus.emit('auth.rate_limited', { type: 'auth.rate_limited', ip });
      reply.header('Retry-After', String(lock.retryAfterSec));
      void reply.status(429).send({
        ok: false,
        error: {
          code: 'AUTH_RATE_LIMITED',
          user_message: 'Too many failed sign-in attempts. Try again in 5 minutes.',
        },
      });
      return;
    }

    // Extract token
    const token = extractToken(req, path);
    if (!token) {
      bus.emit('auth.unauthenticated', { type: 'auth.unauthenticated', ip, path });
      void reply.status(401).send({
        ok: false,
        error: {
          code: 'AUTH_UNAUTHENTICATED',
          user_message: 'This Harvester instance requires a password.',
        },
      });
      return;
    }

    const tokenHash = sha256(token);
    const cacheKey = `${ip}:${tokenHash}:${verifyCache.epoch()}`;
    const cached = verifyCache.get(cacheKey);
    if (cached === 'ok') return;
    if (cached === 'bad') {
      rateLimiter.fail(ip);
      bus.emit('auth.unauthenticated', { type: 'auth.unauthenticated', ip, path });
      void reply.status(401).send({
        ok: false,
        error: {
          code: 'AUTH_UNAUTHENTICATED',
          user_message: 'This Harvester instance requires a password.',
        },
      });
      return;
    }

    // Verify against stored hash
    const hash = current.lan_access.password_hash;
    if (!hash) return; // race: password cleared mid-request
    const ok = await verifyPassword(hash, token);
    verifyCache.set(cacheKey, ok ? 'ok' : 'bad');
    if (ok) {
      rateLimiter.success(ip);
      return;
    }
    rateLimiter.fail(ip);
    bus.emit('auth.unauthenticated', { type: 'auth.unauthenticated', ip, path });
    logger.warn({ component: 'auth', ip, path }, 'auth rejected');
    void reply.status(401).send({
      ok: false,
      error: {
        code: 'AUTH_UNAUTHENTICATED',
        user_message: 'This Harvester instance requires a password.',
      },
    });
  }

  return {
    preHandler,
    rateLimiter,
    verifyCache,
    bumpEpoch() {
      verifyCache.bumpEpoch();
    },
  };
}

function extractToken(req: FastifyRequest, _path: string): string | null {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  // FR-V2-07: ?token= in query strings is no longer accepted on any path,
  // SSE included. SSE clients must mint a ticket via POST /api/sse-ticket.
  return null;
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
