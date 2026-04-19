/**
 * Per PRD FR-CP-03, Harvester must NEVER call an M-Team endpoint that the sanctioned SDK
 * marked as forbidden. The spike (spike/SPIKE_REPORT.md §1) established that we don't use
 * a wrapper SDK — the API is a flat Swagger service. So this list is empty, and stays
 * empty. Any call Harvester makes is a direct user action (search, genDlToken, profile,
 * detail).
 *
 * This file exists as a permanent sentinel for the audit trail.
 */
export const FORBIDDEN_METHODS: readonly string[] = [];

export function isForbidden(method: string): boolean {
  return (FORBIDDEN_METHODS as readonly string[]).includes(method);
}
