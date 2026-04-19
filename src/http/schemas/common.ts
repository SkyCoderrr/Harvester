import { z } from 'zod';

// FR-V2-01: per-route body schemas. Every POST/PUT/DELETE handler that reads
// req.body MUST .parse() through one of these. Empty-body routes use
// `EmptyBody`. ZodError is caught by the global Fastify error handler and
// returned as 400 VALIDATION_FAILED.

export const EmptyBody = z.object({}).strict().or(z.null()).optional();

export type EmptyBodyT = z.infer<typeof EmptyBody>;
