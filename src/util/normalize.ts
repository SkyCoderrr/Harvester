import type { MTeamTorrent, NormalizedTorrent, Discount, MTeamProfile, NormalizedProfile } from '@shared/types.js';
import { DISCOUNT } from '@shared/types.js';
import { parseMTeamDate, unixSec } from './time.js';

/**
 * Normalize a raw M-Team search/detail row into the canonical shape fed to the rule engine.
 *
 * Remember: the entire M-Team wire contract uses STRINGS for numeric fields. This function
 * is the only place in the codebase that coerces them. (Spike §3.)
 */
export function normalizeMTeamTorrent(raw: MTeamTorrent): NormalizedTorrent {
  const status = raw.status ?? ({} as MTeamTorrent['status']);
  const discount = normalizeDiscount(status.discount);
  return {
    mteam_id: String(raw.id),
    name: raw.name,
    size_bytes: toInt(raw.size, 0),
    discount,
    discount_end_ts:
      discount === 'NORMAL' ? null : parseMTeamDate(status.discountEndTime),
    seeders: toInt(status.seeders, 0),
    leechers: toInt(status.leechers, 0),
    category: raw.category ? String(raw.category) : null,
    created_date_ts: parseMTeamDate(raw.createdDate) ?? unixSec(),
    raw_payload: raw,
  };
}

function normalizeDiscount(s: unknown): Discount {
  if (typeof s === 'string' && (DISCOUNT as readonly string[]).includes(s)) return s as Discount;
  return 'NORMAL';
}

function toInt(v: unknown, fallback: number): number {
  if (v == null) return fallback;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toFloat(v: unknown, fallback: number): number {
  if (v == null) return fallback;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Normalize a raw /member/profile response into NormalizedProfile.
 * See spike §9.
 */
export function normalizeMTeamProfile(
  raw: MTeamProfile,
  tierThresholds: Array<{ min_weeks: number; min_ratio: number }>,
): NormalizedProfile {
  const uploaded = toInt(raw.memberCount?.uploaded, 0);
  const downloaded = toInt(raw.memberCount?.downloaded, 0);
  const ratio = downloaded > 0 ? uploaded / downloaded : 0;
  const bonus_points = Math.round(toFloat(raw.memberCount?.bonus, 0));
  const signup = parseMTeamDate(raw.createdDate);
  const weeks = signup == null ? 0 : Math.max(0, (unixSec() - signup) / (7 * 86400));
  const { tier, min_ratio } = pickTier(tierThresholds, weeks);
  return {
    ts: unixSec(),
    uploaded_bytes: uploaded,
    downloaded_bytes: downloaded,
    ratio,
    bonus_points,
    weeks_since_signup: weeks,
    account_tier: tier,
    tier_min_ratio: min_ratio,
    raw_payload: raw,
  };
}

function pickTier(
  thresholds: Array<{ min_weeks: number; min_ratio: number }>,
  weeks: number,
): { tier: string | null; min_ratio: number | null } {
  let best: { min_weeks: number; min_ratio: number } | null = null;
  for (const t of thresholds) {
    if (weeks >= t.min_weeks && (best == null || t.min_weeks > best.min_weeks)) best = t;
  }
  if (!best) return { tier: null, min_ratio: null };
  return { tier: `T+${best.min_weeks}w`, min_ratio: best.min_ratio };
}
