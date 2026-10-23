const assert = require('assert');
const vm = require('vm');
const settings = require('../../src/shared/settings.js');
const { createNewtabPage } = require('../helpers/newtab-page');
const { runModuleInContext } = require('../helpers/module-script');

const sandbox = {
  console,
  URL
};
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
const guards = runModuleInContext('src/shared/url-guards.js', sandbox, 'LumnoUrlGuards');
assert.ok(guards, 'LumnoUrlGuards should be exported');

assert.strictEqual(guards.isBrowserExtensionProtocol('chrome-extension:'), true);
assert.strictEqual(guards.isRestrictedUrl('https://addons.mozilla.org/firefox/'), false,
  'Chromium may run the overlay on the Firefox add-ons site');
sandbox.chrome = { runtime: { getURL: () => 'moz-extension://uuid/' } };
assert.strictEqual(guards.isRestrictedUrl('https://addons.mozilla.org/firefox/'), true,
  'Firefox blocks content scripts on its own add-ons site');
delete sandbox.chrome;
assert.strictEqual(guards.isBrowserExtensionProtocol('https:'), false);

assert.strictEqual(guards.isBrowserNewtabUrl('chrome://newtab/'), true);
assert.strictEqual(guards.isBrowserNewtabUrl('chrome://new-tab-page/'), true);
assert.strictEqual(guards.isBrowserNewtabUrl('edge://newtab/'), true);
assert.strictEqual(guards.isBrowserNewtabUrl('chrome://extensions/'), false);
assert.strictEqual(guards.isBrowserInternalUrl('chrome://extensions/'), true);
assert.strictEqual(guards.isBrowserInternalUrl('about:blank'), true);
assert.strictEqual(guards.isBrowserInternalUrl('https://example.com/'), false);

assert.strictEqual(guards.isRestrictedUrl('chrome://extensions/'), true);
assert.strictEqual(guards.isRestrictedUrl('chrome-extension://abc/newtab.html'), true);
assert.strictEqual(guards.isRestrictedUrl('https://chromewebstore.google.com/detail/example/abc'), true);
assert.strictEqual(guards.isRestrictedUrl('https://chrome.google.com/webstore/detail/example/abc'), true);
assert.strictEqual(guards.isRestrictedUrl('https://microsoftedge.microsoft.com/addons/detail/example/abc'), true);
assert.strictEqual(guards.isRestrictedUrl('https://example.com/release/'), false);

assert.strictEqual(guards.canOpenOverlayOnUrl('file:///Users/kevinxu/test.html'), true);
assert.strictEqual(guards.canOpenOverlayOnUrl('https://x.com/home'), true);
assert.strictEqual(guards.canOpenOverlayOnUrl('https://chromewebstore.google.com/detail/example/abc'), false);

assert.strictEqual(guards.canFetchPageForFavicon('https://example.com/'), true);
assert.strictEqual(guards.canFetchPageForFavicon('https://chromewebstore.google.com/detail/example/abc'), false);
assert.strictEqual(guards.canFetchPageForFavicon('https://chrome.google.com/webstore/devconsole/abc'), false);
assert.strictEqual(guards.canFetchPageForFavicon('file:///Users/kevinxu/test.html'), false);

const ownBase = 'chrome-extension://lumno-id/';
[
  'https://example.com/path?q=1',
  'http://intranet.local/',
  'file:///Users/someone/report.pdf',
  'mailto:someone@example.com',
  'chrome://settings/',
  'about:blank',
  'view-source:https://example.com/',
  `${ownBase}src/options/options.html#search`
].forEach((url) => {
  assert.strictEqual(guards.canOpenUrlFromWebPageContext(url, ownBase), true, `${url} stays openable from the overlay`);
});
[
  'javascript:alert(1)',
  ' JavaScript:alert(1)',
  'data:text/html,<form>',
  'vbscript:msgbox',
  'view-source:data:text/html,x',
  'chrome-extension://another-id/options.html',
  'moz-extension://another-uuid/page.html',
  'not a url',
  ''
].forEach((url) => {
  assert.strictEqual(guards.canOpenUrlFromWebPageContext(url, ownBase), false, `${url} must not open from a web page context`);
});
assert.strictEqual(guards.canOpenUrlFromWebPageContext(`${ownBase}newtab.html`, ''), false,
  'without a known own base, no extension page is treated as ours');

// New Tab's recent sites leave out browser new tab pages but keep other
// browser pages.
(async () => {
  const now = Date.now();
  const page = await createNewtabPage({
    sync: { [settings.RECENT_COUNT_STORAGE_KEY]: 8, [settings.RECENT_MODE_STORAGE_KEY]: 'latest' },
    history: [
      { url: 'chrome://newtab/', title: 'New Tab', lastVisitTime: now, visitCount: 9 },
      { url: 'chrome://settings/', title: 'Settings', lastVisitTime: now - 500, visitCount: 2 },
      { url: 'https://a.example/', title: 'A', lastVisitTime: now - 1000, visitCount: 3 }
    ]
  });
  await page.settle(500);
  assert.deepStrictEqual(Array.from(page.document.querySelectorAll('.x-nt-recent-card')).map((card) => card.getAttribute('aria-label')),
    ['Open Settings', 'Open A'], 'recent sites should skip the browser new tab page and keep other browser pages');
  page.close();
  console.log('url guards ok');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
