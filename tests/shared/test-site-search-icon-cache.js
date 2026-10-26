const assert = require('assert');
const iconCache = require('../../src/shared/search/site-search-icon-cache.ts');
const shortcutFavicon = require('../helpers/shortcut-favicon.ts');
const { siteSearchIconCache } = require('../../src/domain/settings/search.ts');

// Site search icons are read from storage once per surface; a change to the
// stored copy replaces them at once and wins over a read still underway.

const STORAGE_KEY = siteSearchIconCache.key;
const CACHE_OPTIONS = shortcutFavicon.SITE_SEARCH_CACHE_OPTIONS;
const NOW = 1_700_000_000_000;
const PAGE = 'https://example.com/';
const OTHER_PAGE = 'https://other.example/';
const ICON = 'data:image/png;base64,AA==';

function createState() {
  return {
    siteSearchIconCache: {},
    siteSearchIconCacheLoaded: false,
    siteSearchIconCacheRevision: 0,
    siteSearchIconCacheLoadPromise: null
  };
}

function createStore(readAll) {
  return { storageKey: STORAGE_KEY, cacheOptions: CACHE_OPTIONS, readAll };
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

function storedIcons(page) {
  return shortcutFavicon.setCachedIcon({}, page, ICON, '', NOW, CACHE_OPTIONS);
}

(async () => {
  {
    const state = createState();
    let reads = 0;
    const read = deferred();
    const cache = iconCache.createSiteSearchIconCache({
      store: createStore(() => { reads += 1; return read.promise; }),
      state
    });
    assert.strictEqual(cache.storageKey, STORAGE_KEY, 'the cache names the key its changes arrive under');
    const first = cache.loadSiteSearchIconCache();
    assert.strictEqual(cache.loadSiteSearchIconCache(), first, 'a second caller shares the read underway');
    const stored = storedIcons(PAGE);
    read.resolve(stored);
    assert.strictEqual(await first, stored);
    assert.strictEqual(state.siteSearchIconCache, stored);
    assert.strictEqual(state.siteSearchIconCacheLoaded, true);
    assert.strictEqual(await cache.loadSiteSearchIconCache(), stored, 'later callers get the loaded icons');
    assert.strictEqual(reads, 1, 'storage is read once');
  }
  {
    const state = createState();
    const read = deferred();
    const cache = iconCache.createSiteSearchIconCache({
      store: createStore(() => read.promise),
      state,
      now: () => NOW
    });
    const loading = cache.loadSiteSearchIconCache();
    // The stored copy changes while the first read is underway.
    const changed = cache.applyStoredSiteSearchIcons(storedIcons(OTHER_PAGE));
    assert.deepStrictEqual(Object.keys(changed), [OTHER_PAGE]);
    assert.strictEqual(state.siteSearchIconCache, changed, 'the change applies at once');
    assert.strictEqual(state.siteSearchIconCacheLoaded, true);
    assert.strictEqual(await cache.loadSiteSearchIconCache(), changed, 'new callers get the changed icons');
    read.resolve(storedIcons(PAGE));
    assert.strictEqual(await loading, changed, 'the older read does not overwrite the change');
    assert.strictEqual(state.siteSearchIconCache, changed);
  }
  {
    const state = createState();
    const cache = iconCache.createSiteSearchIconCache({
      store: createStore(() => Promise.resolve({})),
      state,
      now: () => NOW
    });
    assert.deepStrictEqual(cache.applyStoredSiteSearchIcons('not a cache'), {},
      'a stored value that is no cache leaves no icons');
    assert.deepStrictEqual(
      cache.applyStoredSiteSearchIcons({ [PAGE]: { dataUrl: ICON, sourceUrl: '', updatedAt: NOW - CACHE_OPTIONS.cacheTtlMs - 1 } }),
      {},
      'icons past the cache lifetime are dropped'
    );
  }
  {
    const state = createState();
    const cache = iconCache.createSiteSearchIconCache({
      store: createStore(() => Promise.reject(new Error('quota'))),
      state
    });
    assert.deepStrictEqual(await cache.loadSiteSearchIconCache(), {}, 'a failed read leaves no icons');
    assert.strictEqual(state.siteSearchIconCacheLoaded, true, 'and is not retried on every call');
  }
  console.log('site search icon cache tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
