import { z } from 'zod';

// All service mutations are bodyless today. Reject any payload to keep the
// surface tight (defense-in-depth).
export const emptyServiceBody = z
  .object({})
  .strict()
  .or(z.null())
  .optional();

export const sseTicketBody = z
  .object({
    scope: z.enum(['service-events', 'logs']),
  })
  .strict();

export type SseTicketBody = z.infer<typeof sseTicketBody>;
