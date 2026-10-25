const assert = require('assert');
const faviconUtils = require('../../src/domain/favicon/favicon-utils.ts');
const shortcutFavicon = require('../../src/domain/favicon/shortcut-favicon.ts');
const searchUtils = require('../../src/domain/search/search-utils.ts');
const faviconCache = require('../../src/platform/favicon-cache.ts');
const faviconCacheRecords = require('../../src/domain/favicon/favicon-cache.ts');
const { shortcutsStorage } = require('../helpers/newtab-fixtures');
const { EXTENSION_ORIGIN, createAcquisition, openFrontend, png } = require('../helpers/favicon-acquisition');

// How a shortcut gets its icon: the background worker acquires it from the
// browser cache or an icon service under the favicon policy, and New Tab
// keeps a stable snapshot that only a saved manual refresh replaces.

const isBrowserUrl = (url) => url.startsWith(`${EXTENSION_ORIGIN}/_favicon/`);
const dataUrl = (image) => `data:image/png;base64,${image.toString('base64')}`;

async function testCacheMigration(page) {
  const pageKey = faviconUtils.getFaviconPersistCacheKey(page);
  const urlKey = faviconCacheRecords.DEFAULTS.faviconPersistStorageKey;
  const dataKey = faviconCacheRecords.DEFAULTS.faviconDataPersistStorageKey;
  const sharedBytes = dataUrl(png(32, 99));
  for (const version of [1, 2, 3]) {
    const values = {
      [urlKey]: { version, entries: { [pageKey]: { url: 'https://t2.gstatic.cn/faviconV2', updatedAt: Date.now() } } },
      [dataKey]: { version, entries: { [pageKey]: { dataUrl: sharedBytes, updatedAt: Date.now() },
        'settings': { dataUrl: sharedBytes, updatedAt: Date.now() } } }
    };
    const writes = [];
    const cache = faviconCache.createFaviconCache({
      storageArea: { get(keys, callback) { callback(values); }, set(payload) { Object.assign(values, payload); } },
      windowObj: { setTimeout(callback) { writes.push(callback); return writes.length; }, clearTimeout() {} }
    });
    await cache.ensureCachesReady();
    assert.strictEqual(Boolean(cache.getPersistedDataEntry(pageKey)), version === 3,
      'shared page image bytes from the old host-fallback policy must be reacquired');
    assert.strictEqual(Boolean(cache.getPersistedEntry(pageKey)), version === 3,
      'old shared page URL caches must not bypass the corrected resolver');
    assert.strictEqual(cache.getPersistedDataEntry('settings').dataUrl, sharedBytes,
      'non-web-page caches survive the policy migration');
    cache.setPersistedData(pageKey, sharedBytes);
    cache.setPersistedUrl(pageKey, 'https://t2.gstatic.cn/faviconV2');
    writes.forEach((write) => write());
    assert.strictEqual(values[dataKey].version, 3);
    assert.strictEqual(values[urlKey].version, 3);
  }
}

// Firefox has no _favicon endpoint: its cache source reads the data: icons
// Firefox reports for open tabs and top sites, and never contacts the site.
async function testFirefoxCacheSource() {
  const firefoxPage = 'https://example.com/';
  const tabIcon = dataUrl(png(32, 5));
  const fromTab = createAcquisition({ firefox: {
    tabs: [{ url: 'https://www.example.com/docs', favIconUrl: tabIcon }],
    topSites: [{ url: 'https://example.com/blog', favicon: 'data:image/png;base64,AAAA' }],
    images: { [tabIcon]: png(32, 5) }
  } });
  const tabResult = await fromTab.fetchShortcutFaviconData(firefoxPage, false, 'cache');
  assert.deepStrictEqual(fromTab.state.calls.map((call) => call.url), [tabIcon],
    'among same-site icons, an open tab\'s current icon wins over top sites');
  assert.strictEqual(shortcutFavicon.getCachedIconSource(tabResult), 'cache');
  assert.ok(shortcutFavicon.isCachedIconForPage(tabResult, firefoxPage));

  const topSiteIcon = dataUrl(png(32, 6));
  const fromTopSites = createAcquisition({ firefox: {
    topSites: [{ url: 'https://example.com/', favicon: topSiteIcon }],
    images: { [topSiteIcon]: png(32, 6) }
  } });
  assert.ok(await fromTopSites.fetchShortcutFaviconData(firefoxPage, false, 'cache'));
  assert.deepStrictEqual(fromTopSites.state.calls.map((call) => call.url), [topSiteIcon]);

  const remoteOnly = createAcquisition({ firefox: {
    tabs: [{ url: 'https://example.com/', favIconUrl: 'https://example.com/favicon.ico' }],
    images: { 'https://example.com/favicon.ico': png(32, 7) }
  } });
  assert.ok(!await remoteOnly.fetchShortcutFaviconData(firefoxPage, false, 'cache'));
  assert.deepStrictEqual(remoteOnly.state.calls, [],
    'without a cached icon, Firefox\'s cache source makes no request to the site');
}

