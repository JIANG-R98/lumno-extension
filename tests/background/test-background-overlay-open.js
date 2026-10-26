const assert = require('assert');
const { loadBackground, wait } = require('../helpers/background-harness');
const { createFakeTabPages } = require('../helpers/fake-tab-pages');
const { createOverlayPage } = require('../helpers/overlay-runtime-harness');

// The search shortcut on web pages, against the real worker and pages that
// keep what was injected into them until they navigate: opening, reusing
// the overlay runtime, and keeping an overlay opened during a page load open
// in the Document that replaces it.

const PAGE_URL = 'https://page.example.test/a';
const NEXT_URL = 'https://page.example.test/b';

function boot(tab, options) {
  const pages = createFakeTabPages();
  const config = options || {};
  const harness = loadBackground(Object.assign({
    tabs: [Object.assign({ id: 7, windowId: 1, index: 0, active: true, title: 'Page' }, tab)],
    configureChrome: pages.install
  }, config));
  const press = () => harness.chrome.commands.onCommand.dispatch('show-search');
  const injections = () => pages.log.filter((entry) => entry.kind === 'files');
  const invocations = () => pages.log.filter((entry) => entry.kind === 'func' && entry.args.length === 3);
  return { harness, pages, press, injections, invocations };
}

async function testOpensAtOnceAndReusesTheRuntime() {
  const session = boot({ url: PAGE_URL, status: 'complete' });
  await wait(30);
  session.harness.calls.length = 0;
  session.press();
  await wait(300);
  const queries = session.harness.calls.filter((call) => call.name === 'tabs.query');
  assert.strictEqual(queries.length, 1, 'an injectable page should open without querying other tabs first');
  assert.strictEqual(session.pages.log[0].kind, 'func', 'the worker should first ask the page whether it already runs the overlay');
  assert.deepStrictEqual(session.injections().map((entry) => entry.files),
    [['build/icon-font-preload.js', 'build/overlay-islands.js', 'build/overlay.js']]);
  assert.ok(session.pages.log.every((entry) => entry.injectImmediately),
    'probing, injecting and opening should all run without waiting for document_idle');
  assert.strictEqual(session.pages.page(7).overlayOpen, true);
  assert.ok(session.pages.page(7).invocations[0].context.openedAt >= session.injections()[0].at,
    'the one-time runtime injection should not count against the entry motion budget');

  session.press();
  await wait(300);
  assert.strictEqual(session.pages.page(7).overlayOpen, false, 'the shortcut again should close the overlay');
  session.press();
  await wait(300);
  assert.strictEqual(session.injections().length, 1, 'a page that already runs the overlay should not be injected again');
  assert.strictEqual(session.pages.page(7).overlayOpen, true);
}

// The worker reuses an overlay already in the page only when its runtime
// version matches; a mismatch would reinject on every press.
async function testWorkerAndOverlayAgreeOnTheRuntimeVersion() {
  const session = boot({ url: PAGE_URL, status: 'complete' });
  await wait(30);
  session.press();
  await wait(300);
  const page = await createOverlayPage();
  const injectedVersion = page.window._x_extension_search_overlay_runtime_version_2026_unique_;
  page.close();
  assert.ok(injectedVersion, 'the injected overlay should publish its runtime version');
  assert.strictEqual(session.pages.probedVersion(), injectedVersion,
    'the worker should look for the version the injected overlay publishes');
}

async function testConcurrentPressesOpenOnce() {
  const session = boot({ url: PAGE_URL, status: 'loading' });
  await wait(30);
  session.press();
  await wait(5);
  session.press();
  await wait(400);
  assert.strictEqual(session.injections().length, 1, 'a second press while the first is still opening should not inject again');
  assert.strictEqual(session.invocations().length, 1);
}

