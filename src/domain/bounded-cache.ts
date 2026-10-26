// A Map used as a small cache that drops its oldest entries.

// Sets a Map entry as the newest and drops the oldest past maxEntries.
function setBoundedCacheEntry<K, V>(cache: Map<K, V> | null | undefined, key: K | null | undefined, value: V, maxEntries: unknown): V {
  if (!cache || typeof cache.set !== 'function' || key === null || typeof key === 'undefined') {
    return value;
  }
  const parsedLimit = Math.floor(Number(maxEntries));
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 1;
  if (typeof cache.delete === 'function' && typeof cache.has === 'function' && cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  if (typeof cache.size !== 'number' || cache.size <= limit ||
      typeof cache.keys !== 'function' || typeof cache.delete !== 'function') {
    return value;
  }
  while (cache.size > limit) {
    const oldest = cache.keys().next();
    if (!oldest || oldest.done) {
      break;
    }
    cache.delete(oldest.value);
  }
  return value;
}

export {
  setBoundedCacheEntry
};
