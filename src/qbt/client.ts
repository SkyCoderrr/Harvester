import type { Logger } from '../logger/index.js';
import type { Metrics } from '../observability/metrics.js';
import type { ConfigStore } from '../config/store.js';
import { HarvesterError } from '../errors/index.js';
import { fetchWithTimeout } from '../util/fetchWithTimeout.js';

/**
 * qBittorrent WebUI v2 client.
 *
 * - Session cookie (SID) held in memory; re-auth on 403.
 * - Retries once on 403 (session expired), else surfaces error.
 * - All bodies are `application/x-www-form-urlencoded`; `add` uses `multipart/form-data`.
 */
export interface QbtTorrentInfo {
  hash: string;
  name: string;
  size: number;
  state: string;
  progress: number;
  ratio: number;
  uploaded: number;
  downloaded: number;
  num_seeds: number;
  num_leechs: number;
  num_incomplete: number;
  num_complete: number;
  added_on: number;
  category: string;
  tags: string;
  save_path: string;
  seeding_time: number;
  dlspeed: number;
  upspeed: number;
  eta: number;
}

export interface QbtAddInput {
  urls?: string;
  torrentFile?: Buffer;
  category?: string;
  tags?: string[];
  paused?: boolean;
  savepath?: string;
  upLimit?: number;
  autoTMM?: boolean;
}

export interface QbtTransferInfo {
  dl_info_speed: number;
  up_info_speed: number;
  dl_info_data: number;
  up_info_data: number;
  dl_rate_limit: number;
  up_rate_limit: number;
  connection_status: string;
}

export interface QbtClient {
  login(): Promise<void>;
  logout(): Promise<void>;
  getVersion(): Promise<string>;
  getTransferInfo(): Promise<QbtTransferInfo>;
  listTorrents(filter?: { tag?: string; hashes?: string[] }): Promise<QbtTorrentInfo[]>;
  addTorrent(input: QbtAddInput): Promise<void>;
  pauseTorrents(hashes: string[]): Promise<void>;
  resumeTorrents(hashes: string[]): Promise<void>;
  recheckTorrents(hashes: string[]): Promise<void>;
  deleteTorrents(hashes: string[], deleteFiles: boolean): Promise<void>;
  createCategory(name: string, savePath?: string): Promise<void>;
}

