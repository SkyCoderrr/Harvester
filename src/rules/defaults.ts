import type { RuleSetInput } from './schema.js';

/** Factory default rule-set — seeded once on first-run completion. */
export const FACTORY_DEFAULT_RULE_SET: RuleSetInput = {
  name: 'FREE and 2X_FREE',
  enabled: true,
  rules: {
    schema_version: 1,
    discount_whitelist: ['FREE', '_2X_FREE'],
    min_free_hours_remaining: 4.0,
    size_gib_min: 1.0,
    size_gib_max: 80.0,
    category_whitelist: null,
    min_seeders: null,
    max_seeders: null,
    min_leechers: null,
    max_leechers: null,
    leecher_seeder_ratio_min: null,
    title_regex_include: null,
    title_regex_exclude: null,
    free_disk_gib_min: 100,
    first_seeder_fast_path: { enabled: true, max_age_minutes: 10 },
    qbt_category: 'mteam-auto',
    qbt_tags_extra: [],
    qbt_save_path: null,
    qbt_upload_limit_kbps: null,
    schedule: null,
    lifecycle_overrides: null,
  },
};
