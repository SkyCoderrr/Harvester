import fs from 'node:fs';
import type { Logger } from '../logger/index.js';
import type { AppConfig } from '../config/schema.js';
import type { MTeamClient } from '../mteam/client.js';
import type { QbtClient } from '../qbt/client.js';
import { satisfies } from '../util/semver.js';
import { freeGib } from '../util/disk.js';

export interface PreflightReport {
  ok: boolean;
  hard: string[];
  soft: string[];
  mteam: boolean;
  qbt: boolean;
  allowed_client: boolean;
  qbt_version: string | null;
  disk: boolean;
}

/**
 * Boot-time preflight. Hard failures return `ok:false` and the caller should NOT start
 * workers. Soft failures (allowed-client mismatch, low disk) are surfaced in the UI banner
 * but don't block boot.
 */
export async function runPreflight(deps: {
  config: AppConfig;
  logger: Logger;
  mteam: MTeamClient;
  qbt: QbtClient;
}): Promise<PreflightReport> {
  const { config, logger, mteam, qbt } = deps;
  const hard: string[] = [];
  const soft: string[] = [];
  let mteamOk = false;
  let qbtOk = false;
  let allowedOk = false;
  let qbtVersion: string | null = null;

  if (config.mteam.api_key.startsWith('__FIRST_RUN')) {
    hard.push('first_run_required');
  } else {
    try {
      await mteam.profile();
      mteamOk = true;
    } catch (err) {
      logger.warn({ component: 'preflight', err }, 'm-team preflight failed');
      hard.push('mteam_auth');
    }
  }

  try {
    if (!config.qbt.user.startsWith('__FIRST_RUN')) {
      await qbt.login();
      qbtOk = true;
      try {
        qbtVersion = await qbt.getVersion();
        const vStripped = qbtVersion.replace(/^v/, '');
        if (satisfies(vStripped, config.qbt.allowed_client_range) || config.qbt.allowed_client_override) {
          allowedOk = true;
        } else {
          soft.push(`qbt_version_disallowed:${qbtVersion}`);
        }
      } catch {
        soft.push('qbt_version_unknown');
      }
    } else {
      hard.push('first_run_required');
    }
  } catch (err) {
    logger.warn({ component: 'preflight', err }, 'qbt preflight failed');
    hard.push('qbt_login');
  }

  // Disk
  let diskOk = false;
  try {
    fs.statSync(config.downloads.default_save_path);
    const free = freeGib(config.downloads.default_save_path);
    if (free < 1) hard.push('disk_low');
    else if (free < 10) soft.push('disk_low_warn');
    diskOk = free >= 1;
  } catch {
    hard.push('disk_unreachable');
  }

  const report: PreflightReport = {
    ok: hard.length === 0,
    hard,
    soft,
    mteam: mteamOk,
    qbt: qbtOk,
    allowed_client: allowedOk,
    qbt_version: qbtVersion,
    disk: diskOk,
  };
  logger.info({ component: 'preflight', report }, 'preflight complete');
  return report;
}
