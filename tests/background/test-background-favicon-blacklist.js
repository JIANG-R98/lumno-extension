const assert = require('assert');
const { loadBackground } = require('../helpers/background-harness');

// The worker's favicon and theme-color fetching under the favicon exclusion
// list and the enhanced-fetch setting, run in the real background with a
// recording fetch.

const BLACKLIST_KEY = '_x_extension_favicon_request_blacklist_2026_unique_';
const ENHANCED_KEY = '_x_extension_favicon_enhanced_fetch_enabled_2026_unique_';
const EXTENSION_FAVICON = 'chrome-extension://lumno-test/_favicon/';
const PNG_DATA = 'data:image/png;base64,AQIDBA==';

function extensionFavicon(pageUrl, size) {
  return `${EXTENSION_FAVICON}?pageUrl=${encodeURIComponent(pageUrl)}${size ? '&size=128' : ''}&fallbackToHost=0`;
}

function gstaticFavicon(pageUrl) {
  return `https://t2.gstatic.cn/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE%2CSIZE%2CURL&url=${encodeURIComponent(pageUrl)}&size=128`;
}

async function bootFavicons(options) {
  const config = options || {};
  const fetchCalls = [];
  const harness = loadBackground({
    extensionUrls: true,
    sync: {
      [BLACKLIST_KEY]: config.blacklist || [],
      [ENHANCED_KEY]: config.enhanced !== false
    },
    fetch(url, fetchOptions) {
      fetchCalls.push({ url: String(url), redirect: fetchOptions && fetchOptions.redirect });
      // The browser answers an unknown page with its default globe.
      const globe = String(url).includes('lumno.invalid');
      const bytes = globe && !config.globeMatchesIcons ? [9, 9, 9, 9] : [1, 2, 3, 4];
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('<html><meta name="theme-color" content="#123456"></html>'),
        blob: () => Promise.resolve({
          size: 4,
          type: 'image/png',
          arrayBuffer: () => Promise.resolve(Uint8Array.from(bytes).buffer)
        })
      });
    },
    exposeModules: {
      'src/background/favicon-service.ts': [
        'resolveSiteThemeColor',
        'resolveFaviconCandidates',
        'fetchFaviconData',
        'loadFaviconRequestBlacklistItems',
        'loadFaviconEnhancedFetchEnabled'
      ]
    }
  });
  await harness.exposed('loadFaviconRequestBlacklistItems')();
  await harness.exposed('loadFaviconEnhancedFetchEnabled')();
  fetchCalls.length = 0;
  return {
    fetchCalls,
    candidates: harness.exposed('resolveFaviconCandidates'),
    themeColor: harness.exposed('resolveSiteThemeColor'),
    data: harness.exposed('fetchFaviconData'),
    pageFetches: () => fetchCalls.filter((call) => !call.url.startsWith(EXTENSION_FAVICON) && !call.url.includes('gstatic'))
  };
}

const EXCLUSIONS = [
  { pattern: 'blocked.example.com', matchModes: ['suffix'] },
  { pattern: 'vpn.example.com/private', matchModes: ['prefix'] },
  { pattern: 'exact.example.com/only-this', matchModes: ['exact'] }
];

async function testExclusionsMatchByTheirMode() {
  const worker = await bootFavicons({ blacklist: EXCLUSIONS });
  const excluded = async (pageUrl) => {
    const candidates = JSON.parse(JSON.stringify(await worker.candidates(pageUrl, '', '')));
    return candidates.length === 1 && candidates[0] === extensionFavicon(pageUrl, true);
  };
  assert.strictEqual(await excluded('https://foo.blocked.example.com/path'), true, 'a suffix exclusion should match subdomains');
  assert.strictEqual(await excluded('https://vpn.example.com/private/doc'), true, 'a prefix exclusion should match child paths');
  assert.strictEqual(await excluded('https://exact.example.com/only-this'), true, 'an exact exclusion should match the page URL');
  assert.strictEqual(await excluded('https://exact.example.com/only-this/child'), false, 'an exact exclusion should match nothing else');
  assert.strictEqual(await excluded('https://public.example.com/path'), false, 'other pages should keep their favicon sources');
  assert.deepStrictEqual(worker.fetchCalls, [], 'listing candidates should not fetch anything');
}

async function testExcludedPagesOnlyUseTheBrowserCache() {
  const worker = await bootFavicons({ blacklist: EXCLUSIONS });
  assert.strictEqual(await worker.themeColor('https://foo.blocked.example.com/page', '', 'dark'), null);
  assert.strictEqual(await worker.data('https://foo.blocked.example.com/favicon.ico'), null,
    'an excluded site\'s own favicon should not be fetched');
  assert.strictEqual(
    await worker.data(`https://t2.gstatic.cn/faviconV2?url=${encodeURIComponent('https://foo.blocked.example.com/page')}`),
    null,
    'an excluded page should not be sent to the third-party favicon service'
  );
  assert.deepStrictEqual(worker.fetchCalls, []);

  const cached = await worker.data(`${EXTENSION_FAVICON}?pageUrl=${encodeURIComponent('https://foo.blocked.example.com/page')}`);
  assert.strictEqual(cached, PNG_DATA, 'the browser\'s own favicon cache should stay available for excluded pages');
  assert.deepStrictEqual(worker.fetchCalls.map((call) => call.url), [
    extensionFavicon('https://foo.blocked.example.com/page'),
    extensionFavicon('https://lumno.invalid/__favicon_placeholder_probe__')
  ], 'the cached icon should be compared with the default icon of an unknown page');
}

