import { z } from 'zod';

export const firstRunSaveBody = z
  .object({
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
    downloads: z
      .object({
        default_save_path: z.string().min(1).max(4096).optional(),
      })
      .strict()
      .optional(),
    seed_factory_defaults: z.boolean().optional(),
  })
  .strict();

export type FirstRunSaveBody = z.infer<typeof firstRunSaveBody>;
