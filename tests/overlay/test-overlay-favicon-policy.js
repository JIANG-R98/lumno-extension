const assert = require('assert');
const { createOverlayPage } = require('../helpers/overlay-runtime-harness');

// The favicon policy in the real overlay: excluded pages never reach the
// favicon service, the first rows wait for the policy, a policy change makes
// failed rows try again, and built-in rows use trusted icons.

const ENHANCED_KEY = '_x_extension_favicon_enhanced_fetch_enabled_2026_unique_';
const BLACKLIST_KEY = '_x_extension_favicon_request_blacklist_2026_unique_';
const OPEN_TABS_VISIBLE_KEY = '_x_extension_overlay_open_tabs_default_visible_2026_unique_';
const ICON_DATA = 'data:image/png;base64,iVBORw0KGgo=';
const TABS = [
  { id: 1, title: 'Public page', url: 'https://site.test/public', favIconUrl: 'https://site.test/favicon.ico' },
  { id: 2, title: 'Private page', url: 'https://site.test/private/inbox', favIconUrl: 'https://site.test/favicon.ico' },
  { id: 3, title: 'Extensions', url: 'chrome://extensions/', favIconUrl: '' }
];

function openTabsPage(settings, options) {
  return createOverlayPage(Object.assign({
    settings: Object.assign({ [OPEN_TABS_VISIBLE_KEY]: true }, settings),
    respond(message) {
      if (message.action === 'getTabsForOverlay') return { tabs: TABS };
      if (message.action === 'getFaviconData') return { data: ICON_DATA };
      return undefined;
    }
  }, options || {}));
}

const faviconRequestsFor = (page, pageUrl) => page.messages
  .filter((message) => message.action === 'getFaviconData' && message.pageUrl === pageUrl);

async function testExcludedPagesNeverReachTheFaviconService() {
  // Storage answers after the tab list does: the rows must still wait for the
  // exclusion list before asking for any icon.
  const page = await openTabsPage({ [ENHANCED_KEY]: true, [BLACKLIST_KEY]: ['site.test/private'] }, { storageDelayMs: 40 });
  const root = await page.open();
  await page.waitFor(() => root.textContent.includes('Private page'), 'the open tabs should render');
  await page.settle(200);
  assert.deepStrictEqual(faviconRequestsFor(page, 'https://site.test/private/inbox'), [],
    'an excluded page should not be sent to the favicon service, even before the settings have loaded');
  const publicRequests = faviconRequestsFor(page, 'https://site.test/public');
  assert.ok(publicRequests.length > 0, 'other pages should still get their icon');
  publicRequests.forEach((request) => {
    assert.doesNotMatch(request.url, /^https:\/\/site\.test\//, 'the site itself should never be asked for its icon');
  });

  const privateIcon = () => {
    const row = page.suggestions().find((item) => item.textContent.includes('Private page'));
    const img = row && row.querySelector('img');
    return img ? img.getAttribute('src') : null;
  };
  assert.notStrictEqual(privateIcon(), ICON_DATA, 'the excluded row should show its fallback icon');
  page.changeSetting(BLACKLIST_KEY, []);
  await page.waitFor(() => privateIcon() === ICON_DATA, 'lifting the exclusion should make the failed row load its icon');
  page.close();
}

async function testBuiltInRowsUseTrustedIcons() {
  const page = await openTabsPage({ [ENHANCED_KEY]: false });
  const root = await page.open();
  await page.waitFor(() => root.textContent.includes('Extensions'), 'the open tabs should render');
  const extensionsRow = page.suggestions().find((row) => row.textContent.includes('Extensions'));
  const icon = extensionsRow && extensionsRow.querySelector('img');
  assert.ok(icon, 'a browser page should show the browser\'s own icon');
  assert.match(icon.getAttribute('src'), /^chrome:\/\/favicon2\/\?pageUrl=chrome%3A%2F%2Fextensions%2F/);

  await page.type('/mode');
  const modeRow = page.suggestions().map((row) => row._xSuggestion).find((item) => item && item.type === 'modeSwitch');
  assert.ok(modeRow, '/mode should offer the theme switch');
  assert.strictEqual(modeRow.favicon, 'chrome-extension://kkcjcneagmlhpeaafngjdlpcfjakejgb/assets/images/lumno.png',
    'the theme switch row should use the packaged Lumno icon');
  page.close();
}

(async () => {
  await testExcludedPagesNeverReachTheFaviconService();
  await testBuiltInRowsUseTrustedIcons();
  console.log('overlay favicon policy tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
