// Canonical cross-cutting types for Harvester.
// Shared by backend + frontend. No runtime deps.

/**
 * M-Team discount values.
 * SPIKE-AMENDED: OpenAPI exposes 7 values (IMPLEMENTATION.md §3.1 listed only 6).
 * PERCENT_70 and _2X_PERCENT_50 are real and appear in production data.
 */
export const DISCOUNT = [
  'NORMAL',
  'PERCENT_70',
  'PERCENT_50',
  'FREE',
  '_2X_FREE',
  '_2X',
  '_2X_PERCENT_50',
] as const;
export type Discount = typeof DISCOUNT[number];

/** Canonical torrent decision — mirrors the SQL CHECK in db/migrations/0001_init.sql. */
export const DECISION = [
  'GRABBED',
  'SKIPPED_RULE',
  'SKIPPED_DUP',
  'SKIPPED_FLIPPED',
  'RE_EVALUATED_GRABBED',
  'RE_EVALUATED_SKIPPED',
  'ERROR',
] as const;
export type Decision = typeof DECISION[number];

export const SERVICE_STATUS = [
  'RUNNING',
  'PAUSED_USER',
  'PAUSED_EMERGENCY',
  'PAUSED_BACKOFF',
  'STOPPED',
] as const;
export type ServiceStatus = typeof SERVICE_STATUS[number];

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * Canonical normalized torrent, produced by util/normalize.ts from a raw M-Team row.
 * See spike/SPIKE_REPORT.md §5-6 for the raw shape this is derived from.
 */
export interface NormalizedTorrent {
  mteam_id: string;
  name: string;
  size_bytes: number;
  discount: Discount;
  /** unix seconds; null if NORMAL or if the raw discountEndTime was absent */
  discount_end_ts: number | null;
  seeders: number;
  leechers: number;
  /** category id (numeric string on wire). We keep as string — matching up to human names is server-side later. */
  category: string | null;
  /** unix seconds of M-Team's createdDate */
  created_date_ts: number;
  /** full raw M-Team object for audit; stored as JSON in torrent_events.raw_payload */
  raw_payload: unknown;
}

// -- Rule schema v1 ---------------------------------------------------------

export interface RuleSetV1 {
  schema_version: 1;
  discount_whitelist: Discount[];
  min_free_hours_remaining: number | null;
  size_gib_min: number;
  size_gib_max: number;
  category_whitelist: string[] | null;
  min_seeders: number | null;
  max_seeders: number | null;
  min_leechers: number | null;
  max_leechers: number | null;
  /** @deprecated kept for back-compat; UI no longer exposes it. */
  leecher_seeder_ratio_min: number | null;
  title_regex_include: string | null;
  title_regex_exclude: string | null;
  free_disk_gib_min: number | null;
  /**
   * Hard age gate. If non-null, only grab torrents whose `created_date_ts`
   * (release time on M-Team) is within this many minutes of "now". Distinct
   * from `first_seeder_fast_path.max_age_minutes`, which is a soft *bypass*
   * for swarm checks during a grace window.
   */
  max_release_age_minutes: number | null;
  first_seeder_fast_path: {
    enabled: boolean;
    max_age_minutes: number;
  } | null;
  qbt_category: string;
  qbt_tags_extra: string[];
  qbt_save_path: string | null;
  qbt_upload_limit_kbps: number | null;
  schedule: ScheduleSpec | null;
  lifecycle_overrides: LifecycleOverrides | null;
}

export interface ScheduleSpec {
  /** 'system' or IANA zone */
  timezone: string;
  windows: Array<{
    days: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
    start: string;
    end: string;
  }>;
}

export interface LifecycleOverrides {
  seed_time_hours: number | null;
  zero_peers_minutes: number | null;
  remove_with_data: boolean | null;
}

export interface RuleSet {
  id: number;
  name: string;
  enabled: boolean;
  schema_version: number;
  rules: RuleSetV1;
  created_at: number;
  updated_at: number;
}

// -- Evaluator --------------------------------------------------------------