async function testOverlayOpenedWhileLoadingSurvivesTheNextDocument() {
  const session = boot({ url: PAGE_URL, status: 'loading' });
  await wait(30);
  session.press();
  await wait(300);
  const [first] = session.pages.page(7).invocations;
  assert.strictEqual(first.context.loadingSessionTracked, true, 'an overlay opened while the page loads should be tracked');

  const tracked = await session.harness.sendMessage({
    action: 'updateOverlayLoadingSession',
    session: { inputValue: 'draft', selectionStart: 1, selectionEnd: 3, selectionDirection: 'forward', focused: true, revision: 1 }
  }, { tab: { id: 7, windowId: 1, url: PAGE_URL }, url: PAGE_URL, frameId: 0, documentId: '1' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(tracked)), { ok: true, tracked: true });

  session.pages.navigate(session.harness, 7, NEXT_URL);
  await wait(400);
  const page = session.pages.page(7);
  assert.strictEqual(page.overlayOpen, true, 'the overlay should be opened again in the Document that replaced it');
  const [restored] = page.invocations;
  assert.strictEqual(restored.context.ensureOpen, true, 'restoring should never toggle an open overlay closed');
  assert.deepStrictEqual(
    {
      inputValue: restored.context.loadingSession.inputValue,
      selectionStart: restored.context.loadingSession.selectionStart,
      selectionEnd: restored.context.loadingSession.selectionEnd
    },
    { inputValue: 'draft', selectionStart: 1, selectionEnd: 3 },
    'the restored overlay should get the draft and selection typed before the navigation'
  );

  session.pages.complete(session.harness, 7);
  await wait(300);
  assert.strictEqual(session.pages.page(7).invocations.length, 1, 'a connected overlay should not be reopened when the load completes');
  await wait(1700);
  session.pages.navigate(session.harness, 7, 'https://page.example.test/c');
  await wait(400);
  assert.strictEqual(session.pages.page(7).overlayOpen, false,
    'once the page has settled, a later navigation should not bring the overlay back');
}

async function testAFailedInjectionDuringLoadIsRetried() {
  const session = boot({ url: PAGE_URL, status: 'loading' });
  await wait(30);
  session.press();
  await wait(300);
  session.harness.tabs[0].url = NEXT_URL;
  session.pages.navigate(session.harness, 7, NEXT_URL);
  session.pages.page(7).unavailable = true;
  await wait(60);
  session.pages.page(7).unavailable = false;
  await wait(600);
  assert.strictEqual(session.pages.page(7).overlayOpen, true,
    'an injection that fails while the next Document is still committing should be retried');
}

async function testUserCloseIsNotUndoneByTheLoad() {
  const session = boot({ url: PAGE_URL, status: 'loading' });
  await wait(30);
  session.press();
  await wait(300);
  session.press();
  await wait(300);
  assert.strictEqual(session.pages.page(7).overlayOpen, false);
  session.pages.complete(session.harness, 7);
  await wait(400);
  assert.strictEqual(session.pages.page(7).overlayOpen, false, 'an overlay the user closed should stay closed');
}

async function testShortcutDuringAProvisionalNavigationWaitsForThePage() {
  const session = boot({ url: 'chrome://newtab/', pendingUrl: 'https://page.example.test/typed', status: 'loading' });
  await wait(30);
  session.press();
  await wait(300);
  assert.deepStrictEqual(session.injections(), [], 'nothing can be injected before the destination page commits');
  assert.ok(!session.harness.calls.some((call) => call.name === 'tabs.create'), 'no fallback tab should open');
  session.harness.tabs[0].pendingUrl = '';
  session.pages.navigate(session.harness, 7, 'https://page.example.test/typed');
  await wait(400);
  assert.strictEqual(session.pages.page(7).overlayOpen, true, 'the overlay should open once the page it was pressed for commits');
}

