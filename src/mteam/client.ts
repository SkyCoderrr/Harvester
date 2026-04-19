import type { Logger } from '../logger/index.js';
import type { Metrics } from '../observability/metrics.js';
import type { ConfigStore } from '../config/store.js';
import type { MTeamProfile, MTeamSearchResult, MTeamTorrent } from '@shared/types.js';
import { HarvesterError } from '../errors/index.js';
import { withRetry } from '../util/retry.js';

/**
 * Raw M-Team client based on spike findings (spike/SPIKE_REPORT.md).
 *
 * - Base URL: https://api.m-team.cc/api (from config.mteam.base_url)
 * - Auth: `x-api-key: <key>` header
 * - MUST set a non-default User-Agent. config.mteam.user_agent is passed through.
 * - Envelope: { code: "0" | non-zero, message, data }
 * - Numerics on the wire are strings; normalization happens in util/normalize.ts, NOT here.
 *
 * No yeast.js / no SDK wrapper — the Swagger surface is flat enough to hit with fetch.
 */
export interface MTeamSearchParams {
  mode?: 'normal' | 'adult' | 'movie' | 'music' | 'tvshow' | 'waterfall' | 'rss' | 'rankings' | 'all';
  pageNumber?: number;
  pageSize?: number;
  sortField?: 'CREATED_DATE' | 'SIZE' | 'SEEDERS' | 'LEECHERS' | 'TIMES_COMPLETED' | 'NAME';
  sortDirection?: 'ASC' | 'DESC';
  discount?:
    | 'NORMAL'
    | 'PERCENT_70'
    | 'PERCENT_50'
    | 'FREE'
    | '_2X_FREE'
    | '_2X'
    | '_2X_PERCENT_50';
  keyword?: string;
  categories?: number[];
  lastId?: number;
}

export interface MTeamClient {
  search(params?: MTeamSearchParams): Promise<MTeamSearchResult>;
  detail(id: string): Promise<MTeamTorrent>;
  /** Returns the single-use-ish signed URL (time-bounded; spike §7). */
  genDlToken(id: string): Promise<string>;
  profile(): Promise<MTeamProfile>;
}

interface MTeamEnvelope<T> {
  code: string;
  message: string;
  data: T;
}

interface CallOpts {
  method?: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Timeout in ms. */
  timeoutMs?: number;
}

export function createMTeamClient(
  configStore: ConfigStore,
  logger: Logger,
  metrics: Metrics,
): MTeamClient {
  const timerDuration = metrics.histogram('mteam.calls.duration_ms');
  const callsTotal = metrics.counter('mteam.calls.total');
  const callsErrors = metrics.counter('mteam.calls.errors');

  async function callOnce<T>(opts: CallOpts): Promise<T> {
    const config = configStore.get();
    const baseUrl = config.mteam.base_url.replace(/\/+$/, '') + '/api';
    const url = new URL(baseUrl + opts.path);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      'x-api-key': config.mteam.api_key,
      'User-Agent': config.mteam.user_agent,
      Accept: 'application/json',
    };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
    const t0 = Date.now();
    callsTotal.inc();
    try {
      const init: RequestInit = {
        method: opts.method ?? 'POST',
        headers,
        signal: controller.signal,
      };
      if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
      const res = await fetch(url, init);
      const text = await res.text();
      timerDuration.observe(Date.now() - t0);

      // Non-2xx is rare but possible — treat as MTEAM_UNAVAILABLE.
      if (!res.ok) {
        callsErrors.inc();
        throw new HarvesterError({
          code: res.status === 429 ? 'MTEAM_RATE_LIMITED' : 'MTEAM_UNAVAILABLE',
          user_message:
            res.status === 429
              ? 'Rate-limited by M-Team.'
              : `M-Team HTTP ${res.status}`,
          retryable: true,
          context: { status: res.status },
        });
      }

      let env: MTeamEnvelope<T>;
      try {
        env = JSON.parse(text) as MTeamEnvelope<T>;
      } catch {
        callsErrors.inc();
        throw new HarvesterError({
          code: 'MTEAM_BAD_RESPONSE',
          user_message: 'M-Team returned a non-JSON response',
          context: { head: text.slice(0, 200) },
        });
      }

      // code === "0" is success per spike §2.
      const codeStr = String(env.code);
      if (codeStr === '0' || codeStr === 'SUCCESS') {
        return env.data;
      }

      callsErrors.inc();
      // Map known messages to error codes (spike §2).
      const msg = env.message ?? 'M-Team error';
      let code: HarvesterError['code'] = 'MTEAM_BAD_RESPONSE';
      if (codeStr === '401' || /authentication/i.test(msg)) {
        code = 'MTEAM_AUTH_FAILED';
      } else if (/key/i.test(msg) && /無效|invalid/i.test(msg)) {
        code = 'MTEAM_AUTH_FAILED';
      } else if (/超出有效期|expired/i.test(msg)) {
        code = 'GRAB_TOKEN_EXPIRED';
      }
      throw new HarvesterError({
        code,
        user_message: code === 'MTEAM_AUTH_FAILED' ? 'M-Team rejected the API key.' : msg,
        context: { mteam_code: codeStr, mteam_message: msg },
        retryable: false,
      });
    } catch (err) {
      if (err instanceof HarvesterError) throw err;
      callsErrors.inc();
      if ((err as Error).name === 'AbortError') {
        throw new HarvesterError({
          code: 'MTEAM_UNAVAILABLE',
          user_message: 'M-Team request timed out.',
          retryable: true,
          cause: err,
        });
      }
      throw new HarvesterError({
        code: 'MTEAM_UNAVAILABLE',
        user_message: 'M-Team unreachable.',
        retryable: true,
        cause: err,
      });
    } finally {
      clearTimeout(to);
    }
  }

  async function call<T>(opts: CallOpts): Promise<T> {
    return withRetry(() => callOnce<T>(opts), {
      attempts: 3,
      baseMs: 1000,
      factor: 2,
      shouldRetry: (err) => err instanceof HarvesterError && err.retryable,
      onAttempt: (n, err) => {
        if (n > 1) logger.warn({ component: 'mteam', attempt: n, err }, 'retrying m-team call');
      },
    });
  }

  return {
    async search(params = {}) {
      const body = {
        mode: params.mode ?? 'normal',
        pageNumber: params.pageNumber ?? 1,
        pageSize: params.pageSize ?? 50,
        sortField: params.sortField ?? 'CREATED_DATE',
        sortDirection: params.sortDirection ?? 'DESC',
        discount: params.discount,
        keyword: params.keyword,
        categories: params.categories,
        lastId: params.lastId,
      };
      // Prune undefined so we don't send noise.
      for (const k of Object.keys(body)) {
        const key = k as keyof typeof body;
        if (body[key] === undefined) delete (body as Record<string, unknown>)[k];
      }
      const data = await call<{
        pageNumber: string;
        pageSize: string;
        total: string;
        totalPages: string;
        data: MTeamTorrent[];
      }>({ path: '/torrent/search', body });
      return {
        pageNumber: Number(data.pageNumber ?? 1),
        pageSize: Number(data.pageSize ?? 50),
        total: Number(data.total ?? 0),
        totalPages: Number(data.totalPages ?? 0),
        items: data.data ?? [],
      };
    },
    async detail(id) {
      return call<MTeamTorrent>({
        path: '/torrent/detail',
        query: { id, origin: 'web' },
      });
    },
    async genDlToken(id) {
      return call<string>({ path: '/torrent/genDlToken', query: { id } });
    },
    async profile() {
      return call<MTeamProfile>({ path: '/member/profile' });
    },
  };
}