async function testSources(page, normalizedPage) {
  const enabled = createAcquisition();
  const proxyResult = await enabled.fetchShortcutFaviconData(page, false, 'service');
  assert.strictEqual(new URL(proxyResult.sourceUrl).searchParams.get('url'), new URL(normalizedPage).origin + '/',
    'the third-party service should learn only the site origin');
  assert.strictEqual(enabled.state.calls.length, 1, 'an explicit service source should contact only the service');
  enabled.state.calls.forEach((call) => {
    assert.deepStrictEqual([call.options.credentials, call.options.referrerPolicy, call.options.redirect], ['omit', 'no-referrer', 'error'],
      'icon requests should carry no credentials, referrer or redirects');
  });
  enabled.state.proxyImage = png(128, 9);
  assert.deepStrictEqual(await enabled.fetchShortcutFaviconData(page, false, 'service'), proxyResult,
    'ordinary reads should retain the previously acquired icon');
  const refreshedProxy = await enabled.fetchShortcutFaviconData(page, true, 'service');
  assert.notStrictEqual(refreshedProxy.data, proxyResult.data, 'manual refresh must bypass the background memory cache');
  assert.strictEqual(enabled.state.calls[1].options.cache, 'reload', 'manual refresh must revalidate the HTTP icon cache');

  const small = createAcquisition({ proxyImage: png(32) });
  assert.strictEqual((await small.fetchShortcutFaviconData(page, false, 'service')).width, 32,
    'valid small proxy artwork must not disappear solely because it is below 128px');

  const explicit = createAcquisition();
  const cacheOnly = await explicit.fetchShortcutFaviconData(page, false, 'cache');
  assert.ok(isBrowserUrl(cacheOnly.sourceUrl), 'explicit browser source must use the local endpoint');
  assert.ok(explicit.state.calls.every((call) => call.url.startsWith('chrome-extension:')));
  assert.strictEqual(new URL(cacheOnly.sourceUrl).searchParams.get('pageUrl'), normalizedPage);
  explicit.state.calls.length = 0;
  const serviceOnly = await explicit.fetchShortcutFaviconData(page, false, 'service');
  assert.ok(faviconUtils.isFaviconProxyUrl(serviceOnly.sourceUrl), 'source-specific caches must not return browser artwork for service mode');
  assert.ok(explicit.state.calls.every((call) => faviconUtils.isFaviconProxyUrl(call.url)));
  assert.ok(shortcutFavicon.isCachedIconForPage(serviceOnly, normalizedPage),
    'a service icon is asked for the site, so it must stay valid for a page on it');
  assert.strictEqual(shortcutFavicon.isCachedIconForPage(serviceOnly, 'https://other.chrome.com/docs/'), false);
  assert.strictEqual(shortcutFavicon.isCachedIconForPage(cacheOnly, 'https://developer.chrome.com/'), false,
    'a browser snapshot of one page must not stand for another page on the site');
  explicit.state.calls.length = 0;
  explicit.state.proxyImage = png(128, 25);
  const faviconIsOnly = await explicit.fetchShortcutFaviconData(page, false, 'favicon-is');
  assert.ok(faviconUtils.isFaviconIsUrl(faviconIsOnly.sourceUrl));
  assert.notStrictEqual(faviconIsOnly.data, serviceOnly.data, 'Favicon.is must not reuse the Gstatic memory cache');
  assert.ok(explicit.state.calls.every((call) => faviconUtils.isFaviconIsUrl(call.url)),
    'an explicit Favicon.is source must contact only that provider, including its placeholder probe');
  assert.strictEqual(new URL(faviconIsOnly.sourceUrl).pathname, '/developer.chrome.com');
  assert.strictEqual(new URL(faviconIsOnly.sourceUrl).search, '?larger=true', 'send only the hostname and size preference');
  assert.strictEqual(shortcutFavicon.getCachedIconSource(faviconIsOnly), 'favicon-is');
  assert.ok(shortcutFavicon.isCachedIconForPage(faviconIsOnly, normalizedPage));
  assert.strictEqual(shortcutFavicon.isCachedIconForPage(faviconIsOnly, 'https://other.chrome.com/docs/'), false);

  for (const proxyMode of ['error', 'timeout']) {
    const unavailableFaviconIs = createAcquisition({ proxyMode });
    assert.strictEqual(await unavailableFaviconIs.fetchShortcutFaviconData(page, true, 'favicon-is'), null);
    assert.ok(unavailableFaviconIs.state.calls.every((call) => faviconUtils.isFaviconIsUrl(call.url)),
      'Favicon.is failures must not silently fall back to another source');
  }
  const largeFaviconIsPlaceholder = createAcquisition({ proxyImage: png(128, 0), placeholderImage: png(128, 0) });
  assert.strictEqual(await largeFaviconIsPlaceholder.fetchShortcutFaviconData(page, false, 'favicon-is'), null,
    'Favicon.is placeholders must be rejected even when returned at the requested large size');
  for (const options of [{ excluded: true }, { enhanced: false, excluded: true }]) {
    const blockedFaviconIs = createAcquisition(options);
    assert.strictEqual(await blockedFaviconIs.fetchShortcutFaviconData(page, false, 'favicon-is'), null);
    assert.strictEqual(blockedFaviconIs.state.calls.length, 0, 'Favicon.is must respect the existing fetch policy');
  }
  for (const iconSource of ['service', 'favicon-is']) {
    const disabledService = createAcquisition({ enhanced: false });
    const result = await disabledService.fetchShortcutFaviconData(page, false, iconSource);
    assert.ok(result && result.data.startsWith('data:image/png;base64,'),
      `${iconSource} must remain available with enhanced fetching disabled`);
    assert.ok(disabledService.state.calls.every((call) => faviconUtils.isFaviconProxyUrl(call.url)),
      'only approved service URLs may be requested');
  }
  const disabledFallback = createAcquisition({ enhanced: false, browserImage: null });
  assert.ok((await disabledFallback.fetchShortcutFaviconData(page)).sourceUrl.startsWith('https://t2.gstatic.cn/'),
    'automatic shortcuts should fall back to the service when Chrome has no image, even with enhanced fetching disabled');
  explicit.state.calls.length = 0;
  explicit.state.proxyMode = 'error';
  assert.strictEqual(await explicit.fetchShortcutFaviconData(page, true, 'service'), null,
    'explicit service mode must report failure without silently using browser cache');
  assert.ok(explicit.state.calls.every((call) => faviconUtils.isFaviconProxyUrl(call.url)));

  for (const proxyMode of ['error', 'timeout']) {
    const unavailable = createAcquisition({ proxyMode });
    const result = await unavailable.fetchShortcutFaviconData(page);
    assert.ok(isBrowserUrl(result.sourceUrl), `${proxyMode} should not affect an available exact-page browser snapshot`);
    assert.strictEqual(result.width, 32);
    assert.ok(unavailable.state.calls.every((call) => call.url.startsWith('chrome-extension:')),
      'an exact-page browser icon should prevent unnecessary third-party requests');
  }

  const excluded = createAcquisition({ excluded: true });
  assert.ok(isBrowserUrl((await excluded.fetchShortcutFaviconData(page)).sourceUrl));
  assert.ok(excluded.state.calls.every((call) => call.url.startsWith('chrome-extension:')),
    'request exclusions should retain safe Chrome snapshot acquisition');

  const browserDefault = createAcquisition({ enhanced: false, browserImage: png(16, 0), proxyImage: null });
  assert.strictEqual(await browserDefault.fetchShortcutFaviconData(page), null, 'Chrome placeholder artwork must not be frozen as a real icon');
  browserDefault.state.browserImage = png(16, 8);
  assert.ok(await browserDefault.fetchShortcutFaviconData(page), 'a previous miss must retry when browser artwork becomes available');

  const proxyDefault = createAcquisition({ proxyImage: png(16, 0) });
  assert.strictEqual(await proxyDefault.fetchShortcutFaviconData(page, false, 'service'), null,
    'generic service placeholder artwork must not be saved');
  const malformed = createAcquisition({ proxyImage: Buffer.from('<html>not an icon</html>') });
  assert.strictEqual(await malformed.fetchShortcutFaviconData(page, false, 'service'), null,
    'invalid service responses must not be saved');
  const noBrowserIcon = createAcquisition({ browserImage: png(16, 0) });
  assert.ok((await noBrowserIcon.fetchShortcutFaviconData(page)).sourceUrl.startsWith('https:'),
    'a missing exact-page browser icon should try the origin-only service request in enhanced mode');
}

