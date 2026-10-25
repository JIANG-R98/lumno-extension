const assert = require('assert');
const iconCache = require('../../src/newtab/search/site-search-icon-cache.ts');

// Site search icons are read from storage once per page; a storage change
// that lands while the read is underway wins over it.

function createState() {
  return {
    siteSearchIconCache: {},
    siteSearchIconCacheLoaded: false,
    siteSearchIconCacheRevision: 0,
    siteSearchIconCacheLoadPromise: null
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

(async () => {
  const stored = { 'https://example.com/': { dataUrl: 'data:image/png;base64,AA==', sourceUrl: '', updatedAt: 1 } };
  {
    const state = createState();
    let reads = 0;
    const read = deferred();
    const { loadSiteSearchIconCache } = iconCache.createSiteSearchIconCache({
      store: { readAll: () => { reads += 1; return read.promise; } },
      pageState: state
    });
    const first = loadSiteSearchIconCache();
    assert.strictEqual(loadSiteSearchIconCache(), first, 'a second caller shares the read underway');
    read.resolve(stored);
    assert.strictEqual(await first, stored);
    assert.strictEqual(state.siteSearchIconCache, stored);
    assert.strictEqual(state.siteSearchIconCacheLoaded, true);
    assert.strictEqual(await loadSiteSearchIconCache(), stored, 'later callers get the loaded icons');
    assert.strictEqual(reads, 1, 'storage is read once');
  }
  {
    const state = createState();
    const read = deferred();
    const { loadSiteSearchIconCache } = iconCache.createSiteSearchIconCache({
      store: { readAll: () => read.promise },
      pageState: state
    });
    const loading = loadSiteSearchIconCache();
    // A storage change replaces the icons while the read is underway.
    const changed = { 'https://other.example/': stored['https://example.com/'] };
    state.siteSearchIconCache = changed;
    state.siteSearchIconCacheRevision += 1;
    read.resolve(stored);
    assert.strictEqual(await loading, changed, 'the older read does not overwrite the change');
    assert.strictEqual(state.siteSearchIconCache, changed);
  }
  {
    const state = createState();
    const { loadSiteSearchIconCache } = iconCache.createSiteSearchIconCache({
      store: { readAll: () => Promise.reject(new Error('quota')) },
      pageState: state
    });
    assert.deepStrictEqual(await loadSiteSearchIconCache(), {}, 'a failed read leaves no icons');
    assert.strictEqual(state.siteSearchIconCacheLoaded, true, 'and is not retried on every call');
  }
  console.log('site search icon cache tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
