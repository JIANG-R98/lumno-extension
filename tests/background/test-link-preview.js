const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const { moduleScript } = require('../helpers/module-script');
const linkPreview = require('../../src/background/link-preview.ts');
const settings = require('../../src/domain/settings/index.ts');
const { toPreviewFrameUrl } = require('../../src/domain/link-preview-frame-url.ts');
const { linkPreviewSessions } = require('../../src/domain/settings/features.ts');
const { createAreaSettingsStore } = require('../helpers/worker-settings');

// The link preview: the background service that prepares and opens a
// preview for a tab, and the content script that turns Shift+click on a link
// into one.

const flush = () => new Promise((resolve) => setImmediate(resolve));
const TEST_EXTENSION_ID = 'lumno-test-extension';

function createChromeMock(options) {
  const config = options || {};
  const calls = { rules: [], captures: 0, injected: [], sent: [], created: [] };
  const sessionRules = new Map();
  const chromeApi = {
    runtime: { lastError: null, getURL: (path) => `chrome-extension://lumno-test/${path}` },
    declarativeNetRequest: {
      updateSessionRules(update, callback) {
        calls.rules.push(update);
        (update.removeRuleIds || []).forEach((id) => sessionRules.delete(id));
        (update.addRules || []).forEach((rule) => sessionRules.set(rule.id, rule));
        callback();
      },
      getSessionRules(callback) {
        callback(Array.from(sessionRules.values()));
      }
    },
    tabs: {
      captureVisibleTab(windowId, captureOptions, callback) {
        calls.captures += 1;
        callback('data:image/jpeg;base64,AAAA');
      },
      sendMessage(tabId, message, sendOptions, callback) {
        calls.sent.push({ tabId, message, sendOptions });
        const respond = config.respond || (() => true);
        callback(respond(message));
      },
      create(properties, callback) {
        calls.created.push(properties);
        callback({ id: 99 });
      },
      onRemoved: { addListener() {} },
      onUpdated: { addListener() {} }
    },
    webRequest: {
      onBeforeRedirect: {
        listeners: [],
        addListener(listener, filter) {
          this.listeners.push({ listener, filter });
        },
        removeListener(listener) {
          this.listeners = this.listeners.filter((entry) => entry.listener !== listener);
        }
      }
    },
    scripting: {
      executeScript(injection, callback) {
        calls.injected.push(injection);
        callback([{ result: undefined }]);
      }
    }
  };
  return { chromeApi, calls, sessionRules };
}

function tabRules(sessionRules, tabId) {
  return Array.from(sessionRules.values()).filter((rule) => rule.condition.tabIds.includes(tabId));
}

function hasTabRules(sessionRules, tabId) {
  return tabRules(sessionRules, tabId).length > 0;
}

async function testRuleIdsStayInRange() {
  const { chromeApi, sessionRules } = createChromeMock();
  const service = linkPreview.createLinkPreviewService({ chromeApi });
  // Chrome's tab ids run past a billion.
  await service.open({ id: 2000000000, windowId: 1 }, 'https://example.com/a');
  await service.open({ id: 2000000001, windowId: 1 }, 'https://example.com/b');
  const ids = Array.from(sessionRules.keys());
  assert.strictEqual(tabRules(sessionRules, 2000000000).length, 2);
  assert.ok(ids.every((id) => Number.isInteger(id) && id >= 1 && id < 2 ** 31), 'rule ids stay within what Chrome accepts');
  assert.strictEqual(new Set(ids).size, ids.length);
  await service.handleTabRemoved(2000000000);
  assert.ok(!hasTabRules(sessionRules, 2000000000));
  assert.strictEqual(tabRules(sessionRules, 2000000001).length, 2, 'the other tab keeps its rules');
}

async function testRuleScope() {
  const [frameOptionsRule, cspRule] = linkPreview.buildFrameHeaderRules(7, [2, 3], ['example.com']);
  assert.strictEqual(frameOptionsRule.id, 2);
  assert.deepStrictEqual(frameOptionsRule.condition, {
    tabIds: [7],
    requestDomains: ['example.com'],
    resourceTypes: ['sub_frame'],
    responseHeaders: [{ header: 'x-frame-options' }]
  }, 'header removal must stay limited to the previewed site\'s subframes in the previewing tab, ' +
    'and is settled on the response, so a domain allowed on a redirect reaches the page it leads to');
  assert.deepStrictEqual(frameOptionsRule.action.responseHeaders.map((entry) => entry.header), ['x-frame-options']);
  assert.strictEqual(cspRule.id, 3);
  assert.deepStrictEqual(cspRule.action.responseHeaders.map((entry) => entry.header), ['content-security-policy']);
  assert.deepStrictEqual(cspRule.condition.responseHeaders,
    [{ header: 'content-security-policy', values: ['*frame-ancestors*'] }],
    'a CSP goes only when it refuses framing; its limits on script stay with the previewed page');
  const legacy = linkPreview.buildFrameHeaderRules(7, [2, 3], ['example.com'], false);
  assert.strictEqual(legacy.length, 1);
  assert.deepStrictEqual(legacy[0].action.responseHeaders.map((entry) => entry.header),
    ['x-frame-options', 'content-security-policy'], 'without header matching the CSP goes as a whole');
  const workerRule = linkPreview.buildWorkerHeaderRule(['example.com']);
  assert.deepStrictEqual(workerRule.condition.tabIds, [-1], 'the second rule reaches service workers\' requests only');
  assert.deepStrictEqual(workerRule.condition.requestDomains, ['example.com'],
    'and only those to the previewed sites');
  assert.deepStrictEqual(workerRule.action.responseHeaders, [{ header: 'x-frame-options', operation: 'remove' }],
    'a worker may cache what it fetched for the site\'s own tabs, so its CSP stays');
  assert.ok(linkPreview.isPreviewableUrl('https://example.com/a'));
  assert.ok(!linkPreview.isPreviewableUrl('javascript:alert(1)'));
  assert.ok(!linkPreview.isPreviewableUrl('chrome://settings'));
  assert.strictEqual(linkPreview.readUrlDomain('https://www.Example.com./a'), 'example.com');
  assert.strictEqual(linkPreview.readUrlDomain('https://docs.example.com/a'), 'docs.example.com');
  assert.strictEqual(linkPreview.readUrlDomain('chrome://settings'), '');
}

const PREVIEW_FRAME_ID = 42;

function surfaceResponder(overrides) {
  return (message) => (overrides && Object.hasOwn(overrides, message.action) ? overrides[message.action] : true);
}

