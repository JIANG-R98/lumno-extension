const assert = require('assert');
const { loadBackground } = require('../helpers/background-harness');

// The favicons the worker gives search suggestions: browser pages, excluded
// sites and Lumno's own pages, read from real getSearchSuggestions answers.

async function run() {
  const harness = loadBackground({
    extensionUrls: true,
    sync: {
      _x_extension_favicon_request_blacklist_2026_unique_: ['secret.example.test'],
      _x_extension_favicon_enhanced_fetch_enabled_2026_unique_: true
    },
    configureChrome(chromeApi) {
      chromeApi.history.search = (_query, callback) => setTimeout(() => callback([
        { url: 'chrome://settings/alpha', title: 'alpha settings', visitCount: 5, lastVisitTime: Date.now() },
        { url: 'https://secret.example.test/page', title: 'alpha secret', visitCount: 5, lastVisitTime: Date.now() },
        { url: 'https://open.example.test/page', title: 'alpha open', visitCount: 5, lastVisitTime: Date.now() },
        { url: 'chrome-extension://lumno-test/src/options/options.html', title: 'alpha settings page', visitCount: 5, lastVisitTime: Date.now() }
      ]), 0);
    }
  });
  const response = await harness.sendMessage({ action: 'getSearchSuggestions', query: 'alpha' }, undefined, 2000);
  const favicons = Object.fromEntries(response.suggestions.map((item) => [item.url, item.favicon]));
  const browserCache = (pageUrl) => `chrome-extension://lumno-test/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=128`;

  assert.strictEqual(favicons['chrome://settings/alpha'], browserCache('chrome://settings/alpha'),
    'browser pages should take their icon from the browser, by page');
  assert.strictEqual(favicons['https://secret.example.test/page'], `${browserCache('https://secret.example.test/page')}&fallbackToHost=0`,
    'an excluded site should keep the browser-cache icon, which never contacts the site');
  assert.strictEqual(favicons['https://open.example.test/page'], `${browserCache('https://open.example.test/page')}&fallbackToHost=0`);
  assert.strictEqual(favicons['chrome-extension://lumno-test/src/options/options.html'], 'chrome-extension://lumno-test/assets/images/lumno.png',
    'Lumno\'s own pages should show the Lumno icon');

  console.log('background search favicon tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
