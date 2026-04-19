import { ruleSetInputZ, type RuleSetInput } from './schema.js';

export interface ValidationResult {
  ok: boolean;
  value?: RuleSetInput;
  errors?: Array<{ path: string[]; message: string }>;
}

export function validateRuleSetInput(input: unknown): ValidationResult {
  const r = ruleSetInputZ.safeParse(input);
  if (r.success) return { ok: true, value: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => ({ path: i.path.map(String), message: i.message })),
  };
}
