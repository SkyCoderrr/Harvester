/** Cached RegExp compilation for rule evaluator. */
const cache = new Map<string, RegExp | null>();

export function compileUnicodeRegex(pattern: string, flags = 'iu'): RegExp | null {
  const key = pattern + '|' + flags;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  try {
    const r = new RegExp(pattern, flags);
    cache.set(key, r);
    return r;
  } catch {
    cache.set(key, null);
    return null;
  }
}

export function clearRegexCache(): void {
  cache.clear();
}