export function createQbtClient(
  configStore: ConfigStore,
  logger: Logger,
  metrics: Metrics,
): QbtClient {
  let sid: string | null = null;
  // FR-V2-10: collapse concurrent re-auth attempts. If a login is in-flight,
  // every other caller awaits the same promise instead of triggering another
  // POST /api/v2/auth/login. Reset to null in finally so subsequent failures
  // can retry from scratch.
  let loginInflight: Promise<void> | null = null;
  const callsTotal = metrics.counter('qbt.calls.total');
  const callsErrors = metrics.counter('qbt.calls.errors');
  const callDuration = metrics.histogram('qbt.calls.duration_ms');

  function baseUrl(): string {
    const c = configStore.get();
    return `http://${c.qbt.host}:${c.qbt.port}`;
  }

  function login(): Promise<void> {
    if (loginInflight) return loginInflight;
    loginInflight = doLogin().finally(() => {
      loginInflight = null;
    });
    return loginInflight;
  }

  async function doLogin(): Promise<void> {
    const t0 = performance.now();
    callsTotal.inc();
    const config = configStore.get();
    const body = new URLSearchParams();
    body.set('username', config.qbt.user);
    body.set('password', config.qbt.password);
    try {
      const res = await fetchWithTimeout(baseUrl() + '/api/v2/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: baseUrl(),
        },
        body,
      });
      callDuration.observe(performance.now() - t0);
      const text = await res.text();
      if (res.status === 403) {
        callsErrors.inc();
        throw new HarvesterError({
          code: 'QBT_AUTH_FAILED',
          user_message: 'qBittorrent IP banned after too many failed logins.',
        });
      }
      if (text.trim() !== 'Ok.') {
        callsErrors.inc();
        throw new HarvesterError({
          code: 'QBT_AUTH_FAILED',
          user_message: 'qBittorrent rejected the login.',
          context: { body: text.slice(0, 100) },
        });
      }
      const cookie = res.headers.get('set-cookie');
      const m = cookie?.match(/SID=([^;]+)/);
      if (!m || !m[1]) {
        callsErrors.inc();
        throw new HarvesterError({
          code: 'QBT_BAD_RESPONSE',
          user_message: 'qBittorrent did not return a session cookie.',
        });
      }
      sid = m[1];
    } catch (err) {
      callsErrors.inc();
      if (err instanceof HarvesterError) throw err;
      throw new HarvesterError({
        code: 'QBT_UNREACHABLE',
        user_message: "qBittorrent isn't responding.",
        retryable: true,
        cause: err,
      });
    }
  }

  async function ensureSession(): Promise<void> {
    if (!sid) await login();
  }

  async function request<T = string>(
    path: string,
    opts: { method?: 'GET' | 'POST'; body?: URLSearchParams | FormData; parse?: 'json' | 'text' } = {},
  ): Promise<T> {
    await ensureSession();
    const t0 = performance.now();
    callsTotal.inc();
    try {
      let res = await doRequest(path, opts);
      // Re-auth on 403
      if (res.status === 403) {
        logger.debug({ component: 'qbt' }, 'session expired, re-auth');
        sid = null;
        await login();
        res = await doRequest(path, opts);
      }
      callDuration.observe(performance.now() - t0);
      if (res.status === 404) {
        throw new HarvesterError({
          code: 'QBT_BAD_RESPONSE',
          user_message: 'qBittorrent endpoint not found.',
          context: { path },
        });
      }
      if (!res.ok) {
        callsErrors.inc();
        throw new HarvesterError({
          code: 'QBT_BAD_RESPONSE',
          user_message: `qBittorrent HTTP ${res.status}`,
          context: { path, status: res.status },
        });
      }
      const text = await res.text();
      if (opts.parse === 'json') {
        try {
          return JSON.parse(text) as T;
        } catch (err) {
          callsErrors.inc();
          throw new HarvesterError({
            code: 'QBT_BAD_RESPONSE',
            user_message: 'qBittorrent returned non-JSON',
            cause: err,
          });
        }
      }
      return text as unknown as T;
    } catch (err) {
      if (err instanceof HarvesterError) throw err;
      callsErrors.inc();
      throw new HarvesterError({
        code: 'QBT_UNREACHABLE',
        user_message: "qBittorrent isn't responding.",
        retryable: true,
        cause: err,
      });
    }
  }

  async function doRequest(
    path: string,
    opts: { method?: 'GET' | 'POST'; body?: URLSearchParams | FormData },
  ): Promise<Response> {
    const method = opts.method ?? (opts.body ? 'POST' : 'GET');
    const headers: Record<string, string> = {
      Referer: baseUrl(),
      Cookie: `SID=${sid}`,
    };
    const init: RequestInit = { method, headers };
    if (opts.body) {
      if (opts.body instanceof URLSearchParams) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
      init.body = opts.body;
    }
    return fetchWithTimeout(baseUrl() + path, init);
  }

  return {
    login,
    async logout() {
      if (!sid) return;
      await request('/api/v2/auth/logout', { method: 'POST' }).catch(() => {});
      sid = null;
    },
    async getVersion() {
      return await request<string>('/api/v2/app/version');
    },
    async getTransferInfo() {
      return await request<QbtTransferInfo>('/api/v2/transfer/info', { parse: 'json' });
    },
    async listTorrents(filter) {
      const qs = new URLSearchParams();
      if (filter?.tag) qs.set('tag', filter.tag);
      if (filter?.hashes?.length) qs.set('hashes', filter.hashes.join('|'));
      const path = '/api/v2/torrents/info' + (qs.toString() ? '?' + qs.toString() : '');
      return await request<QbtTorrentInfo[]>(path, { parse: 'json' });
    },
    async addTorrent(input) {
      const form = new FormData();
      if (input.urls) form.append('urls', input.urls);
      if (input.torrentFile) {
        const buf = input.torrentFile;
        // Copy to a fresh ArrayBuffer to satisfy exactOptionalPropertyTypes + Blob typing.
        const ab = new ArrayBuffer(buf.byteLength);
        new Uint8Array(ab).set(buf);
        form.append('torrents', new Blob([ab]), 'file.torrent');
      }
      if (input.category) form.append('category', input.category);
      if (input.tags?.length) form.append('tags', input.tags.join(','));
      if (input.savepath) form.append('savepath', input.savepath);
      if (input.paused !== undefined) form.append('paused', input.paused ? 'true' : 'false');
      if (input.upLimit != null) form.append('upLimit', String(input.upLimit));
      if (input.autoTMM !== undefined) form.append('autoTMM', input.autoTMM ? 'true' : 'false');
      await request('/api/v2/torrents/add', { method: 'POST', body: form });
    },
    async pauseTorrents(hashes) {
      const body = new URLSearchParams({ hashes: hashes.join('|') });
      await request('/api/v2/torrents/pause', { body });
    },
    async resumeTorrents(hashes) {
      const body = new URLSearchParams({ hashes: hashes.join('|') });
      await request('/api/v2/torrents/resume', { body });
    },
    async recheckTorrents(hashes) {
      const body = new URLSearchParams({ hashes: hashes.join('|') });
      await request('/api/v2/torrents/recheck', { body });
    },
    async deleteTorrents(hashes, deleteFiles) {
      const body = new URLSearchParams({
        hashes: hashes.join('|'),
        deleteFiles: deleteFiles ? 'true' : 'false',
      });
      await request('/api/v2/torrents/delete', { body });
    },
    async createCategory(name, savePath) {
      const body = new URLSearchParams({ category: name });
      if (savePath) body.set('savePath', savePath);
      await request('/api/v2/torrents/createCategory', { body });
    },
  };
}
