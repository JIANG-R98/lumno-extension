const assert = require('assert');
const store = require('../src/shared/site-search-store.js');

async function run() {
  const baseProviders = [
    { key: 'yt', name: 'YouTube', template: 'https://youtube.com/results?search_query={query}' },
    { key: 'gm', name: 'Gemini', template: 'https://gemini.google.com/app', action: 'openAndSubmit', submitStrategy: 'geminiPrompt' }
  ];

  const merged = store.mergeStoredProviders(
    baseProviders,
    [{ key: 'gm', name: 'My Gemini', template: 'https://gemini.google.com/app' }],
    ['yt'],
    null
  );
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].key, 'gm');
  assert.strictEqual(merged[0].action, 'openAndSubmit');
  assert.strictEqual(merged[0].submitStrategy, 'geminiPrompt');
  assert.strictEqual(merged[0]._xIsCustom, true);

  const renamedBuiltIn = store.mergeStoredProviders(
    baseProviders,
    [{
      key: 'gmx',
      builtinKey: 'gm',
      name: 'Gemini Renamed',
      template: 'https://gemini.google.com/app'
    }],
    ['gm'],
    null
  );
  assert.strictEqual(renamedBuiltIn.length, 2);
  assert.strictEqual(renamedBuiltIn[0].key, 'gmx');
  assert.strictEqual(renamedBuiltIn[0].builtinKey, 'gm');
  assert.strictEqual(renamedBuiltIn[0].action, 'openAndSubmit');
  assert.strictEqual(renamedBuiltIn[0].submitStrategy, 'geminiPrompt');
  assert.strictEqual(
    renamedBuiltIn.some((item) => item.key === 'gm'),
    false,
    'disabling the origin should prevent a renamed override from duplicating its built-in'
  );

  const runtimeItems = [{ key: 'rd', name: 'Reddit', template: 'https://reddit.com/search?q={query}' }];
  const runtimeLoaded = await store.loadSiteSearchProviders({
    chromeApi: {
      runtime: {
        getURL: (path) => path,
        sendMessage: (message, callback) => callback({ items: runtimeItems })
      }
    },
    defaultProviders: baseProviders
  });
  assert.deepStrictEqual(runtimeLoaded, runtimeItems);

  const originalFetch = global.fetch;
  let requestedResourceUrl = '';
  global.fetch = async () => ({
    json: async () => ({
      items: baseProviders
    })
  });
  try {
    const storageValues = {
      [store.STORAGE_KEYS.custom]: [
        { key: 'gm', name: 'Gemini Custom', template: 'https://gemini.google.com/app' }
      ],
      [store.STORAGE_KEYS.disabled]: ['yt']
    };
    const fallbackLoaded = await store.loadSiteSearchProviders({
      chromeApi: {
        runtime: {
          getURL: (path) => path,
          sendMessage: (message, callback) => callback({})
        }
      },
      storageArea: {
        get: (keys, callback) => {
          const key = Array.isArray(keys) ? keys[0] : keys;
          callback({ [key]: storageValues[key] });
        }
      },
      defaultProviders: baseProviders,
      getResourceUrl: (resourcePath) => {
        requestedResourceUrl = `https://example.test/${resourcePath}`;
        return requestedResourceUrl;
      }
    });
    assert.strictEqual(fallbackLoaded.length, 1);
    assert.strictEqual(fallbackLoaded[0].key, 'gm');
    assert.strictEqual(fallbackLoaded[0].action, 'openAndSubmit');
    assert.strictEqual(fallbackLoaded[0].submitStrategy, 'geminiPrompt');
    assert.strictEqual(fallbackLoaded[0]._xIsCustom, true);
    assert.strictEqual(
      requestedResourceUrl,
      'https://example.test/assets/data/site-search.json',
      'site search store should honor the caller resource URL resolver'
    );
  } finally {
    global.fetch = originalFetch;
  }

  console.log('site search store tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