export type EvaluationResult =
  | { kind: 'GRABBED'; matched: Array<{ id: number; name: string }> }
  | { kind: 'SKIPPED_RULE'; per_rule_set: Array<{ id: number; name: string; rejection_reason: string }> }
  | { kind: 'SKIPPED_DUP' }
  | { kind: 'SKIPPED_FLIPPED' };

// -- Harvester API envelope -------------------------------------------------

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface ApiError {
  code: string;
  user_message: string;
  details?: unknown;
  retryable?: boolean;
}

// -- Dashboard / KPIs -------------------------------------------------------

export interface DashboardSummary {
  ratio: number | null;
  /** Change in ratio over the previous ~1h (positive = up). `null` if no baseline. */
  ratio_delta_1h: number | null;
  uploaded_today: number;
  downloaded_today: number;
  /** Active = currently transferring data (downloading + uploading). */
  active_count: number;
  /**
   * Seeding = any torrent whose role is to upload, regardless of peer activity
   * at the moment. Covers uploading, queuedUP, stalledUP. v2 bucket.
   */
  seeding_count: number;
  /**
   * Stalled = trying to download but no peers. Does NOT include `stalledUP`
   * (a completed torrent with no active leechers is still healthy seeding,
   * not stalled). Changed in v2; v1 conflated both.
   */
  stalled_count: number;
  /** Errored or checking/paused states. */
  error_count: number;
  /** Deprecated split; kept for wire compat. */
  active_leeching: number;
  active_seeding: number;
  grabs_24h: number;
  /** Delta vs. the 24h-before-24h window (positive = trending up). */
  grabs_delta_24h: number;
  expiring_1h: number;
  /** Free GiB on the save-path filesystem. */
  disk_free_gib: number;
  /** Total bytes currently consumed on disk by Harvester-tagged torrents
   *  (sum of `size * progress`). */
  harvester_used_bytes: number;
  bonus_points: number | null;
  bonus_delta_1h: number | null;
  tier: string | null;
  tier_min_ratio: number | null;
  harvester_torrent_count: number;
  // FR-V2-32: Phase-1 additive fields. All nullable so cold/empty DBs degrade
  // to "—" in the UI rather than 0.
  uploaded_bytes_total: number | null;
  uploaded_bytes_24h: number | null;
  uploaded_bytes_delta_24h: number | null;
  downloaded_bytes_total: number | null;
  downloaded_bytes_24h: number | null;
  downloaded_bytes_delta_24h: number | null;
  disk_total_gib: number | null;
  disk_used_gib: number | null;
  account_warned: 0 | 1 | null;
  account_leech_warn: 0 | 1 | null;
  account_vip: 0 | 1 | null;
  seedtime_sec: number | null;
  seedtime_sec_delta_24h: number | null;
  // FR-V2-32: surface persisted user intent so the UI can show "Paused (user)"
  service_desired_user_intent: 'running' | 'paused';
}

// -- Torrent row (for /api/torrents and UI table) --------------------------

export interface TorrentRow {
  mteam_id: string;
  infohash: string | null;
  name: string;
  size_bytes: number;
  discount: Discount;
  added_at: number;
  state: string;
  progress: number;
  dlspeed: number;
  upspeed: number;
  eta: number;
  ratio: number | null;
  uploaded_bytes: number | null;
  downloaded_bytes: number | null;
  seeders: number | null;
  leechers: number | null;
  discount_end_ts: number | null;
  matched_rule: string | null;
  tags: string[];
  save_path: string | null;
}

// -- Log row ---------------------------------------------------------------

export interface LogRow {
  id: number;
  ts: number;
  level: LogLevel;
  component: string;
  message: string;
  meta: Record<string, unknown>;
}

// -- Stats -----------------------------------------------------------------

export interface StatsDaily {
  date: string;
  grabbed_count: number;
  uploaded_bytes: number;
  downloaded_bytes: number;
  active_torrents_peak: number;
  ratio_end_of_day: number | null;
  bonus_points_end_of_day: number | null;
}

// -- Settings --------------------------------------------------------------

