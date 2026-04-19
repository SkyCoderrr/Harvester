import type { FastifyInstance } from 'fastify';
import type { HttpDeps } from '../server.js';
import type { Settings } from '@shared/types.js';
import { HarvesterError } from '../../errors/index.js';
import { hashPassword } from '../../auth/argon2.js';
import { validatePasswordPolicy } from '../../auth/passwordPolicy.js';
import {
  settingsPatchBody,
  settingsTestMteamBody,
  settingsLanAccessBody,
  settingsTestQbtBody,
} from '../schemas/settings.js';

function maskApiKey(key: string): string {
  if (!key || key.startsWith('__FIRST_RUN')) return '';
  const head = key.slice(0, 4);
  const tail = key.slice(-4);
  return `${head}****${tail}`;
}

function toSettings(deps: HttpDeps): Settings {
  const c = deps.config.get();
  const svc = deps.serviceState.get();
  return {
    mteam: {
      api_key_masked: maskApiKey(c.mteam.api_key),
      api_key_set: !c.mteam.api_key.startsWith('__FIRST_RUN'),
    },
    qbt: {
      host: c.qbt.host,
      port: c.qbt.port,
      user: c.qbt.user.startsWith('__FIRST_RUN') ? '' : c.qbt.user,
      password_set: !c.qbt.password.startsWith('__FIRST_RUN'),
      allowed_client_ok: svc.allowed_client_ok,
    },
    poller: { interval_sec: c.poller.interval_sec },
    downloads: { default_save_path: c.downloads.default_save_path },
    lifecycle: {
      seed_time_hours: c.lifecycle.seed_time_hours,
      zero_peers_minutes: c.lifecycle.zero_peers_minutes,
      remove_with_data: c.lifecycle.remove_with_data,
    },
    emergency: {
      tier_thresholds: c.emergency.tier_thresholds,
      ratio_buffer: c.emergency.ratio_buffer,
    },
    lan_access: { enabled: c.bind_host === '0.0.0.0', password_set: c.lan_access.password_hash != null },
    ui: c.ui,
    telemetry: { enabled: false },
    first_run_completed: c.first_run_completed,
  };
}

