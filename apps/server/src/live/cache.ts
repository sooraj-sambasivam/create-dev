/** Tiny TTL cache. In-memory, per process, bounded so odd params cannot grow it forever. */
export function createTtlCache<T>(ttlMs: number, maxEntries = 500, now: () => number = Date.now) {
  const map = new Map<string, { at: number; value: T }>();
  return {
    get(key: string): T | undefined {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (now() - hit.at >= ttlMs) {
        map.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: T): void {
      if (map.size >= maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
      map.set(key, { at: now(), value });
    },
    get size(): number {
      return map.size;
    },
  };
}