// Same-host pages keep their own browser artwork; the service, told only
// the origin, answers once for all of them.
async function testPathSpecificPages() {
  const pages = ['https://chrome.google.com/', 'https://chrome.google.com/webstore/devconsole?hl=zh-cn',
    'https://chrome.google.com/webstore/devconsole?hl=en', 'https://chrome.google.com/webstore/',
    'https://chrome.google.com/webstore', 'https://chrome.google.com/apps%2Fpreview'];
  const pathSpecific = () => createAcquisition({ pageImages: Object.fromEntries(pages.map((url, index) =>
    [url, { browser: png(32, index + 10), proxy: png(128, index + 20) }])) });
  const acquisition = pathSpecific();
  const cacheResults = await Promise.all(pages.map((url) => acquisition.fetchShortcutFaviconData(url, false, 'cache')));
  assert.strictEqual(new Set(cacheResults.map((result) => result.data)).size, pages.length,
    'same-host paths, query values, trailing slashes and encoded slashes retain separate browser artwork');
  for (let index = 0; index < pages.length; index += 1) {
    assert.strictEqual(new URL(cacheResults[index].sourceUrl).searchParams.get('pageUrl'), pages[index]);
  }
  const serviceResults = await Promise.all(pages.map((url) => acquisition.fetchShortcutFaviconData(url, false, 'service')));
  assert.strictEqual(new Set(serviceResults.map((result) => result.data)).size, 1,
    'service artwork is shared by the pages of one origin');
  serviceResults.forEach((result) => {
    assert.strictEqual(new URL(result.sourceUrl).searchParams.get('url'), 'https://chrome.google.com/');
  });

  // Snapshots New Tab cannot trust for this exact page are acquired again.
  const webstore = pages[1];
  const oldBytes = dataUrl(png(128, 88));
  const oldRootSource = `https://t2.gstatic.cn/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE%2CSIZE%2CURL&url=${
    encodeURIComponent(pages[3])}&size=128`;
  const oldRoot = await openFrontend(pathSpecific(), webstore, {
    initialSnapshots: shortcutFavicon.setCachedIcon({}, webstore, oldBytes, oldRootSource), iconSource: 'service'
  });
  assert.ok(oldRoot.tileIcon() && oldRoot.tileIcon() !== oldBytes,
    'an old wrong root-page snapshot is automatically replaced through an exact-page request');
  assert.strictEqual(oldRoot.messages().length, 1);
  await oldRoot.openEditor();
  assert.strictEqual(oldRoot.editorSource(), 'service', 'reacquiring an invalid snapshot must preserve the user-selected source');
  oldRoot.close();

  const legacy = await openFrontend(pathSpecific(), webstore, {
    initialSnapshots: shortcutFavicon.setCachedIcon({}, webstore, oldBytes, ''), iconSource: 'cache'
  });
  assert.ok(legacy.tileIcon() && legacy.tileIcon() !== oldBytes, 'a legacy browser snapshot without its source is reacquired once');
  const verifiedEntry = legacy.snapshots()[webstore];
  assert.strictEqual(new URL(verifiedEntry.sourceUrl).searchParams.get('fallbackToHost'), '0',
    'saving browser artwork preserves exact-page matching provenance');
  assert.strictEqual(shortcutFavicon.getCachedIconSource(verifiedEntry), 'cache');
  await legacy.openEditor();
  assert.strictEqual(legacy.editorSource(), 'cache', 'a local Chrome favicon endpoint must not be mislabeled as a third-party service');
  assert.notStrictEqual(legacy.editorIcon(), '', 'the newly verified browser snapshot remains usable');
  const snapshots = legacy.snapshots();
  legacy.close();
  const rebound = await openFrontend(pathSpecific(), webstore, { initialSnapshots: snapshots, iconSource: 'cache' });
  assert.strictEqual(rebound.messages().length, 0, 'a verified saved snapshot does not fetch again on reopening');
  rebound.close();

  const favicon2 = await openFrontend(pathSpecific(), webstore, {
    initialSnapshots: shortcutFavicon.setCachedIcon({}, webstore, oldBytes,
      `chrome://favicon2/?pageUrl=${encodeURIComponent(webstore)}&fallbackToHost=0`),
    iconSource: 'cache'
  });
  assert.ok(favicon2.tileIcon() !== oldBytes && favicon2.messages().length === 1,
    'old chrome://favicon2 snapshots are not proof of exact-page matching and must be reacquired through the extension endpoint');
  favicon2.close();
}