async function testNavigationEventOverridesAStaleTabSnapshot() {
  const session = boot({ url: PAGE_URL, status: 'complete' });
  await wait(30);
  // Chrome reports the navigation, but tabs.query still answers from the old Document.
  session.harness.chrome.tabs.onUpdated.dispatch(7, { status: 'loading', url: NEXT_URL }, { id: 7, windowId: 1, url: PAGE_URL, status: 'complete' });
  session.press();
  await wait(300);
  assert.strictEqual(session.pages.page(7).invocations[0].context.loadingSessionTracked, true,
    'a shortcut during a navigation should be tracked even when the tab snapshot still says complete');

  const settled = boot({ url: PAGE_URL, status: 'complete' });
  await wait(30);
  settled.harness.chrome.tabs.onUpdated.dispatch(7, { status: 'loading', url: NEXT_URL }, { id: 7, windowId: 1, url: PAGE_URL, status: 'loading' });
  settled.harness.tabs[0].url = NEXT_URL;
  settled.harness.chrome.tabs.onUpdated.dispatch(7, { status: 'complete' }, { id: 7, windowId: 1, url: NEXT_URL, status: 'complete' });
  settled.press();
  await wait(300);
  assert.strictEqual(settled.pages.page(7).invocations[0].context.loadingSessionTracked, false,
    'once the load completes, the navigation is over');
}

async function testOverlayGetsCachedProvidersWithoutWaiting() {
  let releaseProviders;
  const providersHeld = new Promise((resolve) => {
    releaseProviders = resolve;
  });
  const session = boot({ url: PAGE_URL, status: 'complete' }, {
    extensionUrls: true,
    fetch(url) {
      if (String(url).endsWith('/assets/data/site-search.json')) {
        return providersHeld.then(() => ({ json: () => Promise.resolve({ items: [{ key: 'yt', name: 'YouTube', template: 'https://youtube.test/?q={query}' }] }) }));
      }
      return Promise.reject(new Error('offline'));
    }
  });
  await wait(30);
  session.press();
  await wait(300);
  assert.strictEqual(session.pages.page(7).overlayOpen, true, 'a cold worker should open without waiting for the provider list');
  assert.deepStrictEqual(session.pages.page(7).invocations[0].context.siteSearchProviders, []);
  releaseProviders();
  await wait(50);
  session.press();
  await wait(300);
  session.press();
  await wait(300);
  assert.deepStrictEqual(session.pages.page(7).invocations.at(-1).context.siteSearchProviders.map((item) => item.key), ['yt'],
    'later opens should carry the loaded providers');
}

async function testOverlayTabListIsProjected() {
  const harness = loadBackground({
    tabs: [
      { id: 7, windowId: 1, index: 0, active: true, url: PAGE_URL, title: 'Page', favIconUrl: 'https://page.example.test/icon.png', audible: true, mutedInfo: { muted: false }, sessionId: 'x' },
      { id: 8, windowId: 1, index: 1, active: false, url: 'https://private.example.test/', title: 'Private', incognito: true }
    ]
  });
  const response = await harness.sendMessage({ action: 'getTabsForOverlay' }, { tab: { id: 7, windowId: 1, url: PAGE_URL }, url: PAGE_URL });
  const tabs = JSON.parse(JSON.stringify(response.tabs));
  assert.deepStrictEqual(tabs.map((tab) => tab.id), [7], 'incognito tabs should not be offered to a web page');
  assert.deepStrictEqual(
    { id: tabs[0].id, title: tabs[0].title, url: tabs[0].url, favIconUrl: tabs[0].favIconUrl },
    { id: 7, title: 'Page', url: PAGE_URL, favIconUrl: 'https://page.example.test/icon.png' }
  );
  ['audible', 'mutedInfo', 'sessionId', 'windowId', 'index'].forEach((field) => {
    assert.ok(!(field in tabs[0]), `the page should not receive the browser tab's ${field}`);
  });
}

(async () => {
  await testOpensAtOnceAndReusesTheRuntime();
  await testWorkerAndOverlayAgreeOnTheRuntimeVersion();
  await testConcurrentPressesOpenOnce();
  await testOverlayOpenedWhileLoadingSurvivesTheNextDocument();
  await testAFailedInjectionDuringLoadIsRetried();
  await testUserCloseIsNotUndoneByTheLoad();
  await testShortcutDuringAProvisionalNavigationWaitsForThePage();
  await testNavigationEventOverridesAStaleTabSnapshot();
  await testOverlayGetsCachedProvidersWithoutWaiting();
  await testOverlayTabListIsProjected();
  console.log('background overlay open tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
