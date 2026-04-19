import { z } from 'zod';

// PUT /settings is a sparse patch — every field is optional. We don't try to
// recreate the full AppConfig schema here; the underlying config.update() call
// re-validates against configSchemaZ. This schema enforces shape + types only.
export const settingsPatchBody = z
  .object({
    poller: z
      .object({ interval_sec: z.number().int().min(15).max(3600).optional() })
      .strict()
      .optional(),
    lifecycle: z
      .object({
        seed_time_hours: z.number().int().min(0).max(24 * 365).optional(),
        zero_peers_minutes: z.number().int().min(0).max(60 * 24 * 30).optional(),
        remove_with_data: z.boolean().optional(),
      })
      .strict()
      .optional(),
    downloads: z
      .object({
        default_save_path: z.string().min(1).max(4096).optional(),
      })
      .strict()
      .optional(),
    ui: z
      .object({
        theme: z.enum(['dark', 'light', 'system']).optional(),
      })
      .partial()
      .passthrough()
      .optional(),
    mteam: z
      .object({
        api_key: z.string().min(8).max(512).optional(),
        base_url: z.string().url().optional(),
        user_agent: z.string().min(1).max(256).optional(),
      })
      .strict()
      .optional(),
    qbt: z
      .object({
        host: z.string().min(1).max(255).optional(),
        port: z.number().int().min(1).max(65535).optional(),
        user: z.string().min(1).max(256).optional(),
        password: z.string().min(1).max(512).optional(),
      })
      .strict()
      .optional(),
    emergency: z
      .object({
        tier_thresholds: z
          .array(z.object({ tier: z.string(), min_ratio: z.number() }).strict())
          .max(50)
          .optional(),
        ratio_buffer: z.number().min(0).max(10).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const settingsTestMteamBody = z
  .object({
    api_key: z.string().min(8).max(512).optional(),
  })
  .strict();

export const settingsLanAccessBody = z
  .object({
    enabled: z.boolean(),
    password: z.string().min(1).max(512).optional(),
    bind_host: z.string().min(1).max(255).optional(),
  })
  .strict();

export const settingsTestQbtBody = z
  .object({
    host: z.string().min(1).max(255).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    user: z.string().min(1).max(256).optional(),
    pass: z.string().min(1).max(512).optional(),
  })
  .strict();

export type SettingsPatchBody = z.infer<typeof settingsPatchBody>;
export type SettingsTestMteamBody = z.infer<typeof settingsTestMteamBody>;
export type SettingsLanAccessBody = z.infer<typeof settingsLanAccessBody>;
export type SettingsTestQbtBody = z.infer<typeof settingsTestQbtBody>;
