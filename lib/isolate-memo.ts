/**
 * Keeps an async result in this Worker isolate's memory for `ttlMs`, in front of unstable_cache.
 * The first spot page render per isolate paid 135-860 ms for the R2 incremental-cache read plus the D1 tag check
 * (EM4 2026-11-28); later renders in the same isolate now reuse the result. A failed load is never kept.
 * A "spots" revalidateTag reaches this layer only after `ttlMs`, so keep it short.
 */
export function isolateMemo<A extends unknown[], R>(load: (...args: A) => Promise<R>, ttlMs: number, maxEntries = 64,
  now: () => number = Date.now): (...args: A) => Promise<R> {
  const entries = new Map<string, { at: number; value: Promise<R> }>();
  return (...args: A) => {
    const key = JSON.stringify(args);
    const hit = entries.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    if (hit) entries.delete(key);
    const value = load(...args);
    entries.set(key, { at: now(), value });
    value.catch(() => { if (entries.get(key)?.value === value) entries.delete(key); });
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value as string);
    return value;
  };
}
