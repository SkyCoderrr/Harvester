import type { Discount } from '@shared/types';
import { discountToken } from '../../lib/discount';

// UI buckets — each maps to one or more backend `Discount` values. We
// collapse upload-boost variants onto the same bucket as their plain
// counterpart because the rule decision hinges on *download cost*; the 2x
// upload credit is a bonus the user always wants when available.
export interface DiscountBucket {
  key: string;
  label: string;
  backend: Discount[];
  color: string;
}

export const DISCOUNT_BUCKETS: DiscountBucket[] = [
  { key: 'FREE', label: 'FREE', backend: ['FREE', '_2X_FREE'], color: discountToken('FREE') },
  {
    key: 'PERCENT_50',
    label: '50% off',
    backend: ['PERCENT_50', '_2X_PERCENT_50'],
    color: discountToken('PERCENT_50'),
  },
  {
    key: 'PERCENT_70',
    label: '30% off',
    backend: ['PERCENT_70'],
    color: discountToken('PERCENT_70'),
  },
  {
    key: 'NORMAL',
    label: 'NORMAL',
    backend: ['NORMAL', '_2X'],
    color: discountToken('NORMAL'),
  },
];

export function bucketSelected(bucket: DiscountBucket, whitelist: Discount[]): boolean {
  return bucket.backend.every((d) => whitelist.includes(d));
}

export function toggleBucket(bucket: DiscountBucket, whitelist: Discount[]): Discount[] {
  if (bucketSelected(bucket, whitelist)) {
    return whitelist.filter((d) => !bucket.backend.includes(d));
  }
  const set = new Set<Discount>(whitelist);
  for (const d of bucket.backend) set.add(d);
  return Array.from(set);
}
