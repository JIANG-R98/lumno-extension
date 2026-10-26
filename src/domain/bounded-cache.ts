// A Map used as a small cache that drops its oldest entries.

// Sets a Map entry as the newest and drops the oldest past maxEntries.
function readEntryLimit(maxEntries: unknown): number {
  const parsedLimit = Math.floor(Number(maxEntries));
  return Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 1;
}

// Drops the oldest entries until the cache fits its limit.
function trimBoundedCache<K, V>(cache: Map<K, V>, limit: number): void {
  if (typeof cache.size !== 'number' || typeof cache.keys !== 'function' || typeof cache.delete !== 'function') {
    return;
  }
  while (cache.size > limit) {
    const oldest = cache.keys().next();
    if (!oldest || oldest.done) {
      break;
    }
    cache.delete(oldest.value);
  }
}

function setBoundedCacheEntry<K, V>(cache: Map<K, V> | null | undefined, key: K | null | undefined, value: V, maxEntries: unknown): V {
  if (!cache || typeof cache.set !== 'function' || key === null || typeof key === 'undefined') {
    return value;
  }
  if (typeof cache.delete === 'function' && typeof cache.has === 'function' && cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  trimBoundedCache(cache, readEntryLimit(maxEntries));
  return value;
}

export {
  setBoundedCacheEntry
};
