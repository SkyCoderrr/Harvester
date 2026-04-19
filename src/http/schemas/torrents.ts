import { z } from 'zod';

const action = z.enum(['pause', 'resume', 'recheck', 'remove', 'remove_with_data']);

export const torrentsBulkActionBody = z
  .object({
    infohashes: z.array(z.string().regex(/^[A-Fa-f0-9]{40}$/)).max(500).optional(),
    ids: z.array(z.string().min(1).max(64)).max(500).optional(),
    action,
  })
  .strict()
  .refine((b) => (b.infohashes?.length ?? 0) + (b.ids?.length ?? 0) > 0, {
    message: 'one of infohashes or ids must be non-empty',
  });

export const torrentsActionBody = z
  .object({
    action,
  })
  .strict();

export type TorrentsBulkActionBody = z.infer<typeof torrentsBulkActionBody>;
export type TorrentsActionBody = z.infer<typeof torrentsActionBody>;
