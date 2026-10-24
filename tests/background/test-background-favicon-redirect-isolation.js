const assert = require('assert');
const { loadBackground, wait } = require('../helpers/background-harness');

// A shortcut icon snapshot fetches only approved favicon sources, and a
// redirect from one of them fails instead of following it to whatever host
// it points at (a private address, for instance).

async function run() {
  const calls = [];
  let followedRedirects = 0;
  const harness = loadBackground({
    extensionUrls: true,
    sync: { _x_extension_favicon_enhanced_fetch_enabled_2026_unique_: true },
    fetch(url, options) {
      calls.push({ url: String(url), redirect: options && options.redirect });
      if (!options || options.redirect !== 'error') {
        followedRedirects += 1;
        return Promise.resolve({ ok: true, url: 'http://127.0.0.1/internal' });
      }
      return Promise.reject(new TypeError('redirect blocked'));
    },
    exposeModules: { 'src/background/favicon-service.ts': ['fetchShortcutFaviconData'] }
  });
  const fetchShortcutFaviconData = harness.exposed('fetchShortcutFaviconData');
  await wait(50);
  calls.length = 0;
  followedRedirects = 0;

  const result = await fetchShortcutFaviconData('https://public.example/', '', 'http://127.0.0.1/internal', true, 'service');
  assert.strictEqual(result, null, 'a source that redirects should give no icon');
  assert.ok(calls.length > 0, 'the approved favicon service should be tried');
  calls.forEach((call) => {
    assert.strictEqual(call.redirect, 'error', `${call.url} should be fetched without following redirects`);
    assert.ok(!call.url.startsWith('http://127.0.0.1'), 'an icon URL the page supplied should never be fetched');
    assert.ok(/^(chrome-extension:\/\/lumno-test\/_favicon\/|https:\/\/t2\.gstatic\.cn\/faviconV2|https:\/\/favicon\.is\/)/.test(call.url),
      `${call.url} should be an approved favicon source`);
  });
  assert.strictEqual(followedRedirects, 0, 'no redirect should be followed to a private target');

  console.log('background favicon redirect isolation tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
