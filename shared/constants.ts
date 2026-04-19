/**
 * Cross-cutting magic numbers. Keep small; prefer config over constants.
 */

/** Asia/Taipei is the M-Team server timezone (confirmed in spike §4). */
export const MTEAM_TIMEZONE = 'Asia/Taipei';

/** Re-eval rules (FR-PO-03). */
export const REEVAL_WINDOW_SEC = 3600;
export const REEVAL_MIN_DISCOUNT_HEADROOM_SEC = 600;
export const REEVAL_MAX_ATTEMPTS = 3;

/** genDlToken TTL upper bound — be conservative (spike §7). */
export const GENDL_TOKEN_TTL_SEC = 600;

/** Poll-cycle backoff cap (default). */
export const POLL_BACKOFF_MAX_FACTOR = 16;

/** Lifecycle defaults, overridable via config + per-rule. */
export const DEFAULT_SEED_TIME_HOURS = 72;
export const DEFAULT_ZERO_PEERS_MINUTES = 60;

/** Soft advisory threshold for "harvester-tagged torrent count" footer chip. */
export const SOFT_ADVISORY_HARVESTER_COUNT = 100;
