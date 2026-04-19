/**
 * Canonical error type + code registry for Harvester.
 * Every HarvesterError has a user-safe `user_message` that the frontend can show verbatim.
 */

export type ErrorCode =
  | 'CONFIG_INVALID'
  | 'CONFIG_MISSING'
  | 'MTEAM_AUTH_FAILED'
  | 'MTEAM_RATE_LIMITED'
  | 'MTEAM_UNAVAILABLE'
  | 'MTEAM_REQUIRED_HEADER_MISSING'
  | 'MTEAM_BAD_RESPONSE'
  | 'QBT_UNREACHABLE'
  | 'QBT_AUTH_FAILED'
  | 'QBT_VERSION_DISALLOWED'
  | 'QBT_BAD_RESPONSE'
  | 'RULE_VALIDATION'
  | 'RULE_NAME_CONFLICT'
  | 'RULE_SCHEDULE_INVALID'
  | 'AUTH_UNAUTHENTICATED'
  | 'AUTH_RATE_LIMITED'
  | 'AUTH_PASSWORD_WEAK'
  | 'DISK_LOW'
  | 'DISK_UNREACHABLE'
  | 'GRAB_TOKEN_EXPIRED'
  | 'GRAB_DUPLICATE'
  | 'GRAB_DISCOUNT_FLIPPED'
  | 'NOT_FOUND'
  | 'FIRST_RUN_INCOMPLETE'
  | 'VALIDATION_FAILED'
  | 'INTERNAL';

export class HarvesterError extends Error {
  public readonly code: ErrorCode;
  public readonly user_message: string;
  public readonly context: Record<string, unknown> | undefined;
  public readonly retryable: boolean;
  public override readonly cause: unknown;

  constructor(init: {
    code: ErrorCode;
    user_message: string;
    context?: Record<string, unknown>;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(init.user_message);
    this.name = 'HarvesterError';
    this.code = init.code;
    this.user_message = init.user_message;
    this.context = init.context;
    this.retryable = init.retryable ?? false;
    this.cause = init.cause;
  }
}

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  CONFIG_INVALID: 500,
  CONFIG_MISSING: 500,
  MTEAM_AUTH_FAILED: 503,
  MTEAM_RATE_LIMITED: 503,
  MTEAM_UNAVAILABLE: 503,
  MTEAM_REQUIRED_HEADER_MISSING: 500,
  MTEAM_BAD_RESPONSE: 502,
  QBT_UNREACHABLE: 503,
  QBT_AUTH_FAILED: 503,
  QBT_VERSION_DISALLOWED: 503,
  QBT_BAD_RESPONSE: 502,
  RULE_VALIDATION: 400,
  RULE_NAME_CONFLICT: 409,
  RULE_SCHEDULE_INVALID: 400,
  AUTH_UNAUTHENTICATED: 401,
  AUTH_RATE_LIMITED: 429,
  AUTH_PASSWORD_WEAK: 400,
  DISK_LOW: 507,
  DISK_UNREACHABLE: 500,
  GRAB_TOKEN_EXPIRED: 409,
  GRAB_DUPLICATE: 409,
  GRAB_DISCOUNT_FLIPPED: 409,
  NOT_FOUND: 404,
  FIRST_RUN_INCOMPLETE: 412,
  VALIDATION_FAILED: 400,
  INTERNAL: 500,
};

/** User-safe default messages (per error code). UI may override. */
export const USER_MESSAGES: Record<ErrorCode, string> = {
  CONFIG_INVALID: 'The configuration file is invalid. See the logs for details.',
  CONFIG_MISSING: 'The configuration file is missing.',
  MTEAM_AUTH_FAILED: 'M-Team rejected the API key. Verify it in Settings → M-Team.',
  MTEAM_UNAVAILABLE: 'M-Team is not reachable right now. Harvester will retry automatically.',
  MTEAM_RATE_LIMITED: 'Rate-limited by M-Team. Poll interval will back off automatically.',
  MTEAM_REQUIRED_HEADER_MISSING:
    'An internal M-Team request omitted a required header (x-api-key / User-Agent). Please file a bug.',
  MTEAM_BAD_RESPONSE: 'M-Team returned an unexpected response. Harvester will retry.',
  QBT_UNREACHABLE:
    "qBittorrent isn't responding. Check that it's running and the credentials in Settings → qBittorrent.",
  QBT_AUTH_FAILED: 'qBittorrent rejected the login. Check the username/password in Settings.',
  QBT_VERSION_DISALLOWED:
    "Your qBittorrent version isn't on M-Team's allowed list. See Settings → qBittorrent for override.",
  QBT_BAD_RESPONSE: 'qBittorrent returned an unexpected response.',
  RULE_VALIDATION: 'One or more rule-set fields are invalid. See details.',
  RULE_NAME_CONFLICT: 'A rule-set with that name already exists.',
  RULE_SCHEDULE_INVALID: 'The schedule window is invalid.',
  AUTH_UNAUTHENTICATED: 'This Harvester instance requires a password. Please sign in.',
  AUTH_RATE_LIMITED: 'Too many failed sign-in attempts. Try again in 5 minutes.',
  AUTH_PASSWORD_WEAK:
    'Password must be at least 12 characters and include three of: lowercase, uppercase, digit, symbol — and not match an obvious word.',
  DISK_LOW: 'Free disk on the save path is below the configured minimum; grab skipped.',
  DISK_UNREACHABLE: "Can't reach the save path.",
  GRAB_TOKEN_EXPIRED: 'The download link expired; Harvester will re-fetch.',
  GRAB_DUPLICATE: 'Skipped: a torrent with that infohash is already in qBittorrent.',
  GRAB_DISCOUNT_FLIPPED: 'Torrent discount flipped to paid before the grab completed; skipped.',
  NOT_FOUND: 'Not found.',
  FIRST_RUN_INCOMPLETE: 'First-run setup must be completed before this action.',
  VALIDATION_FAILED: 'Request body failed validation.',
  INTERNAL: 'Unexpected error; see logs.',
};

export function normalizeError(err: unknown): HarvesterError {
  if (err instanceof HarvesterError) return err;
  if (err instanceof Error) {
    return new HarvesterError({
      code: 'INTERNAL',
      user_message: USER_MESSAGES.INTERNAL,
      cause: err,
      context: { name: err.name, message: err.message },
    });
  }
  return new HarvesterError({
    code: 'INTERNAL',
    user_message: USER_MESSAGES.INTERNAL,
    context: { raw: String(err) },
  });
}