// The secret the surface was handed for the tab's preview, and the preview
// frame binding with it as the surface's frame would.
function prewarmSecret(calls, tabId) {
  const prewarms = calls.sent.filter((entry) => entry.tabId === tabId && entry.message.action === 'lumnoLinkPreviewPrewarm');
  return prewarms[prewarms.length - 1].message.frameSecret;
}

async function bindPreviewFrame(service, calls, tabId, url) {
  return service.bindFrame(frameSender(tabId, url), prewarmSecret(calls, tabId));
}

function frameSender(tabId, url, frameId = PREVIEW_FRAME_ID) {
  return { tab: { id: tabId, windowId: 1 }, frameId, url };
}

function allowedDomains(sessionRules, tabId) {
  const rules = tabRules(sessionRules, tabId);
  return rules.length ? rules[0].condition.requestDomains.slice().sort() : [];
}

async function testRulesNameThePreviewedSite() {
  const { chromeApi, sessionRules } = createChromeMock({ respond: surfaceResponder() });
  const service = linkPreview.createLinkPreviewService({ chromeApi });
  await service.open({ id: 3, windowId: 1 }, 'https://www.example.com/a');
  assert.deepStrictEqual(allowedDomains(sessionRules, 3), ['example.com'],
    'the page under the preview cannot use it to frame other sites that refuse framing');
  assert.ok(tabRules(sessionRules, 3).every((rule) => rule.condition.requestDomains.length === 1));
  await service.open({ id: 4, windowId: 1 }, 'https://twitter.com/a_b/status/42');
  assert.deepStrictEqual(allowedDomains(sessionRules, 4), ['twitter.com', 'x.com'],
    'an X post loads through x.com, which its rule covers too');
  assert.deepStrictEqual(sessionRules.get(linkPreview.WORKER_RULE_ID).condition.requestDomains,
    ['example.com', 'twitter.com', 'x.com'], 'workers\' requests lose headers for the open previews\' sites only');
  await service.handleTabRemoved(4);
  assert.deepStrictEqual(sessionRules.get(linkPreview.WORKER_RULE_ID).condition.requestDomains, ['example.com']);
}

async function testOnlyThePreviewFrameMovesTheRule() {
  const { chromeApi, calls, sessionRules } = createChromeMock({ respond: surfaceResponder() });
  const service = linkPreview.createLinkPreviewService({ chromeApi });
  await service.open({ id: 3, windowId: 1 }, 'https://example.com/a');
  const secret = prewarmSecret(calls, 3);
  assert.ok(/^[0-9a-f]{32}$/.test(secret), 'each preview hands its surface a secret of its own');
  assert.strictEqual(calls.sent.find((entry) => entry.message.action === 'lumnoLinkPreviewShow').message.frameSecret, secret);
  assert.strictEqual(await service.bindFrame(frameSender(3, 'https://example.com/a', 7), 'guess'), false,
    'a frame without the secret is not the preview frame');
  assert.strictEqual(await service.bindFrame(frameSender(3, 'https://example.com/a', 0), secret), false,
    'nor is the top frame');
  assert.strictEqual(await bindPreviewFrame(service, calls, 3, 'https://example.com/a'), true);
  assert.strictEqual(await service.bindFrame(frameSender(3, 'https://example.com/a', 7), secret), false,
    'a frame the page passed the secret to comes second and is not bound');
  await service.noteFrameCommitted(frameSender(3, 'https://other.test/x', 7));
  assert.deepStrictEqual(allowedDomains(sessionRules, 3), ['example.com'],
    'a frame of the page\'s own cannot widen the rule');
  await service.noteFrameCommitted(frameSender(3, 'https://other.test/x'));
  assert.deepStrictEqual(allowedDomains(sessionRules, 3), ['example.com', 'other.test'],
    'the site the preview went on to keeps working in it');
  await service.noteFrameCommitted(frameSender(3, 'https://third.test/y'));
  assert.deepStrictEqual(allowedDomains(sessionRules, 3), ['example.com', 'third.test'],
    'a site the preview left is framed as anywhere else again');
}

async function testRefusedPageTriesAgainForItsRedirect() {
  const fetched = [];
  const { chromeApi, calls, sessionRules } = createChromeMock({ respond: surfaceResponder() });
  const service = linkPreview.createLinkPreviewService({
    chromeApi,
    fetch: async (url, init) => {
      fetched.push({ url, init });
      return { url: url.replace('short.test/a', 'final.test/page') };
    }
  });
  await service.open({ id: 5, windowId: 1 }, 'https://example.com/a');
  const token = calls.sent[0].message.token;
  await bindPreviewFrame(service, calls, 5, 'https://example.com/a');
  await service.noteFrameNavigation(frameSender(5, 'https://example.com/a', 7), 'https://evil.test/');
  await service.noteFrameNavigation(frameSender(5, 'https://example.com/a'), 'https://short.test/a');
  assert.deepStrictEqual(await service.retryRefusedFrame(5, 'stale'), { retry: false },
    'a replaced preview gets no retry');
  const answer = await service.retryRefusedFrame(5, token);
  assert.deepStrictEqual(answer, { retry: true, url: 'https://short.test/a' },
    'the frame tries the address it went to again, never one a frame of the page named');
  assert.strictEqual(fetched[0].url, 'https://short.test/a');
  assert.strictEqual(fetched[0].init.redirect, 'follow');
  assert.deepStrictEqual(allowedDomains(sessionRules, 5), ['example.com', 'final.test', 'short.test'],
    'the address and where it redirects are allowed for the next try');
  assert.deepStrictEqual(await service.retryRefusedFrame(5, token), { retry: false },
    'a page still refused with its domains allowed is not tried again');
  await service.noteFrameCommitted(frameSender(5, 'https://final.test/page'));
  assert.deepStrictEqual(allowedDomains(sessionRules, 5), ['example.com', 'final.test'],
    'once the page loads, the domains of the try go');

  let refusedAnswer = null;
  service.messageHandlers.linkPreviewFrameRefused({ token }, frameSender(5, 'https://example.com/', 7),
    (value) => { refusedAnswer = value; });
  assert.deepStrictEqual(refusedAnswer, { retry: false }, 'only the top frame\'s surface asks for a retry');
}

// What the browser reports when a frame's navigation is redirected.
function frameRedirect(tabId, frameId, requestId, url, redirectUrl) {
  return { type: 'sub_frame', tabId, frameId, requestId, url, redirectUrl };
}

