import { useCallback, useEffect, useState } from 'react';

/**
 * useState, but mirrored to localStorage under `key`. Values must be JSON-
 * serializable. Reads from storage on mount so the same choice survives page
 * navigation within the SPA and full reloads.
 *
 * If parsing or validation fails, falls back to `initial` and overwrites the
 * bad value on the next write. The optional `validate` guard protects against
 * stale keys from older code (e.g. if the set of allowed values changes).
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
  validate?: (v: unknown) => v is T,
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return initial;
      const parsed = JSON.parse(raw) as unknown;
      if (validate && !validate(parsed)) return initial;
      return parsed as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Full storage / disabled storage — silently ignore; in-memory state still works.
    }
  }, [key, value]);

  const set = useCallback((v: T) => setValue(v), []);
  return [value, set];
}
