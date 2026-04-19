import { z } from 'zod';

// Rule-set body validation. The full rule-set semantics are validated by
// validateRuleSetInput() in src/rules/validate.ts; this schema only enforces
// outer shape so we can fail fast on garbage input before that runs.
//
// `rules` is a nested object (RuleSetV1), NOT an array. The v2.0-Phase0
// schema had this wrong and 400'd every rule-set save.
export const ruleSetInputBody = z
  .object({
    name: z.string().min(1).max(128),
    enabled: z.boolean().optional(),
    rules: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const ruleDryRunBody = z
  .object({
    simulate_at: z.number().int().nonnegative().optional(),
    sample_size: z.number().int().min(1).max(2000).optional(),
  })
  .strict()
  .optional();

export const ruleIdParam = z.object({ id: z.string().regex(/^\d+$/) }).strict();

export type RuleSetInputBody = z.infer<typeof ruleSetInputBody>;
export type RuleDryRunBody = z.infer<typeof ruleDryRunBody>;