async function testRedirectAllowsItsDomainAtOnce() {
  const { chromeApi, calls, sessionRules } = createChromeMock({ respond: surfaceResponder() });
  const service = linkPreview.createLinkPreviewService({
    chromeApi,
    fetch: async () => ({ url: 'https://final.test/page' })
  });
  const redirects = chromeApi.webRequest.onBeforeRedirect;
  const link = 'https://www.google.com/goto?url=abc#result';
  await service.open({ id: 9, windowId: 1 }, link);
  assert.strictEqual(redirects.listeners.length, 1, 'redirects are watched while a preview is up');
  assert.deepStrictEqual(redirects.listeners[0].filter.types, ['sub_frame']);
  await service.handleFrameRedirect(frameRedirect(9, 11, 'r0', 'https://www.google.com/other', 'https://evil.test/'));
  await service.handleFrameRedirect(frameRedirect(9, 0, 'r9', 'https://www.google.com/goto?url=abc', 'https://evil.test/'));
  await service.handleFrameRedirect(frameRedirect(10, 12, 'r1', 'https://www.google.com/goto?url=abc', 'https://evil.test/'));
  assert.deepStrictEqual(allowedDomains(sessionRules, 9), ['google.com'],
    'a redirect of another frame, the top frame or another tab allows nothing');
  await service.handleFrameRedirect(frameRedirect(9, 12, 'r1', 'https://www.google.com/goto?url=abc', 'https://hop.test/x'));
  await service.handleFrameRedirect(frameRedirect(9, 12, 'r1', 'https://hop.test/x', 'https://developer.mozilla.org/en'));
  assert.deepStrictEqual(allowedDomains(sessionRules, 9), ['developer.mozilla.org', 'google.com', 'hop.test'],
    'the preview\'s first load is followed through its redirects, so the page it lands on is not refused');
  await bindPreviewFrame(service, calls, 9, 'https://developer.mozilla.org/en');
  assert.deepStrictEqual(allowedDomains(sessionRules, 9), ['developer.mozilla.org', 'google.com'],
    'once the page loads, the domains it passed through go');

  await service.handleFrameRedirect(frameRedirect(9, 12, 'r2', 'https://developer.mozilla.org/a', 'https://evil.test/'));
  assert.deepStrictEqual(allowedDomains(sessionRules, 9), ['developer.mozilla.org', 'google.com'],
    'once the preview frame is bound, only its own redirects count');
  await service.handleFrameRedirect(frameRedirect(9, PREVIEW_FRAME_ID, 'r3', 'https://developer.mozilla.org/a', 'https://final.test/page'));
  assert.deepStrictEqual(allowedDomains(sessionRules, 9), ['developer.mozilla.org', 'final.test', 'google.com']);
  const token = calls.sent[0].message.token;
  assert.strictEqual((await service.retryRefusedFrame(9, token)).retry, true,
    'a domain allowed on a redirect that came too late for its load is still tried once more');

  await service.discard(9, token);
  assert.strictEqual(redirects.listeners.length, 0, 'with no preview, redirects are not watched');
}

async function testReleasedPressCancels() {
  const { chromeApi, calls, sessionRules } = createChromeMock({ respond: surfaceResponder() });
  const service = linkPreview.createLinkPreviewService({ chromeApi });
  service.prepare({ id: 6, windowId: 1 }, 'https://example.com/a');
  await flush();
  assert.ok(hasTabRules(sessionRules, 6));
  await service.cancel(6);
  assert.ok(!hasTabRules(sessionRules, 6), 'a press released away from the link drops the rule at once');
  assert.ok(!sessionRules.has(linkPreview.WORKER_RULE_ID));
  assert.ok(calls.sent.some((entry) => entry.message.action === 'lumnoLinkPreviewDiscard'),
    'and the hidden window with it');
  await service.open({ id: 6, windowId: 1 }, 'https://example.com/a');
  await service.cancel(6);
  assert.ok(hasTabRules(sessionRules, 6), 'an open preview is not cancelled by a stray release');
}

async function testOpenPreviewOutlivesWorker() {
  const stored = {};
  const { chromeApi, calls, sessionRules } = createChromeMock({
    respond: surfaceResponder({ lumnoLinkPreviewPing: null })
  });
  const session = {
    get(keys, callback) {
      callback(Object.fromEntries(keys.filter((key) => Object.hasOwn(stored, key)).map((key) => [key, stored[key]])));
    },
    set(values, callback) {
      Object.assign(stored, JSON.parse(JSON.stringify(values)));
      callback();
    }
  };
  // Each worker reads the saved sessions afresh.
  const workerSettings = () => createAreaSettingsStore({ session, local: session }, [linkPreviewSessions]);
  const first = linkPreview.createLinkPreviewService({ chromeApi, settingsStore: workerSettings() });
  await first.open({ id: 8, windowId: 1 }, 'https://example.com/a');
  const token = calls.sent[0].message.token;
  await bindPreviewFrame(first, calls, 8, 'https://example.com/a');
  // The worker sleeps; a new one wakes with the preview still on screen.
  chromeApi.tabs.sendMessage = (tabId, message, sendOptions, callback) => {
    callback(message.action === 'lumnoLinkPreviewPing' ? { token } : true);
  };
  const woken = linkPreview.createLinkPreviewService({ chromeApi, settingsStore: workerSettings() });
  woken.attach();
  await woken.noteFrameCommitted(frameSender(8, 'https://other.test/x'));
  assert.deepStrictEqual(allowedDomains(sessionRules, 8), ['example.com', 'other.test'],
    'a woken worker still knows the preview frame');
  await woken.discard(8, token);
  assert.ok(!hasTabRules(sessionRules, 8));
  assert.deepStrictEqual(stored[Object.keys(stored)[0]], {}, 'a closed preview is not kept');
}

async function testPrepareThenOpen() {
  const { chromeApi, calls, sessionRules } = createChromeMock();
  const service = linkPreview.createLinkPreviewService({ chromeApi });
  const tab = { id: 3, windowId: 1, index: 2 };
  service.prepare(tab, 'https://example.com/a');
  const result = await service.open(tab, 'https://example.com/a', { x: 10, y: 20 });
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(calls.captures, 1, 'mousedown and click share one screenshot');
  assert.strictEqual(calls.injected.length, 1);
  assert.deepStrictEqual(calls.injected[0].target, { tabId: 3, frameIds: [0] });
  assert.ok(hasTabRules(sessionRules, 3), 'the tab may frame refusing pages while its preview is open');
  assert.ok(sessionRules.has(linkPreview.WORKER_RULE_ID), 'and so may pages its site\'s service worker serves');
  const actions = calls.sent.map((entry) => entry.message.action);
  assert.deepStrictEqual(actions, ['lumnoLinkPreviewPrewarm', 'lumnoLinkPreviewScreenshot', 'lumnoLinkPreviewShow']);
  assert.strictEqual(calls.sent[1].message.screenshot, 'data:image/jpeg;base64,AAAA',
    'the screenshot reaches the surface before the click, to be decoded while the button is down');
  const show = calls.sent[2].message;
  assert.strictEqual(show.screenshot, '', 'a delivered screenshot is not sent twice');
  assert.deepStrictEqual(show.origin, { x: 10, y: 20 });
  assert.strictEqual(show.token, calls.sent[0].message.token);

  await service.discard(3, 'stale-token');
  assert.ok(hasTabRules(sessionRules, 3), 'a close from a replaced preview must not drop the open one');
  await service.discard(3, show.token);
  assert.ok(!hasTabRules(sessionRules, 3), 'closing the preview removes the header rule');
  assert.ok(!sessionRules.has(linkPreview.WORKER_RULE_ID), 'with no preview left, workers\' requests keep their headers');
}