export interface Settings {
  mteam: { api_key_masked: string; api_key_set: boolean };
  qbt: {
    host: string;
    port: number;
    user: string;
    password_set: boolean;
    version?: string;
    allowed_client_ok: boolean;
  };
  poller: { interval_sec: number };
  downloads: { default_save_path: string };
  lifecycle: {
    seed_time_hours: number;
    zero_peers_minutes: number;
    remove_with_data: boolean;
  };
  emergency: {
    tier_thresholds: Array<{ min_weeks: number; min_ratio: number }>;
    ratio_buffer: number;
  };
  lan_access: { enabled: boolean; password_set: boolean };
  ui: {
    theme: 'dark' | 'light' | 'system';
    density: 'comfortable' | 'compact';
  };
  telemetry: { enabled: false };
  first_run_completed: boolean;
}

// -- Service state view ----------------------------------------------------

export interface ServiceStateView {
  status: ServiceStatus;
  last_poll_at: number | null;
  consecutive_errors: number;
  backoff_factor: number;
  allowed_client_ok: boolean;
  preflight: {
    mteam: boolean;
    qbt: boolean;
    allowed_client: boolean;
    disk: boolean;
  };
  emergency: {
    active: boolean;
    current_ratio: number | null;
    tier_min: number | null;
  } | null;
  lan: { enabled: boolean; listening_on: string };
  /**
   * FR-V2-03 / FR-V2-36: persisted user intent. Boot logic honors
   * `desired_user_intent === 'paused'` and skips worker startup.
   * Distinct from `status` so emergency/backoff transitions don't clobber it.
   */
  desired_user_intent: 'running' | 'paused';
}

// -- M-Team raw types (reflects real wire contract from spike) --------------

/**
 * Subset of M-Team profile we actually consume. Complete shape in spike report §9.
 * All numeric fields arrive as STRINGS on the wire; normalizer must coerce.
 */
export interface MTeamProfile {
  id: string;
  username: string;
  email: string;
  enabled: boolean;
  allowDownload: boolean;
  parked: boolean;
  memberStatus: {
    vip: boolean;
    donor: boolean;
    warned: boolean;
    leechWarn: boolean;
    lastLogin: string;
    lastBrowse: string;
  };
  memberCount: {
    bonus: string;
    uploaded: string;
    downloaded: string;
    shareRate: string;
    charity: string;
  };
  seedtime: string;
  leechtime: string;
  authorities: string[];
  /** `"YYYY-MM-DD HH:mm:ss"` in Asia/Taipei — used to derive account-age → tier */
  createdDate: string;
}

/**
 * Derived/normalized profile that Harvester stores in profile_snapshots.
 */
export interface NormalizedProfile {
  ts: number;
  uploaded_bytes: number;
  downloaded_bytes: number;
  ratio: number;
  bonus_points: number;
  weeks_since_signup: number;
  account_tier: string | null;
  tier_min_ratio: number | null;
  raw_payload: unknown;
  // FR-V2-30 / FR-V2-31: account-health + duration columns surfaced on the
  // dashboard. 0/1 ints for the booleans; null seedtime/leechtime if missing.
  warned: 0 | 1;
  leech_warn: 0 | 1;
  vip: 0 | 1;
  seedtime_sec: number | null;
  leechtime_sec: number | null;
}

/** Search-result row in M-Team's shape. See spike §5. */
export interface MTeamTorrentStatus {
  discount: Discount;
  discountEndTime: string | null;
  seeders: string;
  leechers: string;
  timesCompleted: string;
  status: string;
  banned: boolean;
  visible: boolean;
  lastAction: string;
  lastSeederAction: string;
}

export interface MTeamTorrent {
  id: string;
  createdDate: string;
  lastModifiedDate: string;
  name: string;
  smallDescr: string;
  size: string;
  category: string;
  infoHash: string | null;
  status: MTeamTorrentStatus;
  numfiles: string;
  labelsNew: string[];
  anonymous: boolean;
  /** present on `/torrent/detail` responses only */
  descr?: string;
  /** present on `/torrent/detail` responses only */
  originFileName?: string;
  [key: string]: unknown;
}

export interface MTeamSearchResult {
  pageNumber: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: MTeamTorrent[];
}