// The shortcut's stored source drives automatic acquisition, and the editor
// refreshes from the source it shows.
async function testStoredAndSelectedSources(page, normalizedPage) {
  const faviconIs = await openFrontend(createAcquisition(), normalizedPage, { iconSource: 'favicon-is' });
  assert.ok(faviconIs.tileIcon());
  assert.strictEqual(faviconIs.messages()[0].iconSource, 'favicon-is');
  await faviconIs.openEditor();
  assert.strictEqual(faviconIs.editorSource(), 'favicon-is');
  await faviconIs.refresh();
  assert.ok(faviconIs.editorIcon().startsWith('data:image/png'));
  assert.deepStrictEqual([faviconIs.messages()[1].iconSource, faviconIs.messages()[1].refresh], ['favicon-is', true]);
  const faviconIsSnapshots = faviconIs.snapshots();
  faviconIs.close();
  const restart = await openFrontend(createAcquisition(), normalizedPage, { iconSource: 'favicon-is', initialSnapshots: faviconIsSnapshots });
  assert.strictEqual(restart.tileIcon(), faviconIsSnapshots[normalizedPage].dataUrl);
  assert.strictEqual(restart.messages().length, 0, 'the selected Favicon.is snapshot must survive a restart');
  restart.close();

  const cache = await openFrontend(createAcquisition(), normalizedPage, { iconSource: 'cache' });
  assert.ok(cache.tileIcon());
  assert.strictEqual(cache.messages()[0].iconSource, 'cache', 'stored source must control automatic acquisition');
  await cache.openEditor();
  await cache.chooseSource('service');
  await cache.refresh();
  assert.strictEqual(cache.messages()[cache.messages().length - 1].iconSource, 'service', 'the editor must forward the selected refresh source');
  cache.close();
}