async function testOlderChromeDropsWholeCsp() {
  const { chromeApi, sessionRules } = createChromeMock();
  const update = chromeApi.declarativeNetRequest.updateSessionRules;
  chromeApi.declarativeNetRequest.updateSessionRules = (changes, callback) => {
    if ((changes.addRules || []).some((rule) => rule.condition.responseHeaders)) {
      chromeApi.runtime.lastError = { message: 'Unknown key responseHeaders' };
      callback();
      chromeApi.runtime.lastError = null;
      return;
    }
    update(changes, callback);
  };
  const service = linkPreview.createLinkPreviewService({ chromeApi });
  const result = await service.open({ id: 9, windowId: 1 }, 'https://example.com/a');
  assert.deepStrictEqual(result, { ok: true }, 'a Chrome that cannot match on headers still previews');
  assert.deepStrictEqual(tabRules(sessionRules, 9)[0].action.responseHeaders.map((entry) => entry.header),
    ['x-frame-options', 'content-security-policy']);
}

async function testWorkerRuleOutlivesOnePreview() {
  const { chromeApi, sessionRules } = createChromeMock();
  const service = linkPreview.createLinkPreviewService({ chromeApi });
  await service.open({ id: 5, windowId: 1 }, 'https://example.com/a');
  await service.open({ id: 6, windowId: 2 }, 'https://example.com/b');
  await service.handleTabRemoved(5);
  assert.ok(sessionRules.has(linkPreview.WORKER_RULE_ID), 'another tab\'s preview still needs the workers\' rule');
  await service.handleTabRemoved(6);
  assert.ok(!sessionRules.has(linkPreview.WORKER_RULE_ID));
}

async function testHoverPrepareWaitsForPressToCapture() {
  const { chromeApi, calls } = createChromeMock();
  const service = linkPreview.createLinkPreviewService({ chromeApi });
  const tab = { id: 3, windowId: 1 };
  const hovered = service.prepare(tab, 'https://example.com/a', { capture: false });
  await hovered.ready;
  await flush();
  assert.strictEqual(calls.captures, 0, 'Shift over a link loads its page but leaves the screenshot to the press');
  assert.deepStrictEqual(calls.sent.map((entry) => entry.message.action), ['lumnoLinkPreviewPrewarm']);
  const pressed = service.prepare(tab, 'https://example.com/a');
  assert.strictEqual(pressed, hovered, 'the press reuses the page already loading');
  const result = await service.open(tab, 'https://example.com/a', { x: 1, y: 2 });
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(calls.captures, 1);
  assert.deepStrictEqual(calls.sent.map((entry) => entry.message.action),
    ['lumnoLinkPreviewPrewarm', 'lumnoLinkPreviewScreenshot', 'lumnoLinkPreviewShow'],
    'one hidden window, given the screenshot once the press asks for it');
}

async function testUnclaimedPrepareExpires() {
  const { chromeApi, sessionRules } = createChromeMock();
  const timers = [];
  const service = linkPreviewService(chromeApi, timers);
  service.prepare({ id: 4, windowId: 1 }, 'https://example.com/b');
  await flush();
  assert.ok(hasTabRules(sessionRules, 4));
  timers.forEach((timer) => timer.fn());
  await flush();
  assert.ok(!hasTabRules(sessionRules, 4), 'a press the page kept must not leave the header rule behind');
}

function linkPreviewService(chromeApi, timers) {
  return linkPreview.createLinkPreviewService({
    chromeApi,
    setTimeout: (fn, ms) => {
      const timer = { fn, ms };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      const index = timers.indexOf(timer);
      if (index >= 0) {
        timers.splice(index, 1);
      }
    }
  });
}

async function testMissingSurfaceOpensTab() {
  const { chromeApi, calls, sessionRules } = createChromeMock({ respond: () => undefined });
  const service = linkPreview.createLinkPreviewService({ chromeApi });
  let response = null;
  service.messageHandlers.linkPreviewOpen(
    { url: 'https://example.com/c', origin: { x: 1, y: 1 } },
    { tab: { id: 5, windowId: 1, index: 0 }, frameId: 0 },
    (value) => { response = value; }
  );
  await flush();
  await flush();
  assert.deepStrictEqual(response, { ok: false, reason: 'surface-unavailable' });
  assert.deepStrictEqual(calls.created, [{
    url: 'https://example.com/c', active: true, index: 1, openerTabId: 5, windowId: 1
  }]);
  assert.ok(!hasTabRules(sessionRules, 5));
}

async function testFrameLoadWhileOpeningKeepsPreview() {
  // The preview's frame loading can report the tab as loading before the
  // click reaches the surface; that check must not drop the preview and open
  // a tab beside it.
  const { chromeApi, calls, sessionRules } = createChromeMock({
    respond: (message) => (message.action === 'lumnoLinkPreviewPing' ? { token: '' } : true)
  });
  const service = linkPreview.createLinkPreviewService({ chromeApi });
  const tab = { id: 6, windowId: 1, index: 0 };
  service.prepare(tab, 'https://example.com/d');
  let response = null;
  service.messageHandlers.linkPreviewOpen(
    { url: 'https://example.com/d' },
    { tab, frameId: 0 },
    (value) => { response = value; }
  );
  await service.handleTabUpdated(6, { status: 'loading' });
  await flush();
  await flush();
  assert.deepStrictEqual(response, { ok: true });
  assert.ok(hasTabRules(sessionRules, 6), 'the opening preview keeps its header rule');
  assert.deepStrictEqual(calls.created, [], 'no tab opens beside the preview');
}

async function testRefusedScreenshotTravelsWithShow() {
  const { chromeApi, calls } = createChromeMock({
    respond: (message) => message.action !== 'lumnoLinkPreviewScreenshot'
  });
  const service = linkPreview.createLinkPreviewService({ chromeApi });
  assert.deepStrictEqual(await service.open({ id: 10, windowId: 1 }, 'https://example.com/g'), { ok: true });
  const show = calls.sent.find((entry) => entry.message.action === 'lumnoLinkPreviewShow').message;
  assert.strictEqual(show.screenshot, 'data:image/jpeg;base64,AAAA');
}

