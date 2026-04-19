import { discountLabel, discountToken } from '../../lib/discount';

// FR-V2-26: single source of truth for discount color + label. Tokens
// resolve to CSS custom-property-free hex values since our discount palette
// lives in discount.ts; no raw hex in component bodies.

export function DiscountBadge({ discount }: { discount: string }): JSX.Element {
  const color = discountToken(discount);
  return (
    <span
      className="text-[10px] font-mono px-1.5 py-0.5 rounded border font-medium"
      style={{
        borderColor: color + '44',
        background: color + '1a',
        color,
      }}
    >
      {discountLabel(discount)}
    </span>
  );
}
