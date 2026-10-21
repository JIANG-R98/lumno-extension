const assert = require('assert');
const { createOverlayPage } = require('../helpers/overlay-runtime-harness');
const { createNewtabPage } = require('../helpers/newtab-page');
const { createOptionsPage } = require('../helpers/options-page');

// After an update the packaged language files change in place, so every page
// reads them past the HTTP cache instead of showing last version's copy.

function recordLocaleFetches(window, fetches) {
  const fetch = window.fetch;
  window.fetch = (url, init) => {
    if (/_locales\//.test(String(url))) {
      fetches.push({ url: String(url), cache: init && init.cache });
    }
    return fetch(url, init);
  };
}

async function check(name, open) {
  const fetches = [];
  const page = await open((window) => recordLocaleFetches(window, fetches));
  await page.settle(100);
  assert.ok(fetches.length > 0, `${name} should load its language file`);
  fetches.forEach((fetch) => assert.strictEqual(fetch.cache, 'no-store', `${name} should not reuse a cached ${fetch.url}`));
  return page;
}

(async () => {
  const overlay = await check('the overlay', async (setup) => {
    const page = await createOverlayPage({ setup, settings: { _x_extension_language_2024_unique_: 'ja' } });
    await page.open();
    return page;
  });
  assert.ok(!overlay.storageReads.flat().includes('_x_extension_language_messages_2024_unique_'),
    'the overlay should read its messages from the package, not from a synced copy');
  overlay.close();
  (await check('New Tab', (setup) => createNewtabPage({ setup, sync: { _x_extension_language_2024_unique_: 'ja' } }))).close();
  (await check('Settings', (setup) => createOptionsPage({ setup, sync: { _x_extension_language_2024_unique_: 'ja' } }))).close();
  console.log('locale fetch freshness tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