// Built-in artwork comes with the extension for exact supported hosts.
async function testBuiltinArtwork() {
  const githubPage = 'https://github.com/kubai087/lumno-extension';
  const builtinUrl = `${EXTENSION_ORIGIN}/${shortcutFavicon.getBundledShortcutIconAssetPath(githubPage, searchUtils.getDefaultSiteSearchProviders())}`;
  const acquisition = createAcquisition();
  const builtin = await openFrontend(acquisition, githubPage, {
    iconSource: 'builtin',
    initialSnapshots: shortcutFavicon.setCachedIcon({}, githubPage, dataUrl(png(64, 7)), 'https://t2.gstatic.cn/faviconV2')
  });
  assert.strictEqual(builtin.tileIcon(), '', 'built-in mode must ignore previous remote artwork');
  assert.deepStrictEqual([builtin.messages(), acquisition.state.calls], [[], []], 'and skip automatic acquisition');
  await builtin.openEditor();
  assert.deepStrictEqual([builtin.editorSource(), builtin.editorIcon()], ['builtin', builtinUrl],
    'built-in artwork must replace a stale online snapshot on the shortcut surface');
  await builtin.setUrl('https://www.github.com/');
  assert.ok(builtin.editorSources().includes('builtin'), 'www. hosts share the packaged artwork');
  for (const unsupported of ['https://github.com.evil.test/', 'https://not-supported.test/', 'chrome://settings/']) {
    await builtin.setUrl(unsupported);
    assert.ok(!builtin.editorSources().includes('builtin'), `eligibility must match a packaged exact host: ${unsupported}`);
  }
  builtin.close();

  const orphaned = await openFrontend(createAcquisition(), 'https://not-supported.test/', { iconSource: 'builtin' });
  assert.ok(orphaned.messages().length > 0, 'a built-in choice without packaged artwork must fall back to automatic acquisition');
  orphaned.close();

  const legacy = await openFrontend(createAcquisition(), githubPage);
  await legacy.openEditor();
  assert.strictEqual(legacy.editorSource(), 'cache', 'automatic path-specific shortcuts must not silently select host-wide bundled artwork');
  legacy.close();
}