async function testFailedShowOpensNoTab() {
  const { chromeApi, calls } = createChromeMock({
    respond: (message) => message.action !== 'lumnoLinkPreviewShow'
  });
  const service = linkPreview.createLinkPreviewService({ chromeApi });
  let response = null;
  service.messageHandlers.linkPreviewOpen(
    { url: 'https://example.com/e' },
    { tab: { id: 7, windowId: 1, index: 0 }, frameId: 0 },
    (value) => { response = value; }
  );
  await flush();
  await flush();
  assert.deepStrictEqual(response, { ok: false, reason: 'show-failed' });
  assert.deepStrictEqual(calls.created, [],
    'a surface asked to show may be on screen; it moves the link to a tab itself');
}

async function testOpenPreviewDroppedWhenSurfaceGone() {
  let surfaceToken = null;
  const { chromeApi, sessionRules } = createChromeMock({
    respond: (message) => {
      if (message.action === 'lumnoLinkPreviewPing') {
        return surfaceToken === null ? undefined : { token: surfaceToken };
      }
      if (message.action === 'lumnoLinkPreviewShow') {
        surfaceToken = message.token;
      }
      return true;
    }
  });
  const service = linkPreview.createLinkPreviewService({ chromeApi });
  const tab = { id: 9, windowId: 1, index: 0 };
  assert.deepStrictEqual(await service.open(tab, 'https://example.com/f'), { ok: true });
  await service.handleTabUpdated(9, { status: 'complete' });
  assert.ok(hasTabRules(sessionRules, 9), 'a surface still showing the preview keeps the rule');
  surfaceToken = null;
  await service.handleTabUpdated(9, { status: 'complete' });
  assert.ok(!hasTabRules(sessionRules, 9), 'a navigation that took the surface away drops the rule');
}

async function testReconcileDropsRulesWithoutPreview() {
  const { chromeApi, sessionRules } = createChromeMock({
    respond: (message) => (message.action === 'lumnoLinkPreviewPing' ? { token: '' } : true)
  });
  linkPreview.buildFrameHeaderRules(8, [2, 3], ['example.com']).forEach((rule) => sessionRules.set(rule.id, rule));
  sessionRules.set(linkPreview.WORKER_RULE_ID, linkPreview.buildWorkerHeaderRule(['example.com']));
  const service = linkPreview.createLinkPreviewService({ chromeApi });
  await service.reconcileRules();
  assert.ok(!hasTabRules(sessionRules, 8), 'a rule whose preview is gone is removed when the worker wakes');
  assert.ok(!sessionRules.has(linkPreview.WORKER_RULE_ID), 'and the workers\' rule with it');
}

function loadTrigger(options) {
  const config = options || {};
  const dom = new JSDOM(`<!doctype html><body>
    <a id="out" href="https://other.example/page">out</a>
    <a id="hash" href="#section">hash</a>
    <a id="file" href="https://other.example/file.zip" download>file</a>
    <a id="mail" href="mailto:a@example.com">mail</a>
    ${config.body || ''}
  </body>`, { runScripts: 'outside-only', url: config.url || 'https://docs.example.test/page' });
  const { window } = dom;
  const sent = [];
  const listeners = [];
  const originalAdd = window.addEventListener.bind(window);
  const originalRemove = window.removeEventListener.bind(window);
  window.addEventListener = (type, listener, listenerOptions) => {
    listeners.push({ type, listener });
    originalAdd(type, listener, listenerOptions);
  };
  window.removeEventListener = (type, listener, listenerOptions) => {
    const index = listeners.findIndex((entry) => entry.type === type && entry.listener === listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
    originalRemove(type, listener, listenerOptions);
  };
  if (config.name) {
    window.name = config.name;
  }
  window.chrome = {
    runtime: {
      id: TEST_EXTENSION_ID,
      lastError: null,
      sendMessage(message, callback) {
        sent.push(message);
        if (typeof callback === 'function') {
          callback();
        }
      }
    }
  };
  if (config.storage) {
    window.chrome.storage = config.storage;
  }
  if (config.navigation) {
    window.navigation = config.navigation;
  }
  window.eval(moduleScript('src/content/link-preview-trigger.ts'));
  // The events of one press, in Chrome's order. Returns the types whose
  // default was prevented; `claimed` collects the types kept from the page.
  const claimed = [];
  function press(id, eventOptions) {
    const target = window.document.getElementById(id);
    const prevented = [];
    claimed.length = 0;
    const config = eventOptions || {};
    const skip = config.skip || [];
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].filter((type) => !skip.includes(type)).forEach((type) => {
      const event = Object.assign({
        type,
        isTrusted: true,
        button: 0,
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        clientX: 30,
        clientY: 40,
        target,
        composedPath: () => {
          const path = [];
          for (let node = target; node; node = node.parentNode) {
            path.push(node);
          }
          return path.concat(window);
        },
        preventDefault() {
          prevented.push(type);
        },
        stopImmediatePropagation() {
          claimed.push(type);
        }
      }, eventOptions || {});
      delete event.skip;
      delete event.shiftOnClick;
      if (type === 'click' && config.shiftOnClick === false) {
        event.shiftKey = false;
      }
      listeners.filter((entry) => entry.type === type).forEach((entry) => entry.listener(event));
    });
    return prevented;
  }
  // One event at an element, with Shift held unless the options say not.
  function fire(type, id, eventOptions) {
    const target = id ? window.document.getElementById(id) : null;
    const event = Object.assign({
      type,
      isTrusted: true,
      pointerType: 'mouse',
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      repeat: false,
      target,
      relatedTarget: null,
      composedPath: () => {
        const path = [];
        for (let node = target; node; node = node.parentNode) {
          path.push(node);
        }
        return path.concat(window);
      }
    }, eventOptions || {});
    listeners.filter((entry) => entry.type === type).forEach((entry) => entry.listener(event));
  }
  return { window, sent, press, fire, claimed, listeners };
}

function testShiftClickOpensPreview() {
  const page = loadTrigger();
  const prevented = page.press('out');
  assert.deepStrictEqual(page.claimed, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'],
    'a press the preview takes reaches no page listener, so sites cannot open it in a tab as well');
  assert.deepStrictEqual(prevented, ['mousedown', 'click'],
    'the preview replaces both the selection extension and Chrome\'s new window');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(page.sent)), [
    { action: 'linkPreviewPrepare', url: 'https://other.example/page' },
    { action: 'linkPreviewOpen', url: 'https://other.example/page', origin: { x: 30, y: 40 } }
  ]);
}

const waitFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function testShiftHoverPrewarms() {
  const page = loadTrigger();
  page.fire('pointerover', 'out', { shiftKey: false });
  await waitFor(200);
  assert.deepStrictEqual(page.sent, [], 'a pointer over a link without Shift prepares nothing');

  page.fire('keydown', null, { key: 'Shift' });
  await waitFor(200);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(page.sent)), [
    { action: 'linkPreviewPrepare', url: 'https://other.example/page', hover: true }
  ], 'Shift held over a link starts its page loading before the press');
  page.sent.length = 0;
  page.press('out');
  await waitFor(5);
  assert.deepStrictEqual(page.sent.map((message) => message.action), ['linkPreviewPrepare', 'linkPreviewOpen'],
    'the press takes the preparation over, adding the screenshot, and opens it');
  page.fire('keyup', null, { key: 'Shift', shiftKey: false });
  assert.ok(!page.sent.some((message) => message.action === 'linkPreviewCancel'),
    'letting go of Shift after the click leaves the preview open');
}

async function testShiftHoverCancels() {
  const released = loadTrigger();
  released.fire('pointerover', 'out');
  await waitFor(200);
  released.fire('keyup', null, { key: 'Shift', shiftKey: false });
  assert.deepStrictEqual(released.sent.map((message) => message.action), ['linkPreviewPrepare', 'linkPreviewCancel'],
    'letting go of Shift before pressing cancels the preparation');

  const left = loadTrigger();
  left.fire('pointerover', 'out');
  await waitFor(200);
  left.fire('pointerover', 'hash');
  await waitFor(50);
  assert.strictEqual(left.sent.length, 1, 'a pointer slipping off the link for a moment keeps it');
  await waitFor(300);
  assert.deepStrictEqual(left.sent.map((message) => message.action), ['linkPreviewPrepare', 'linkPreviewCancel'],
    'leaving the link cancels it');

  const typing = loadTrigger();
  typing.fire('pointerover', 'out', { shiftKey: false });
  typing.fire('keydown', null, { key: 'Shift' });
  typing.fire('keydown', null, { key: 'A' });
  await waitFor(200);
  assert.deepStrictEqual(typing.sent, [], 'a capital letter typed with the pointer over a link prepares nothing');

  const passing = loadTrigger();
  passing.fire('pointerover', 'out');
  await waitFor(50);
  passing.fire('pointerover', 'hash');
  await waitFor(200);
  assert.deepStrictEqual(passing.sent, [], 'a pointer passing over a link with Shift held prepares nothing');
}

function testOrphanedTriggerStepsAside() {
  const page = loadTrigger();
  // What Chrome leaves to a content script whose extension was reloaded.
  delete page.window.chrome.runtime.id;
  assert.deepStrictEqual(page.press('out'), [], 'a trigger whose extension went away takes no press');
  assert.deepStrictEqual(page.claimed, [],
    'so the trigger injected after the reload, which listens after it, gets the press');
  assert.deepStrictEqual(page.sent, []);
  assert.deepStrictEqual(page.listeners, [], 'and it removes its listeners for good');
}

async function testPressReleasedElsewhereCancels() {
  const page = loadTrigger();
  page.press('out');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(!page.sent.some((message) => message.action === 'linkPreviewCancel'), 'a press that clicks is not cancelled');
  page.sent.length = 0;
  page.press('out', { skip: ['click'] });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepStrictEqual(page.sent.map((message) => message.action), ['linkPreviewPrepare', 'linkPreviewCancel'],
    'a press released away from the link cancels its preview, and its header rule with it');
  page.sent.length = 0;
  page.press('out', { shiftOnClick: false });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepStrictEqual(page.sent.map((message) => message.action), ['linkPreviewPrepare', 'linkPreviewCancel'],
    'so does one where Shift was let go before the click');
}

function testOtherPressesKeepDefault() {
  const page = loadTrigger();
  assert.deepStrictEqual(page.press('out', { shiftKey: false }), []);
  assert.deepStrictEqual(page.press('out', { metaKey: true }), []);
  assert.deepStrictEqual(page.press('out', { isTrusted: false }), []);
  assert.deepStrictEqual(page.press('hash'), [], 'an in-page jump is not previewed');
  assert.deepStrictEqual(page.press('file'), [], 'a download link keeps its default');
  assert.deepStrictEqual(page.press('mail'), [], 'only web links are previewed');
  assert.deepStrictEqual(page.sent, []);
  assert.deepStrictEqual(page.claimed, [], 'presses the preview does not take stay with the page');
}

function testShownAddressOpensPreview() {
  const page = loadTrigger({
    body: `
      <span id="shown" role="link">https://lumno.kubai.design</span>
      <a id="scripted" href="javascript:void(0)"><span id="scripted-text">www.example.org/a</span></a>
      <span id="plain">https://plain.example/text</span>
      <span id="name" role="link">README.md</span>
      <span id="sentence" role="link">see https://other.example/x</span>`
  });
  page.press('shown');
  assert.strictEqual(page.sent[0].url, 'https://lumno.kubai.design/',
    'a clickable address shown as text is previewed, not left to the page to open in a new window');
  page.sent.length = 0;
  page.press('scripted-text');
  assert.strictEqual(page.sent[0].url, 'https://www.example.org/a',
    'a link that runs script but shows an address opens that address');
  page.sent.length = 0;
  ['plain', 'name', 'sentence'].forEach((id) => {
    assert.deepStrictEqual(page.press(id), [], `${id}: text that is not a clickable address keeps Shift+click`);
  });
  assert.deepStrictEqual(page.sent, []);
}

function testPostOpensPreview() {
  const post = `
    <article data-testid="tweet">
      <div id="post-body">Tide is now available<div role="button"><span id="like">1</span></div></div>
      <a href="/albertuvw/status/123"><time>38m</time></a>
      <div role="link"><span id="quote">Unfold. Naturally.</span><a href="/tide_fm_app/status/99"><time>51m</time></a></div>
    </article>`;
  const timeline = loadTrigger({ url: 'https://x.com/home', body: post });
  timeline.press('post-body');
  assert.strictEqual(timeline.sent[0].url, 'https://x.com/albertuvw/status/123',
    'a press anywhere on an X post previews the post');
  timeline.sent.length = 0;
  assert.deepStrictEqual(timeline.press('like'), [], 'the post\'s buttons keep their press');
  const ownPage = loadTrigger({ url: 'https://x.com/albertuvw/status/123', body: post });
  assert.deepStrictEqual(ownPage.press('post-body'), [], 'the post a page shows has nothing to preview');
  const elsewhere = loadTrigger({ body: post });
  assert.deepStrictEqual(elsewhere.press('post-body'), [], 'only X posts open from anywhere in them');
}

