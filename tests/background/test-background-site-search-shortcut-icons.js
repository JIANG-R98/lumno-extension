const assert = require('assert');
const fs = require('fs');
const path = require('path');
const shortcutFavicon = require('../../src/domain/favicon/shortcut-favicon.ts');
const { loadBackground, wait } = require('../helpers/background-harness');
const { shortcutsStorage } = require('../helpers/newtab-fixtures');
const { siteSearchIconCacheStorage } = require('../helpers/site-search-icon-cache');

// A custom site-search provider takes the icon chosen by hand for a shortcut
// to the same site's home page. The worker writes it into the site-search
// icon cache, the only icon data the overlay reads, and takes it back out
// when the shortcut stops choosing one.

const repoRoot = path.resolve(__dirname, '..', '..');
const SITE_SEARCH_KEY = '_x_extension_site_search_custom_2024_unique_';
const SHORTCUT_ICONS_KEY = '_x_extension_newtab_shortcut_icons_2026_unique_';
const provider = (name) => ({
  key: `c${name}`,
  name,
  template: `https://${name}.example.test/search?q={query}`
});
const CUSTOM = ['alpha', 'beta', 'gamma', 'delta'].map(provider);
const pageOf = (name) => `https://${name}.example.test/`;
const BROWSER_ICON = 'data:image/png;base64,QlJPV1NFUg==';
const SERVICE_ICON = 'data:image/png;base64,U0VSVklDRQ==';
const UPLOADED_ICON = 'data:image/png;base64,VVBMT0FE';
const GITHUB_ICON = 'data:image/png;base64,R0lUSFVC';

async function run() {
  const sync = await shortcutsStorage([
    { id: 'alpha', title: 'Alpha', url: 'https://www.alpha.example.test/', iconSource: 'service' },
    { id: 'beta', title: 'Beta', url: pageOf('beta'), iconSource: 'custom' },
    // Not the home page, and a browser-cache choice: neither counts.
    { id: 'gamma', title: 'Gamma', url: 'https://gamma.example.test/docs', iconSource: 'service' },
    { id: 'delta', title: 'Delta', url: pageOf('delta'), iconSource: 'cache' },
    // Built-in providers keep their packaged tile.
    { id: 'github', title: 'GitHub', url: 'https://github.com/', iconSource: 'custom' }
  ]);
  sync[SITE_SEARCH_KEY] = CUSTOM;
  sync._x_extension_favicon_enhanced_fetch_enabled_2026_unique_ = true;
  const local = await siteSearchIconCacheStorage([
    { provider: CUSTOM[0], dataUrl: BROWSER_ICON },
    { provider: CUSTOM[3], dataUrl: BROWSER_ICON }
  ]);
  local[SHORTCUT_ICONS_KEY] = { beta: UPLOADED_ICON, github: GITHUB_ICON };
  const serviceSource = (page) => `https://t2.gstatic.cn/faviconV2?url=${encodeURIComponent(page)}`;
  local[shortcutFavicon.DEFAULT_STORAGE_KEY] = [
    ['https://www.alpha.example.test/', SERVICE_ICON],
    ['https://gamma.example.test/docs', SERVICE_ICON]
  ].reduce((cache, [page, dataUrl]) => shortcutFavicon.setCachedIcon(
    cache, page, dataUrl, serviceSource(page)
  ), {});

  const fetchedHosts = new Set();
  const harness = loadBackground({
    extensionUrls: true,
    sync,
    local,
    fetch(url) {
      const resource = String(url);
      if (resource.startsWith('chrome-extension://lumno-test/') && !resource.includes('/_favicon/')) {
        const text = fs.readFileSync(path.join(repoRoot, new URL(resource).pathname), 'utf8');
        return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(text)) });
      }
      const params = new URL(resource).searchParams;
      try {
        fetchedHosts.add(new URL(params.get('pageUrl') || params.get('url') || '').hostname);
      } catch (error) {
        fetchedHosts.add(resource);
      }
      return Promise.resolve({ ok: false, status: 404 });
    }
  });
  const readCache = () => shortcutFavicon.normalizeCacheMap(
    harness.storage.local.data[shortcutFavicon.SITE_SEARCH_STORAGE_KEY],
    Date.now(),
    shortcutFavicon.SITE_SEARCH_CACHE_OPTIONS
  );
  await wait(1500);

  let cache = readCache();
  assert.strictEqual(cache[pageOf('alpha')].dataUrl, SERVICE_ICON,
    'a www home-page shortcut on Gstatic should replace the browser icon');
  assert.strictEqual(cache[pageOf('alpha')].fromShortcut, true);
  assert.strictEqual(cache[pageOf('beta')].dataUrl, UPLOADED_ICON,
    'an uploaded shortcut icon should become the provider icon');
  assert.ok(!cache[pageOf('gamma')] || !cache[pageOf('gamma')].fromShortcut,
    'a shortcut to an inner page should not choose the provider icon');
  assert.strictEqual(cache[pageOf('delta')].dataUrl, BROWSER_ICON,
    'a browser-cache shortcut should leave the provider icon as it is');
  assert.ok(!cache['https://github.com/'], 'a built-in provider should keep its packaged tile');
  assert.ok(!fetchedHosts.has('alpha.example.test') && !fetchedHosts.has('beta.example.test'),
    'providers given a shortcut icon should not fetch one');
  assert.ok(fetchedHosts.has('gamma.example.test'), 'other custom providers should still warm their icons');
  assert.ok(!harness.storage.local.reads.some((keys) => keys === null),
    'the worker should read only the keys it needs');

  // The user switches the Beta shortcut back to the browser cache.
  delete harness.storage.local.data[SHORTCUT_ICONS_KEY].beta;
  harness.chrome.storage.onChanged.dispatch({
    [SHORTCUT_ICONS_KEY]: { newValue: harness.storage.local.data[SHORTCUT_ICONS_KEY] }
  }, 'local');
  await wait(1500);

  cache = readCache();
  assert.ok(!cache[pageOf('beta')] || !cache[pageOf('beta')].fromShortcut,
    'a shortcut that stops choosing an icon should give the provider its own icon back');
  assert.ok(fetchedHosts.has('beta.example.test'), 'the provider should then warm its own icon');
  assert.strictEqual(cache[pageOf('alpha')].dataUrl, SERVICE_ICON, 'unrelated shortcut icons should stay');
}

run().then(() => {
  console.log('background site-search shortcut icon tests passed');
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
