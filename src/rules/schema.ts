import { z } from 'zod';
import { DISCOUNT } from '@shared/types.js';

export const discountZ = z.enum(DISCOUNT);

export const hhmmZ = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const dayZ = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

export const scheduleWindowZ = z.object({
  days: z.array(dayZ).min(1),
  start: hhmmZ,
  end: hhmmZ,
});

export const scheduleZ = z.object({
  timezone: z.string().min(1),
  windows: z.array(scheduleWindowZ).min(1),
});

export const lifecycleOverridesZ = z
  .object({
    seed_time_hours: z.number().min(0.1).max(720).nullable(),
    zero_peers_minutes: z.number().min(1).max(1440).nullable(),
    remove_with_data: z.boolean().nullable(),
  })
  .nullable();

export const ruleSetV1Z = z
  .object({
    schema_version: z.literal(1),
    discount_whitelist: z.array(discountZ).min(1),
    min_free_hours_remaining: z.number().min(0).max(168).nullable(),
    size_gib_min: z.number().min(0).max(100000),
    size_gib_max: z.number().min(0).max(100000),
    category_whitelist: z.array(z.string().min(1).max(64)).nullable(),
    min_seeders: z.number().int().min(0).nullable(),
    max_seeders: z.number().int().min(0).nullable(),
    min_leechers: z.number().int().min(0).nullable(),
    max_leechers: z.number().int().min(0).nullable().default(null),
    leecher_seeder_ratio_min: z.number().min(0).nullable(),
    title_regex_include: z.string().max(500).nullable(),
    title_regex_exclude: z.string().max(500).nullable(),
    free_disk_gib_min: z.number().min(0).max(1000000).nullable(),
    first_seeder_fast_path: z
      .object({
        enabled: z.boolean(),
        max_age_minutes: z.number().int().min(1).max(1440),
      })
      .nullable(),
    qbt_category: z.string().min(1).max(64).regex(/^[A-Za-z0-9 _-]+$/),
    qbt_tags_extra: z.array(z.string().min(1).max(64)).max(16),
    qbt_save_path: z.string().max(500).nullable(),
    qbt_upload_limit_kbps: z.number().int().min(0).max(1000000).nullable(),
    schedule: scheduleZ.nullable(),
    lifecycle_overrides: lifecycleOverridesZ,
  })
  .refine((v) => v.size_gib_min <= v.size_gib_max, {
    message: 'size_gib_min must be ≤ size_gib_max',
    path: ['size_gib_max'],
  })
  .refine(
    (v) =>
      v.min_seeders == null || v.max_seeders == null || v.min_seeders <= v.max_seeders,
    { message: 'min_seeders must be ≤ max_seeders', path: ['max_seeders'] },
  )
  .refine(
    (v) =>
      v.min_leechers == null || v.max_leechers == null || v.min_leechers <= v.max_leechers,
    { message: 'min_leechers must be ≤ max_leechers', path: ['max_leechers'] },
  )
  .refine(
    (v) => {
      if (v.title_regex_include == null) return true;
      try {
        new RegExp(v.title_regex_include, 'u');
        return true;
      } catch {
        return false;
      }
    },
    { message: 'title_regex_include is not a valid Unicode regex', path: ['title_regex_include'] },
  )
  .refine(
    (v) => {
      if (v.title_regex_exclude == null) return true;
      try {
        new RegExp(v.title_regex_exclude, 'u');
        return true;
      } catch {
        return false;
      }
    },
    { message: 'title_regex_exclude is not a valid Unicode regex', path: ['title_regex_exclude'] },
  );

export const ruleSetInputZ = z.object({
  name: z.string().min(1).max(64).regex(/^[A-Za-z0-9 _-]+$/),
  enabled: z.boolean(),
  rules: ruleSetV1Z,
});

export type RuleSetInput = z.infer<typeof ruleSetInputZ>;