function testPageNavigationAfterPressCancelled() {
  const listeners = [];
  const navigation = {
    canGoBack: false,
    addEventListener(type, listener) {
      listeners.push({ type, listener });
    },
    removeEventListener() {}
  };
  const navigate = (navigationType) => {
    let cancelled = false;
    const event = { navigationType, cancelable: true, preventDefault() { cancelled = true; } };
    listeners.filter((entry) => entry.type === 'navigate').forEach((entry) => entry.listener(event));
    return cancelled;
  };
  const page = loadTrigger({ navigation });
  assert.strictEqual(navigate('push'), false, 'the page navigates freely before any press');
  page.press('out');
  assert.strictEqual(navigate('push'), true,
    'a page that saw the press first (the trigger injected late) cannot navigate under the preview');
  assert.strictEqual(navigate('replace'), true);
  assert.strictEqual(navigate('traverse'), false, 'Back and Forward still work');
  assert.strictEqual(navigate('reload'), false, 'reloading still works');
}

function testXPostLoadsPastServiceWorker() {
  assert.strictEqual(toPreviewFrameUrl('https://x.com/__oQuery/status/2113594440686453210'),
    'https://x.com/i/web/status/2113594440686453210',
    'an X post loads through the address X\'s service worker leaves to the network');
  assert.strictEqual(toPreviewFrameUrl('https://twitter.com/a_b/status/42/photo/1'), 'https://x.com/i/web/status/42');
  assert.strictEqual(toPreviewFrameUrl('https://x.com/a_b'), 'https://x.com/a_b', 'other X pages load as they are');
  assert.strictEqual(toPreviewFrameUrl('https://x.com/i/web/status/42'), 'https://x.com/i/web/status/42');
  assert.strictEqual(toPreviewFrameUrl('https://example.com/a/status/42'), 'https://example.com/a/status/42');
}

// Storage areas holding the given values, with the change event a test can
// fire as Chrome would.
function createTriggerStorage(values) {
  const changeListeners = [];
  const area = (name) => ({
    get(keys, callback) {
      const result = {};
      keys.forEach((key) => {
        if (Object.hasOwn(values[name] || {}, key)) {
          result[key] = values[name][key];
        }
      });
      callback(result);
    }
  });
  return {
    sync: area('sync'),
    local: area('local'),
    onChanged: {
      addListener: (listener) => changeListeners.push(listener),
      removeListener() {}
    },
    change(areaName, key, newValue) {
      changeListeners.forEach((listener) => listener({ [key]: { newValue } }, areaName));
    }
  };
}

async function testSwitchTurnsTriggerOff() {
  const ENABLED_KEY = settings.linkPreviewEnabled.key;
  const storage = createTriggerStorage({ sync: { [ENABLED_KEY]: false } });
  const page = loadTrigger({ storage });
  await flush();
  assert.deepStrictEqual(page.press('out'), [], 'with the switch off a Shift+click keeps Chrome\'s own behavior');
  assert.deepStrictEqual(page.sent, []);
  assert.deepStrictEqual(page.claimed, [], 'and the page still sees the press');
  storage.change('sync', ENABLED_KEY, true);
  assert.deepStrictEqual(page.press('out'), ['mousedown', 'click'], 'turning the switch on takes effect without a reload');

  const localPrimary = createTriggerStorage({
    sync: { [ENABLED_KEY]: true },
    local: { [ENABLED_KEY]: false, [settings.localPrimary.key]: true }
  });
  const localPage = loadTrigger({ storage: localPrimary });
  await flush();
  assert.deepStrictEqual(localPage.press('out'), [],
    'when settings stay local, the local value decides');
  assert.strictEqual(settings.linkPreviewEnabled.parse(undefined), true, 'link preview is on until turned off');
}

function testPreviewFrameReportsIn() {
  const dom = new JSDOM('<!doctype html><body><iframe name="lumno-link-preview"></iframe></body>', {
    runScripts: 'outside-only',
    url: 'https://docs.example.test/page'
  });
  const parentMessages = [];
  dom.window.postMessage = (message) => parentMessages.push(message);
  const frameWindow = dom.window.document.querySelector('iframe').contentWindow;
  // JSDOM does not carry the frame's name attribute into its window.
  frameWindow.name = 'lumno-link-preview';
  const sent = [];
  frameWindow.chrome = { runtime: { id: TEST_EXTENSION_ID, lastError: null, sendMessage: (message) => sent.push(message) } };
  frameWindow.eval(moduleScript('src/content/link-preview-trigger.ts'));
  frameWindow.dispatchEvent(new frameWindow.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.strictEqual(parentMessages[0].source, 'lumno-link-preview-frame');
  assert.strictEqual(parentMessages[0].type, 'alive',
    'a page that loads in the preview reports in, so a refused one can be told apart');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(sent)), [{ action: 'linkPreviewFrameCommitted' }],
    'a preview frame reports its page to the background and starts no previews of its own');
  const fromSurface = (source, data) => frameWindow.dispatchEvent(new frameWindow.MessageEvent('message', { source, data }));
  fromSurface(dom.window, { source: 'lumno-link-preview-surface', type: 'bind', secret: 'abc' });
  fromSurface(frameWindow, { source: 'lumno-link-preview-surface', type: 'bind', secret: 'page' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(sent.slice(1))), [{ action: 'linkPreviewFrameBind', secret: 'abc' }],
    'the frame passes on the secret only from the surface above it');
  const contained = Array.from(frameWindow.document.querySelectorAll('style'))
    .some((style) => /:root\s*\{\s*overscroll-behavior:\s*contain/.test(style.textContent));
  assert.ok(contained,
    'scrolling past the previewed page\'s edge must not chain to the page under the preview');
  const styles = Array.from(frameWindow.document.querySelectorAll('style')).map((style) => style.textContent).join('\n');
  assert.ok(/::-webkit-scrollbar-track\s*\{[^}]*margin:\s*\d+px/.test(styles),
    'the previewed page\'s scrollbar stops short of the window\'s rounded corners');
  assert.ok(/scrollbar-width:\s*auto/.test(styles) && /scrollbar-width:\s*thin/.test(styles),
    'Chromium draws the scrollbar parts, other browsers a thin standard bar');
}