async function testTheDefaultGlobeCountsAsNoIcon() {
  const worker = await bootFavicons({ globeMatchesIcons: true });
  assert.strictEqual(
    await worker.data(`${EXTENSION_FAVICON}?pageUrl=${encodeURIComponent('https://never-visited.example/')}`),
    null,
    'the browser\'s default globe should be reported as no icon, so surfaces show their fallback'
  );
}

async function testPublicAndLocalPagesNeverFetchTheSiteDirectly() {
  for (const enhanced of [true, false]) {
    const worker = await bootFavicons({ blacklist: EXCLUSIONS, enhanced });
    const label = enhanced ? 'with enhanced fetching' : 'without enhanced fetching';
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(await worker.candidates('https://public.example.com/page', '', 'https://public.example.com/favicon.ico'))),
      [extensionFavicon('https://public.example.com/page', true), gstaticFavicon('https://public.example.com/')],
      `${label}, public pages should use the browser cache, then the approved favicon service`
    );
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(await worker.candidates('http://192.168.1.8/dashboard', '', 'http://192.168.1.8/favicon.ico'))),
      [extensionFavicon('http://192.168.1.8/dashboard', true), gstaticFavicon('http://192.168.1.8/')],
      `${label}, local network pages should not get a direct favicon candidate`
    );
    assert.strictEqual(await worker.themeColor('https://public.example.com/page', '', 'light'), null,
      'theme colors should come from the browser cache only');
    assert.strictEqual(await worker.themeColor('http://192.168.1.8/dashboard', '', 'dark'), null);
    assert.strictEqual(await worker.data('https://public.example.com/favicon.ico'), null,
      `${label}, a site's own favicon URL should not be fetched`);
    assert.deepStrictEqual(worker.pageFetches(), [], `${label}, page HTML and site favicons should never be fetched`);

    const proxied = await worker.data('https://t2.gstatic.cn/faviconV2?url=https%3A%2F%2Fpublic.example.com%2Fpage', 'https://public.example.com/page');
    assert.strictEqual(proxied, PNG_DATA, `${label}, the approved favicon service should stay available`);
    assert.strictEqual(worker.fetchCalls.at(-1).redirect, 'error', 'favicon service requests must not follow redirects');
  }
}

async function testExclusionsOnOnePathLeaveTheRestOfTheSite() {
  const privatePage = 'https://foo.example.com/private';
  const publicPage = 'https://foo.example.com/public';
  const rootIcon = 'https://foo.example.com/favicon.ico';
  const worker = await bootFavicons({ blacklist: [{ pattern: 'foo.example.com/private', matchModes: ['prefix'] }] });
  assert.strictEqual(await worker.themeColor(privatePage, '', 'dark'), null);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(await worker.candidates(privatePage, '', rootIcon))), [extensionFavicon(privatePage, true)]);
  assert.strictEqual(await worker.data(rootIcon, privatePage), null);
  assert.deepStrictEqual(worker.fetchCalls, [], 'an excluded path should not fetch anything');

  const publicCandidates = JSON.parse(JSON.stringify(await worker.candidates(publicPage, '', rootIcon)));
  assert.ok(!publicCandidates.includes(rootIcon), 'other pages on the host should not regain a direct favicon');
  assert.ok(publicCandidates.some((url) => url.includes('gstatic.cn/faviconV2')), 'other pages on the host should keep the favicon service');
  assert.strictEqual(await worker.data(rootIcon, publicPage), null);
  assert.deepStrictEqual(worker.pageFetches(), []);
}

async function testCachedBytesStayWithTheirPage() {
  const worker = await bootFavicons();
  const dashboardPage = 'https://chrome.google.com/webstore/devconsole?hl=zh-CN';
  const rootSource = `${EXTENSION_FAVICON}?pageUrl=${encodeURIComponent('https://chrome.google.com/')}`;
  assert.strictEqual(await worker.data(rootSource), PNG_DATA, 'the root page icon can be cached for the root page');
  const callsBefore = worker.fetchCalls.length;
  assert.strictEqual(await worker.data(rootSource, dashboardPage), null,
    'cached bytes for one page should not be returned for another page');
  assert.strictEqual(worker.fetchCalls.length, callsBefore);

  assert.strictEqual(await worker.data(`${EXTENSION_FAVICON}?pageUrl=${encodeURIComponent(dashboardPage)}&fallbackToHost=1`, dashboardPage), PNG_DATA);
  assert.strictEqual(new URL(worker.fetchCalls.filter((call) => !call.url.includes('lumno.invalid')).at(-1).url).searchParams.get('fallbackToHost'), '0',
    'an old host-fallback request should be fetched without the host fallback');
  assert.strictEqual(await worker.data(`chrome://favicon2/?pageUrl=${encodeURIComponent(dashboardPage)}&fallbackToHost=0`, dashboardPage), PNG_DATA);
  const last = new URL(worker.fetchCalls.filter((call) => !call.url.includes('lumno.invalid')).at(-1).url);
  assert.strictEqual(last.protocol, 'chrome-extension:', 'a chrome://favicon2 source should be read through the extension endpoint');
  assert.strictEqual(last.searchParams.get('pageUrl'), dashboardPage);
}

(async () => {
  await testExclusionsMatchByTheirMode();
  await testExcludedPagesOnlyUseTheBrowserCache();
  await testTheDefaultGlobeCountsAsNoIcon();
  await testPublicAndLocalPagesNeverFetchTheSiteDirectly();
  await testExclusionsOnOnePathLeaveTheRestOfTheSite();
  await testCachedBytesStayWithTheirPage();
  console.log('background favicon blacklist tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