export function registerSettingsRoutes(app: FastifyInstance, deps: HttpDeps): void {
  app.get('/settings', async () => ({ ok: true, data: toSettings(deps) }));

  app.put('/settings', async (req) => {
    const patch = settingsPatchBody.parse(req.body);
    // The schema already restricts the surface; pass through unchanged.
    deps.config.update(patch as never);
    return {
      ok: true,
      data: {
        settings: toSettings(deps),
        requires_restart: false,
      },
    };
  });

  app.post('/settings/test/mteam', async (req) => {
    const { api_key } = settingsTestMteamBody.parse(req.body ?? {});
    const keyToUse = api_key ?? deps.config.get().mteam.api_key;
    if (!keyToUse || keyToUse.startsWith('__FIRST_RUN')) {
      throw new HarvesterError({
        code: 'MTEAM_AUTH_FAILED',
        user_message: 'No API key supplied.',
      });
    }
    // We can't construct a fresh client without the full deps tree; use the live client,
    // but if the caller sent a different key, we build an ephemeral client inline.
    if (api_key && api_key !== deps.config.get().mteam.api_key) {
      const temp = await testMteamAuth(deps.config.get().mteam.base_url, deps.config.get().mteam.user_agent, api_key);
      return { ok: true, data: { ok: temp.ok, error: temp.error, profile: temp.profile } };
    }
    try {
      const profile = await deps.mteam.profile();
      return { ok: true, data: { ok: true, profile } };
    } catch (err) {
      if (err instanceof HarvesterError) {
        return { ok: true, data: { ok: false, error: { code: err.code, user_message: err.user_message } } };
      }
      throw err;
    }
  });

  app.post('/settings/lan-access', async (req) => {
    const body = settingsLanAccessBody.parse(req.body);
    const cfg = deps.config.get();
    if (body.enabled) {
      if (!body.password) {
        throw new HarvesterError({
          code: 'AUTH_PASSWORD_WEAK',
          user_message: 'Password is required to enable LAN access.',
        });
      }
      const policy = validatePasswordPolicy(body.password, {
        mteamApiKey: cfg.mteam.api_key,
        qbtPassword: cfg.qbt.password,
      });
      if (!policy.ok) {
        throw new HarvesterError({
          code: 'AUTH_PASSWORD_WEAK',
          user_message: policy.reason ?? 'Password fails policy.',
        });
      }
      const hash = await hashPassword(body.password);
      const bindTarget = body.bind_host && body.bind_host.trim() ? body.bind_host.trim() : '0.0.0.0';
      deps.config.update({
        bind_host: bindTarget,
        lan_access: { password_hash: hash },
      } as never);
      deps.onPasswordChange?.();
      // Update logger redactor with the raw password so it never leaks into logs.
      try {
        deps.logger.setSecrets([cfg.mteam.api_key, cfg.qbt.password, body.password].filter(Boolean));
      } catch {
        /* ignore */
      }
      return {
        ok: true,
        data: {
          ok: true,
          requires_restart: true,
          restart_reason: 'bind_host changed to 0.0.0.0',
        },
      };
    }
    // disabling
    deps.config.update({
      bind_host: '127.0.0.1',
      lan_access: { password_hash: null },
    } as never);
    deps.onPasswordChange?.();
    return {
      ok: true,
      data: { ok: true, requires_restart: true, restart_reason: 'bind_host changed to 127.0.0.1' },
    };
  });

  app.post('/settings/lan-access/disable', async () => {
    deps.config.update({
      bind_host: '127.0.0.1',
      lan_access: { password_hash: null },
    } as never);
    deps.onPasswordChange?.();
    return {
      ok: true,
      data: { ok: true, requires_restart: true, restart_reason: 'LAN access disabled' },
    };
  });

  app.post('/settings/test/qbt', async (req) => {
    const body = settingsTestQbtBody.parse(req.body ?? {});
    const c = deps.config.get();
    const host = body.host ?? c.qbt.host;
    const port = body.port ?? c.qbt.port;
    const user = body.user ?? c.qbt.user;
    const pass = body.pass ?? c.qbt.password;
    try {
      const r = await testQbtAuth(host, port, user, pass);
      return { ok: true, data: r };
    } catch (err) {
      return { ok: true, data: { ok: false, error: (err as Error).message } };
    }
  });
}

async function testMteamAuth(
  baseUrl: string,
  userAgent: string,
  apiKey: string,
): Promise<{ ok: boolean; profile?: unknown; error?: { code: string; user_message: string } }> {
  try {
    const res = await fetch(baseUrl.replace(/\/+$/, '') + '/api/member/profile', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'User-Agent': userAgent,
        Accept: 'application/json',
      },
    });
    const text = await res.text();
    const env = JSON.parse(text) as { code: string; message: string; data: unknown };
    if (String(env.code) === '0') return { ok: true, profile: env.data };
    return {
      ok: false,
      error: { code: 'MTEAM_AUTH_FAILED', user_message: env.message || 'M-Team rejected the key.' },
    };
  } catch (err) {
    return {
      ok: false,
      error: { code: 'MTEAM_UNAVAILABLE', user_message: (err as Error).message },
    };
  }
}

async function testQbtAuth(
  host: string,
  port: number,
  user: string,
  pass: string,
): Promise<{ ok: boolean; version?: string; error?: string }> {
  const base = `http://${host}:${port}`;
  const body = new URLSearchParams({ username: user, password: pass });
  const loginRes = await fetch(base + '/api/v2/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: base },
    body,
  });
  const text = await loginRes.text();
  if (text.trim() !== 'Ok.') {
    return { ok: false, error: 'qBittorrent rejected the login.' };
  }
  const cookie = loginRes.headers.get('set-cookie');
  const m = cookie?.match(/SID=([^;]+)/);
  if (!m) return { ok: false, error: 'No session cookie.' };
  const vRes = await fetch(base + '/api/v2/app/version', {
    headers: { Cookie: `SID=${m[1]}`, Referer: base },
  });
  const version = await vRes.text();
  return { ok: true, version };
}
