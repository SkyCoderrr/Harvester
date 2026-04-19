import { describe, it, expect } from 'vitest';
import { evaluateOne, type EvalContext } from './evaluator.js';
import { FACTORY_DEFAULT_RULE_SET } from './defaults.js';
import type { NormalizedTorrent, RuleSet } from '@shared/types.js';

// FR-V2-15 backend test: anchor the evaluator's rule-funnel against a small
// set of canonical torrents so the pass/skip/reason contract is locked in.
// The factory default ("FREE and 2X_FREE") is the under-test rule set.

const RULESET: RuleSet = {
  id: 1,
  name: FACTORY_DEFAULT_RULE_SET.name,
  enabled: true,
  schema_version: 1,
  rules: FACTORY_DEFAULT_RULE_SET.rules,
  created_at: 0,
  updated_at: 0,
};

const CTX: EvalContext = {
  now_ms: Date.now(),
  // Unlimited disk — we don't test free_disk_gib_min here.
  free_disk_gib: () => 10_000,
};

function torrent(partial: Partial<NormalizedTorrent>): NormalizedTorrent {
  return {
    mteam_id: 't1',
    name: 'Fixture.Title.1080p',
    size_bytes: 10 * 2 ** 30, // 10 GiB — within [1, 80]
    discount: 'FREE',
    discount_end_ts: Math.floor(Date.now() / 1000) + 6 * 3600, // 6h left
    seeders: 50,
    leechers: 5,
    category: '401',
    created_date_ts: Math.floor(Date.now() / 1000) - 600, // 10 min old
    raw_payload: {},
    ...partial,
  };
}

describe('evaluateOne (factory FREE and 2X_FREE)', () => {
  it('passes a vanilla FREE torrent', () => {
    expect(evaluateOne(torrent({}), RULESET, CTX)).toEqual({ pass: true });
  });

  it('passes 2X_FREE (both discounts whitelisted)', () => {
    expect(evaluateOne(torrent({ discount: '_2X_FREE' }), RULESET, CTX)).toEqual({
      pass: true,
    });
  });

  it('rejects NORMAL on discount_whitelist', () => {
    expect(evaluateOne(torrent({ discount: 'NORMAL' }), RULESET, CTX)).toEqual({
      pass: false,
      rejection_reason: 'discount_whitelist',
    });
  });

  it('rejects when less than 4h of freeleech remains', () => {
    const r = evaluateOne(
      torrent({ discount_end_ts: Math.floor(Date.now() / 1000) + 60 * 30 }),
      RULESET,
      CTX,
    );
    expect(r).toEqual({ pass: false, rejection_reason: 'min_free_hours_remaining' });
  });

  it('rejects too-small torrents on size_range (< 1 GiB)', () => {
    const r = evaluateOne(
      torrent({ size_bytes: 500 * 2 ** 20 }), // 0.5 GiB
      RULESET,
      CTX,
    );
    expect(r).toEqual({ pass: false, rejection_reason: 'size_range' });
  });

  it('rejects too-large torrents on size_range (> 80 GiB)', () => {
    const r = evaluateOne(
      torrent({ size_bytes: 120 * 2 ** 30 }),
      RULESET,
      CTX,
    );
    expect(r).toEqual({ pass: false, rejection_reason: 'size_range' });
  });

  it('rejects on free_disk_gib_min when disk is tight', () => {
    const tight: EvalContext = { ...CTX, free_disk_gib: () => 10 };
    expect(evaluateOne(torrent({}), RULESET, tight)).toEqual({
      pass: false,
      rejection_reason: 'free_disk_gib_min',
    });
  });
});