function testShiftClickInsidePreviewStaysInPreview() {
  const virtualConsole = new VirtualConsole();
  const notImplemented = [];
  virtualConsole.on('jsdomError', (error) => notImplemented.push(String(error.message)));
  const dom = new JSDOM('<!doctype html><body><iframe name="lumno-link-preview"></iframe></body>', {
    runScripts: 'outside-only',
    url: 'https://docs.example.test/page',
    virtualConsole
  });
  dom.window.postMessage = () => {};
  const frameWindow = dom.window.document.querySelector('iframe').contentWindow;
  frameWindow.name = 'lumno-link-preview';
  frameWindow.document.body.innerHTML = '<a id="next" href="https://docs.example.test/next">next</a>';
  const sent = [];
  frameWindow.chrome = { runtime: { id: TEST_EXTENSION_ID, lastError: null, sendMessage: (message) => sent.push(message) } };
  const listeners = [];
  const originalAdd = frameWindow.addEventListener.bind(frameWindow);
  frameWindow.addEventListener = (type, listener, options) => {
    listeners.push({ type, listener });
    originalAdd(type, listener, options);
  };
  frameWindow.eval(moduleScript('src/content/link-preview-trigger.ts'));
  const target = frameWindow.document.getElementById('next');
  const prevented = [];
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
    const event = {
      type,
      isTrusted: true,
      button: 0,
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target,
      composedPath: () => [target, frameWindow.document.body, frameWindow.document.documentElement, frameWindow.document, frameWindow],
      preventDefault() {
        prevented.push(type);
      },
      stopImmediatePropagation() {}
    };
    listeners.filter((entry) => entry.type === type).forEach((entry) => entry.listener(event));
  });
  assert.deepStrictEqual(prevented, ['mousedown', 'click'], 'Chrome does not open a new window for it');
  assert.deepStrictEqual(sent.filter((message) => message.action !== 'linkPreviewFrameCommitted'), [],
    'no second preview starts from inside the preview');
  assert.ok(notImplemented.some((message) => /navigation/i.test(message)),
    'Shift+click on a link inside the preview opens it in the preview, where Back returns');
}

async function testPreviewFrameReportsBackground() {
  const dom = new JSDOM('<!doctype html><body><iframe name="lumno-link-preview"></iframe></body>', {
    runScripts: 'outside-only',
    url: 'https://docs.example.test/page'
  });
  const parentMessages = [];
  dom.window.postMessage = (message) => parentMessages.push(message);
  const frameWindow = dom.window.document.querySelector('iframe').contentWindow;
  frameWindow.name = 'lumno-link-preview';
  frameWindow.chrome = { runtime: { id: TEST_EXTENSION_ID, lastError: null, sendMessage() {} } };
  frameWindow.document.body.style.backgroundColor = 'rgb(13, 17, 23)';
  frameWindow.eval(moduleScript('src/content/link-preview-trigger.ts'));
  const backgrounds = () => parentMessages.filter((message) => message.type === 'background').map((message) => message.color);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await wait(320);
  assert.deepStrictEqual(backgrounds(), ['rgb(13, 17, 23)'],
    'the preview window takes the page\'s background, so its corners and scrollbar track show no seam');
  frameWindow.document.body.style.backgroundColor = 'rgb(0, 0, 0)';
  await wait(60);
  frameWindow.document.body.style.backgroundColor = 'rgb(255, 255, 255)';
  await wait(320);
  assert.deepStrictEqual(backgrounds(), ['rgb(13, 17, 23)', 'rgb(255, 255, 255)'],
    'a page that switches theme reports where it settles, not a color it passes through (X starts black)');
}

async function testPreviewFrameEscape() {
  const dom = new JSDOM('<!doctype html><body><iframe name="lumno-link-preview"></iframe></body>', {
    runScripts: 'outside-only',
    url: 'https://docs.example.test/page'
  });
  const parentMessages = [];
  dom.window.postMessage = (message) => parentMessages.push(message);
  const frameWindow = dom.window.document.querySelector('iframe').contentWindow;
  frameWindow.name = 'lumno-link-preview';
  frameWindow.chrome = { runtime: { id: TEST_EXTENSION_ID, lastError: null, sendMessage() {} } };
  const keydownListeners = [];
  const originalAdd = frameWindow.addEventListener.bind(frameWindow);
  frameWindow.addEventListener = (type, listener, options) => {
    if (type === 'keydown') {
      keydownListeners.push(listener);
    }
    originalAdd(type, listener, options);
  };
  frameWindow.eval(moduleScript('src/content/link-preview-trigger.ts'));
  // JSDOM events are untrusted, so the press is handed to the listener as
  // the page leaves it: here the page prevents every Escape.
  const pressEscape = () => {
    const event = { key: 'Escape', isTrusted: true, defaultPrevented: true };
    keydownListeners.forEach((listener) => listener(event));
    return new Promise((resolve) => setTimeout(resolve, 5));
  };
  const escapes = () => parentMessages.filter((message) => message.type === 'escape').length;
  await pressEscape();
  assert.strictEqual(escapes(), 1, 'a page that claims Escape for itself must not keep the preview open');
  const dialog = frameWindow.document.createElement('dialog');
  dialog.setAttribute('open', '');
  dialog.getClientRects = () => [{}];
  frameWindow.document.body.append(dialog);
  await pressEscape();
  assert.strictEqual(escapes(), 1, 'Escape that closes an open modal of the page stays with the page');
}

(async () => {
  await testRuleScope();
  await testPrepareThenOpen();
  await testHoverPrepareWaitsForPressToCapture();
  await testUnclaimedPrepareExpires();
  await testMissingSurfaceOpensTab();
  await testFrameLoadWhileOpeningKeepsPreview();
  await testRefusedScreenshotTravelsWithShow();
  await testFailedShowOpensNoTab();
  await testOpenPreviewDroppedWhenSurfaceGone();
  await testReconcileDropsRulesWithoutPreview();
  await testWorkerRuleOutlivesOnePreview();
  await testOlderChromeDropsWholeCsp();
  await testRuleIdsStayInRange();
  await testRulesNameThePreviewedSite();
  await testOnlyThePreviewFrameMovesTheRule();
  await testRefusedPageTriesAgainForItsRedirect();
  await testRedirectAllowsItsDomainAtOnce();
  await testReleasedPressCancels();
  await testOpenPreviewOutlivesWorker();
  testShiftClickOpensPreview();
  testOrphanedTriggerStepsAside();
  await testPressReleasedElsewhereCancels();
  await testShiftHoverPrewarms();
  await testShiftHoverCancels();
  testOtherPressesKeepDefault();
  testShownAddressOpensPreview();
  testPostOpensPreview();
  testPageNavigationAfterPressCancelled();
  testXPostLoadsPastServiceWorker();
  await testSwitchTurnsTriggerOff();
  testPreviewFrameReportsIn();
  testShiftClickInsidePreviewStaysInPreview();
  await testPreviewFrameReportsBackground();
  await testPreviewFrameEscape();
  console.log('link preview tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
