import { z } from 'zod';

/**
 * Harvester config schema. Persisted to %APPDATA%\Harvester\config.json (or POSIX equivalent).
 * Bind rule (FR-AUTH-01): 0.0.0.0 is only allowed when lan_access.password_hash is set.
 */
export const configSchemaZ = z
  .object({
    config_schema_version: z.literal(1).default(1),
    port: z.number().int().min(1024).max(65535).default(5173),
    // Accept any IPv4/IPv6 literal. '127.0.0.1' = loopback only; '0.0.0.0' = every NIC;
    // a specific LAN IP (e.g. '192.168.2.13') binds just that interface.
    bind_host: z
      .string()
      .regex(/^(?:\d{1,3}(?:\.\d{1,3}){3}|\[?[0-9a-fA-F:]+\]?)$/, 'must be a valid IP address')
      .default('127.0.0.1'),
    mteam: z.object({
      api_key: z.string().min(10),
      base_url: z.string().url().default('https://api.m-team.cc'),
      user_agent: z.string().min(1).default('harvester/0.1'),
    }),
    qbt: z.object({
      host: z.string().default('127.0.0.1'),
      port: z.number().int().min(1).max(65535).default(8080),
      user: z.string().min(1),
      password: z.string().min(1),
      allowed_client_range: z.string().default('>=4.0.0 <=5.1.4'),
      allowed_client_override: z.boolean().default(false),
    }),
    poller: z
      .object({
        interval_sec: z.number().int().min(60).max(3600).default(90),
        backoff_cap_sec: z.number().int().min(60).max(7200).default(1800),
        // Re-evaluation — keep checking previously-skipped or errored
        // torrents in subsequent polls. Duplicate downloads are blocked by
        // two layers that bypass these knobs entirely: (a) canReEval only
        // re-considers rows whose prior decision is SKIPPED_RULE /
        // RE_EVALUATED_SKIPPED / ERROR, never GRABBED, and (b) the
        // downloader does an infohash collision check against ALL qBt
        // torrents before the add.
        reeval: z
          .object({
            // How long after a torrent's first sighting we'll still
            // reconsider it. Default is one week — previously 1 hour.
            window_sec: z.number().int().min(60).max(30 * 86400).default(7 * 86400),
            // Cap on re-eval attempts per torrent to bound churn. Default
            // was 3; now 30 so the typical nightly re-check cycle has
            // plenty of headroom.
            max_attempts: z.number().int().min(1).max(1000).default(30),
            // If a FREE window is about to expire, stop re-evaluating
            // below this headroom so we don't race an expiring discount.
            min_discount_headroom_sec: z
              .number()
              .int()
              .min(0)
              .max(86400)
              .default(600),
          })
          .default({
            window_sec: 7 * 86400,
            max_attempts: 30,
            min_discount_headroom_sec: 600,
          }),
      })
      .default({
        interval_sec: 90,
        backoff_cap_sec: 1800,
        reeval: { window_sec: 7 * 86400, max_attempts: 30, min_discount_headroom_sec: 600 },
      }),
    profile_probe: z
      .object({
        interval_sec: z.number().int().min(30).max(3600).default(60),
      })
      .default({ interval_sec: 60 }),
    disk_guard: z
      .object({
        enabled: z.boolean().default(true),
        // Trigger eviction when free space drops below this.
        low_free_gib: z.number().min(1).max(100000).default(50),
        // Stop evicting once free space climbs back above this.
        target_free_gib: z.number().min(1).max(100000).default(100),
        // Safety floor: never delete torrents younger than this.
        min_age_hours: z.number().min(0).max(720).default(6),
        // How often the worker tick runs.
        interval_sec: z.number().int().min(30).max(3600).default(300),
        // Cap deletes per tick so a bad signal can't nuke the whole set.
        max_delete_per_tick: z.number().int().min(1).max(100).default(10),
        // Also delete data (not just remove from qBt).
        remove_with_data: z.boolean().default(true),
      })
      .default({
        enabled: true,
        low_free_gib: 50,
        target_free_gib: 100,
        min_age_hours: 6,
        interval_sec: 300,
        max_delete_per_tick: 10,
        remove_with_data: true,
      })
      .superRefine((v, ctx) => {
        if (v.target_free_gib < v.low_free_gib) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['target_free_gib'],
            message: 'target_free_gib must be >= low_free_gib',
          });
        }
      }),
    downloads: z.object({
      default_save_path: z.string().min(1),
      soft_advisory_harvester_count: z.number().int().min(10).max(10000).default(100),
    }),
    lifecycle: z
      .object({
        seed_time_hours: z.number().min(0.1).max(720).default(72),
        zero_peers_minutes: z.number().min(1).max(1440).default(60),
        remove_with_data: z.boolean().default(true),
      })
      .default({ seed_time_hours: 72, zero_peers_minutes: 60, remove_with_data: true }),
    emergency: z
      .object({
        ratio_buffer: z.number().min(0).max(5).default(0.2),
        ratio_resume_buffer: z.number().min(0).max(5).default(0.4),
        tier_thresholds: z
          .array(
            z.object({
              min_weeks: z.number().int().min(0),
              min_ratio: z.number().min(0),
            }),
          )
          .default([
            { min_weeks: 0, min_ratio: 0.0 },
            { min_weeks: 4, min_ratio: 1.0 },
            { min_weeks: 8, min_ratio: 2.0 },
            { min_weeks: 12, min_ratio: 3.0 },
            { min_weeks: 16, min_ratio: 4.0 },
          ]),
      })
      .default({
        ratio_buffer: 0.2,
        ratio_resume_buffer: 0.4,
        tier_thresholds: [
          { min_weeks: 0, min_ratio: 0.0 },
          { min_weeks: 4, min_ratio: 1.0 },
          { min_weeks: 8, min_ratio: 2.0 },
          { min_weeks: 12, min_ratio: 3.0 },
          { min_weeks: 16, min_ratio: 4.0 },
        ],
      }),
    lan_access: z
      .object({
        password_hash: z.string().nullable().default(null),
        rate_limit: z
          .object({
            max_failures: z.number().int().min(1).default(10),
            window_sec: z.number().int().min(1).default(300),
            lockout_sec: z.number().int().min(1).default(300),
          })
          .default({ max_failures: 10, window_sec: 300, lockout_sec: 300 }),
      })
      .default({
        password_hash: null,
        rate_limit: { max_failures: 10, window_sec: 300, lockout_sec: 300 },
      }),
    logging: z
      .object({
        level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
        retain_days: z.number().int().min(1).max(90).default(14),
      })
      .default({ level: 'info', retain_days: 14 }),
    ui: z
      .object({
        theme: z.enum(['dark', 'light', 'system']).default('dark'),
        density: z.enum(['comfortable', 'compact']).default('comfortable'),
      })
      .default({ theme: 'dark', density: 'comfortable' }),
    first_run_completed: z.boolean().default(false),
    // FR-V2-43 / FR-V2-44: out-of-band webhook endpoints. Each category maps
    // to zero-or-more destinations. Empty map = no webhooks fire. URL is
    // validated only as a string here; deliver-time fetch() is the actual
    // validation. The 7 toast categories mirror the in-app toast registry.
    webhooks: z
      .object({
        enabled: z.boolean().default(false),
        targets: z
          .record(
            z.enum([
              'grab_success',
              'grab_failed',
              'emergency',
              'account_warning',
              'preflight',
              'lifecycle',
              'error',
            ]),
            z.array(
              z.object({
                url: z.string().url(),
                kind: z.enum(['discord', 'telegram', 'ntfy', 'generic']).default('generic'),
              }),
            ),
          )
          .default({}),
      })
      .default({ enabled: false, targets: {} }),
  })
  .refine(
    (cfg) => {
      // Only loopback is allowed without a password.
      const isLoopback = cfg.bind_host === '127.0.0.1' || cfg.bind_host === '::1';
      return isLoopback || cfg.lan_access.password_hash != null;
    },
    {
      message: 'Non-loopback bind_host requires lan_access.password_hash to be set',
      path: ['bind_host'],
    },
  );

export type AppConfig = z.infer<typeof configSchemaZ>;
