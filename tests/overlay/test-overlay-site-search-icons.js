const assert = require('assert');
const shortcutFavicon = require('../../src/shared/favicon/shortcut-favicon.ts');
const { createOverlayPage, bundledSiteSearchProviders } = require('../helpers/overlay-runtime-harness');
const { siteSearchIconCacheStorage } = require('../helpers/site-search-icon-cache');

// Provider icons in the real overlay's search scope menu: packaged tiles for
// bundled providers, the worker's cached icons for the user's own, and a
// live update when the worker caches a new one.

const CUSTOM = { key: 'cdocs', name: 'Docs', template: 'https://docs.example.test/search?q={query}' };
const CACHED_ICON = 'data:image/png;base64,Y2FjaGVk';
const FRESH_ICON = 'data:image/png;base64,ZnJlc2g=';

function menuIcon(root, providerKey) {
  const item = root.querySelector(`[data-mode-id="provider:${providerKey}"]`);
  const img = item && item.querySelector('img');
  return img ? img.getAttribute('src') : null;
}

async function openScopeMenu(page) {
  const root = await page.open({ siteSearchProviders: bundledSiteSearchProviders().concat(CUSTOM) });
  root.querySelector('[data-search-scope-action="true"]').dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await page.waitFor(() => root.querySelector('[data-mode-id="provider:cdocs"]'), 'the scope menu should list the providers');
  return root;
}

async function run() {
  const local = await siteSearchIconCacheStorage([{ provider: CUSTOM, dataUrl: CACHED_ICON }]);
  // Storage is slow: the menu must still render with the cached icons.
  const page = await createOverlayPage({ localSettings: local, stylesheetsLoad: true, storageDelayMs: 30 });
  const root = await openScopeMenu(page);
  assert.strictEqual(menuIcon(root, 'cdocs'), CACHED_ICON, 'a custom provider should show the icon the worker cached');
  assert.strictEqual(menuIcon(root, 'bi'), 'chrome-extension://kkcjcneagmlhpeaafngjdlpcfjakejgb/assets/images/site-search/tile-bi.png',
    'a bundled provider should show its packaged tile');
  assert.ok(!page.messages.some((message) => message.action === 'getFaviconData' && /bing\.com/.test(message.pageUrl || message.url || '')),
    'a packaged tile should not be hydrated through the favicon service');
  assert.ok(page.storageReads.some((keys) => keys.area === 'local' && keys.includes(shortcutFavicon.SITE_SEARCH_STORAGE_KEY)),
    'the overlay should read the canonical icon cache');

  const updated = await siteSearchIconCacheStorage([{ provider: CUSTOM, dataUrl: FRESH_ICON }]);
  Object.entries(updated).forEach(([key, value]) => page.changeSetting(key, value, 'local'));
  await page.waitFor(() => menuIcon(root, 'cdocs') === FRESH_ICON, 'an open menu should adopt an icon the worker just cached');
  page.close();
}

run().then(() => {
  console.log('overlay site-search icon tests passed');
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
