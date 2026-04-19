import type { Discount } from '@shared/types';

// FR-V2-26 / TECH_DEBT M7: single source of truth for discount tokens.
// `DiscountBadge`, `GrabsChart`, and anywhere else that colors a discount
// imports from here — no raw hex in component bodies.

// The wire-level `Discount` strings come from `shared/types.ts` DISCOUNT. The
// `PERCENT_30` value has been removed from v2 everywhere per MTEAM_API §3.3.

export const DISCOUNT_LABEL: Record<Discount, string> = {
  NORMAL: 'NORMAL',
  PERCENT_70: '70%',
  PERCENT_50: '50%',
  FREE: 'FREE',
  _2X_FREE: '2X FREE',
  _2X: '2X',
  _2X_PERCENT_50: '2X 50%',
};

/**
 * Hex colors live in one place so the palette can be tweaked without hunting
 * through components. Consumers use `discountToken()` for style values and
 * `discountLabel()` for UI text.
 */
const DISCOUNT_HEX: Record<Discount, string> = {
  FREE: '#22c55e',
  _2X_FREE: '#a855f7',
  _2X: '#3b82f6',
  PERCENT_50: '#eab308',
  PERCENT_70: '#f97316',
  _2X_PERCENT_50: '#ec4899',
  NORMAL: '#a1a1aa',
};

export function discountToken(d: Discount | string): string {
  return DISCOUNT_HEX[d as Discount] ?? DISCOUNT_HEX.NORMAL;
}

export function discountLabel(d: Discount | string): string {
  return DISCOUNT_LABEL[d as Discount] ?? String(d).replace(/^_/, '');
}
