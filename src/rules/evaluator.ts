import type { EvaluationResult, NormalizedTorrent, RuleSet } from '@shared/types.js';
import { compileUnicodeRegex } from '../util/regex.js';
import { isScheduleActive } from '../util/time.js';

export interface EvalContext {
  /** Current time as unix ms. */
  now_ms: number;
  /** Free disk in GiB on the save path (or the default). */
  free_disk_gib: (path: string | null) => number;
  /** Optional override — used by dry-run. */
  simulate_at_ms?: number;
}

export type OneResult = { pass: true } | { pass: false; rejection_reason: string };

/** Pure, no I/O. Evaluates one torrent against one rule-set. */
export function evaluateOne(
  t: NormalizedTorrent,
  rs: RuleSet,
  ctx: EvalContext,
): OneResult {
  const now = ctx.simulate_at_ms ?? ctx.now_ms;
  const r = rs.rules;

  // Step 0: schedule gate
  if (r.schedule != null) {
    if (!isScheduleActive(r.schedule, now)) return { pass: false, rejection_reason: 'schedule_closed' };
  }

  // Step 1: discount whitelist
  if (!r.discount_whitelist.includes(t.discount)) {
    return { pass: false, rejection_reason: 'discount_whitelist' };
  }

  // Step 2: min free hours remaining
  if (r.min_free_hours_remaining != null) {
    const hoursLeft =
      t.discount_end_ts == null ? Infinity : (t.discount_end_ts - Math.floor(now / 1000)) / 3600;
    if (hoursLeft < r.min_free_hours_remaining) {
      return { pass: false, rejection_reason: 'min_free_hours_remaining' };
    }
  }

  // Step 3: size
  const sizeGib = t.size_bytes / 2 ** 30;
  if (sizeGib < r.size_gib_min || sizeGib > r.size_gib_max) {
    return { pass: false, rejection_reason: 'size_range' };
  }

  // Step 4: category
  if (r.category_whitelist != null) {
    if (t.category == null || !r.category_whitelist.includes(t.category)) {
      return { pass: false, rejection_reason: 'category_whitelist' };
    }
  }

  // Step 5: swarm (unless first-seeder fast path applies)
  const ageMin = (Math.floor(now / 1000) - t.created_date_ts) / 60;
  const fp = r.first_seeder_fast_path;
  const useFastPath =
    fp != null &&
    fp.enabled &&
    ageMin < fp.max_age_minutes &&
    (t.discount === 'FREE' || t.discount === '_2X_FREE');

  if (!useFastPath) {
    if (r.min_seeders != null && t.seeders < r.min_seeders) {
      return { pass: false, rejection_reason: 'min_seeders' };
    }
    if (r.max_seeders != null && t.seeders > r.max_seeders) {
      return { pass: false, rejection_reason: 'max_seeders' };
    }
    if (r.min_leechers != null && t.leechers < r.min_leechers) {
      return { pass: false, rejection_reason: 'min_leechers' };
    }
    if (r.max_leechers != null && t.leechers > r.max_leechers) {
      return { pass: false, rejection_reason: 'max_leechers' };
    }
    if (r.leecher_seeder_ratio_min != null) {
      const ratio = t.leechers / Math.max(t.seeders, 1);
      if (ratio < r.leecher_seeder_ratio_min) {
        return { pass: false, rejection_reason: 'leecher_seeder_ratio_min' };
      }
    }
  }

  // Step 6-7: regex
  if (r.title_regex_include != null) {
    const re = compileUnicodeRegex(r.title_regex_include);
    if (!re || !re.test(t.name)) {
      return { pass: false, rejection_reason: 'title_regex_include' };
    }
  }
  if (r.title_regex_exclude != null) {
    const re = compileUnicodeRegex(r.title_regex_exclude);
    if (re && re.test(t.name)) {
      return { pass: false, rejection_reason: 'title_regex_exclude' };
    }
  }

  // Step 8: free disk
  if (r.free_disk_gib_min != null) {
    const free = ctx.free_disk_gib(r.qbt_save_path);
    if (free < r.free_disk_gib_min) {
      return { pass: false, rejection_reason: 'free_disk_gib_min' };
    }
  }

  return { pass: true };
}

/** OR across rule-sets. Deterministic order (id ASC) in reasons array. */
export function evaluate(
  t: NormalizedTorrent,
  ruleSets: RuleSet[],
  ctx: EvalContext,
): EvaluationResult {
  const matched: Array<{ id: number; name: string }> = [];
  const rejections: Array<{ id: number; name: string; rejection_reason: string }> = [];
  const sorted = [...ruleSets].sort((a, b) => a.id - b.id);
  for (const rs of sorted) {
    if (!rs.enabled) continue;
    const r = evaluateOne(t, rs, ctx);
    if (r.pass) matched.push({ id: rs.id, name: rs.name });
    else rejections.push({ id: rs.id, name: rs.name, rejection_reason: r.rejection_reason });
  }
  if (matched.length > 0) return { kind: 'GRABBED', matched };
  return { kind: 'SKIPPED_RULE', per_rule_set: rejections };
}
