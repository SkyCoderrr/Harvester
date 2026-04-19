// FR-V2-40: human-readable explanations for the rejection_reason strings
// emitted by src/rules/evaluator.ts. The panel uses these when a skipped
// torrent is opened in the drawer.

export const REJECTION_EXPLANATIONS: Record<string, string> = {
  schedule_closed: 'The rule-set schedule is currently closed.',
  discount_whitelist: 'The discount is not in the rule-set whitelist.',
  min_free_hours_remaining:
    'The freeleech window is closing too soon to meet the rule-set minimum.',
  size_range: 'Torrent size is outside the rule-set min/max band.',
  category_whitelist: 'Category is not in the rule-set whitelist.',
  min_seeders: 'Seeder count is below the rule-set minimum.',
  max_seeders: 'Seeder count is above the rule-set maximum (swarm is saturated).',
  min_leechers: 'Leecher count is below the rule-set minimum.',
  max_leechers: 'Leecher count is above the rule-set maximum.',
  leecher_seeder_ratio_min:
    'Leecher/seeder ratio is below the rule-set minimum — low upload potential.',
  title_regex_include: 'Title does not match the rule-set include regex.',
  title_regex_exclude: 'Title matches the rule-set exclude regex.',
  free_disk_gib_min:
    'Free disk on the save path is below the rule-set minimum — grab would risk running out of space.',
  grab_verify_failed: 'qBittorrent accepted the torrent but verification after add failed.',
  malformed_raw_payload: 'The stored M-Team payload is malformed; cannot re-evaluate.',
};

export function explainRejection(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return REJECTION_EXPLANATIONS[reason] ?? reason;
}