// In strict mode (enhanced fetching off) New Tab keeps Chrome's artwork as
// local bytes; it changes only when a manual refresh is saved.
async function testStableSnapshot(page, normalizedPage) {
  const strict = createAcquisition({ enhanced: false });
  const frontend = await openFrontend(strict, page);
  const snapshot = frontend.tileIcon();
  assert.ok(snapshot.startsWith('data:image/png;base64,'), 'strict-mode shortcuts should retain Chrome artwork as local bytes');
  assert.ok(strict.state.calls.every((call) => isBrowserUrl(call.url)),
    'strict-mode acquisition must not contact third-party services or website icon files');
  assert.strictEqual(frontend.writes(), 1, 'the snapshot should be saved once');
  strict.state.browserImage = png(32, 9);

  await frontend.openEditor();
  await frontend.refresh();
  const draft = frontend.editorIcon();
  assert.notStrictEqual(draft, snapshot, 'refresh should read current Chrome artwork');
  assert.strictEqual(frontend.tileIcon(), snapshot, 'refresh preview must leave the saved icon unchanged until Save');
  assert.strictEqual(frontend.writes(), 1, 'preview must not persist new artwork');
  assert.strictEqual(frontend.messages()[1].refresh, true);
  await frontend.save(true);
  assert.strictEqual(frontend.tileIcon(), snapshot, 'failed shortcut persistence must not replace the old snapshot');
  assert.strictEqual(await frontend.save(false), true);
  assert.strictEqual(frontend.tileIcon(), draft, 'saving a manual refresh should replace the fixed snapshot');
  assert.ok(strict.state.calls.every((call) => call.url.startsWith('chrome-extension:')),
    'refresh in strict mode must still use only browser cache requests');
  const saved = frontend.snapshots();
  frontend.close();

  strict.state.browserImage = png(32, 12);
  const reopened = await openFrontend(strict, page, { initialSnapshots: saved });
  assert.strictEqual(reopened.tileIcon(), draft, 'reopening New Tab must reuse the snapshot, not a later Chrome cache change');
  assert.strictEqual(reopened.messages().length, 0);
  reopened.close();

  // Bytes in the page favicon cache never stand in for an exact-page lookup.
  const migratedData = dataUrl(png(64, 6));
  const persistKey = faviconUtils.getFaviconPersistCacheKey(page);
  const unproven = await openFrontend(strict, normalizedPage, {
    persistedEntries: { [persistKey]: { dataUrl: migratedData, updatedAt: Date.now() } }
  });
  assert.notStrictEqual(unproven.tileIcon(), migratedData, 'legacy bytes without source provenance must not bypass the exact-page lookup');
  assert.strictEqual(unproven.messages().length, 1);
  unproven.close();

  const otherPage = await openFrontend(strict, normalizedPage, {
    persistedEntries: { [faviconUtils.getFaviconPersistCacheKey('https://developer.chrome.com/another')]: { dataUrl: migratedData, updatedAt: Date.now() } }
  });
  assert.notStrictEqual(otherPage.tileIcon(), migratedData, 'migration must not copy a different page icon on the same host');
  otherPage.close();

  // A shortcut removed while the favicon cache loads is not acquired.
  const removed = await openFrontend(strict, normalizedPage, { holdFaviconCache: true });
  await removed.removeShortcut(await shortcutsStorage([]));
  await removed.release();
  assert.strictEqual(removed.messages().length, 0, 'a removed shortcut must not trigger acquisition after cache loading');
  removed.close();
}

(async () => {
  const page = 'https://developer.chrome.com/docs/extensions/?view=read#intro';
  const normalizedPage = shortcutFavicon.normalizePageUrl(page);
  await testCacheMigration(page);
  await testFirefoxCacheSource();
  await testSources(page, normalizedPage);
  await testPathSpecificPages();
  await testStoredAndSelectedSources(page, normalizedPage);
  await testBuiltinArtwork();
  await testStableSnapshot(page, normalizedPage);
  console.log('Shortcut favicon acquisition, migration, and stable snapshot tests passed.');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
