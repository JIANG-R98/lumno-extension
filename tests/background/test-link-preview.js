const assert = require('assert');
const { JSDOM } = require('jsdom');
const { moduleScript } = require('../helpers/module-script');
const linkPreview = require('../../src/background/link-preview.js');

// The link preview: the background service that prepares and opens a
// preview for a tab, and the content script that turns Shift+click on a link
// into one.

const flush = () => new Promise((resolve) => setImmediate(resolve));

function createChromeMock(options) {
  const config = options || {};
  const calls = { rules: [], captures: 0, injected: [], sent: [], created: [] };
  const sessionRules = new Map();
  const chromeApi = {
    runtime: { lastError: null },
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
    scripting: {
      executeScript(injection, callback) {
        calls.injected.push(injection);
        callback([{ result: undefined }]);
      }
    }
  };
  return { chromeApi, calls, sessionRules };
}

async function testRuleScope() {
  const rule = linkPreview.buildFrameHeaderRule(7);
  assert.strictEqual(rule.id, 7);
  assert.deepStrictEqual(rule.condition, { tabIds: [7], resourceTypes: ['sub_frame'] },
    'header removal must stay limited to subframes of the previewing tab');
  assert.deepStrictEqual(rule.action.responseHeaders.map((entry) => entry.header),
    ['x-frame-options', 'content-security-policy']);
  assert.ok(linkPreview.isPreviewableUrl('https://example.com/a'));
  assert.ok(!linkPreview.isPreviewableUrl('javascript:alert(1)'));
  assert.ok(!linkPreview.isPreviewableUrl('chrome://settings'));
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
  assert.ok(sessionRules.has(3), 'the tab may frame refusing pages while its preview is open');
  const actions = calls.sent.map((entry) => entry.message.action);
  assert.deepStrictEqual(actions, ['lumnoLinkPreviewPrewarm', 'lumnoLinkPreviewScreenshot', 'lumnoLinkPreviewShow']);
  assert.strictEqual(calls.sent[1].message.screenshot, 'data:image/jpeg;base64,AAAA',
    'the screenshot reaches the surface before the click, to be decoded while the button is down');
  const show = calls.sent[2].message;
  assert.strictEqual(show.screenshot, '', 'a delivered screenshot is not sent twice');
  assert.deepStrictEqual(show.origin, { x: 10, y: 20 });
  assert.strictEqual(show.token, calls.sent[0].message.token);

  await service.discard(3, 'stale-token');
  assert.ok(sessionRules.has(3), 'a close from a replaced preview must not drop the open one');
  await service.discard(3, show.token);
  assert.ok(!sessionRules.has(3), 'closing the preview removes the header rule');
}

async function testUnclaimedPrepareExpires() {
  const { chromeApi, sessionRules } = createChromeMock();
  const timers = [];
  const service = linkPreviewService(chromeApi, timers);
  service.prepare({ id: 4, windowId: 1 }, 'https://example.com/b');
  await flush();
  assert.ok(sessionRules.has(4));
  timers.forEach((timer) => timer.fn());
  await flush();
  assert.ok(!sessionRules.has(4), 'a press the page kept must not leave the header rule behind');
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
  assert.ok(!sessionRules.has(5));
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
  assert.ok(sessionRules.has(6), 'the opening preview keeps its header rule');
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
  assert.ok(sessionRules.has(9), 'a surface still showing the preview keeps the rule');
  surfaceToken = null;
  await service.handleTabUpdated(9, { status: 'complete' });
  assert.ok(!sessionRules.has(9), 'a navigation that took the surface away drops the rule');
}

async function testReconcileDropsRulesWithoutPreview() {
  const { chromeApi, sessionRules } = createChromeMock({
    respond: (message) => (message.action === 'lumnoLinkPreviewPing' ? { token: '' } : true)
  });
  sessionRules.set(8, linkPreview.buildFrameHeaderRule(8));
  const service = linkPreview.createLinkPreviewService({ chromeApi });
  await service.reconcileRules();
  assert.ok(!sessionRules.has(8), 'a rule whose preview is gone is removed when the worker wakes');
}

function loadTrigger(options) {
  const config = options || {};
  const dom = new JSDOM(`<!doctype html><body>
    <a id="out" href="https://other.example/page">out</a>
    <a id="hash" href="#section">hash</a>
    <a id="file" href="https://other.example/file.zip" download>file</a>
    <a id="mail" href="mailto:a@example.com">mail</a>
  </body>`, { runScripts: 'outside-only', url: 'https://docs.example.test/page' });
  const { window } = dom;
  const sent = [];
  const listeners = [];
  const originalAdd = window.addEventListener.bind(window);
  window.addEventListener = (type, listener, listenerOptions) => {
    listeners.push({ type, listener });
    originalAdd(type, listener, listenerOptions);
  };
  if (config.name) {
    window.name = config.name;
  }
  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        sent.push(message);
        if (typeof callback === 'function') {
          callback();
        }
      }
    }
  };
  window.eval(moduleScript('src/content/link-preview-trigger.js'));
  // The events of one press, in Chrome's order. Returns the types whose
  // default was prevented; `claimed` collects the types kept from the page.
  const claimed = [];
  function press(id, eventOptions) {
    const target = window.document.getElementById(id);
    const prevented = [];
    claimed.length = 0;
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
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
        composedPath: () => [target, window.document.body, window.document.documentElement, window.document, window],
        preventDefault() {
          prevented.push(type);
        },
        stopImmediatePropagation() {
          claimed.push(type);
        }
      }, eventOptions || {});
      listeners.filter((entry) => entry.type === type).forEach((entry) => entry.listener(event));
    });
    return prevented;
  }
  return { window, sent, press, claimed };
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

// Storage areas holding the given values, with the change event a test can
// fire as Chrome would.
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
  frameWindow.chrome = { runtime: { lastError: null, sendMessage: (message) => sent.push(message) } };
  frameWindow.eval(moduleScript('src/content/link-preview-trigger.js'));
  frameWindow.dispatchEvent(new frameWindow.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.strictEqual(parentMessages[0].source, 'lumno-link-preview-frame');
  assert.strictEqual(parentMessages[0].type, 'alive',
    'a page that loads in the preview reports in, so a refused one can be told apart');
  assert.deepStrictEqual(sent, [], 'a preview frame does not start previews of its own');
  const contained = Array.from(frameWindow.document.querySelectorAll('style'))
    .some((style) => /:root\s*\{\s*overscroll-behavior:\s*contain/.test(style.textContent));
  assert.ok(contained,
    'scrolling past the previewed page\'s edge must not chain to the page under the preview');
  const thinScrollbar = Array.from(frameWindow.document.querySelectorAll('style'))
    .some((style) => /scrollbar-width:\s*thin/.test(style.textContent));
  assert.ok(thinScrollbar, 'the previewed page shows a thin scrollbar, not a classic bar beside the window');
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
  frameWindow.chrome = { runtime: { lastError: null, sendMessage() {} } };
  const keydownListeners = [];
  const originalAdd = frameWindow.addEventListener.bind(frameWindow);
  frameWindow.addEventListener = (type, listener, options) => {
    if (type === 'keydown') {
      keydownListeners.push(listener);
    }
    originalAdd(type, listener, options);
  };
  frameWindow.eval(moduleScript('src/content/link-preview-trigger.js'));
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
  await testUnclaimedPrepareExpires();
  await testMissingSurfaceOpensTab();
  await testFrameLoadWhileOpeningKeepsPreview();
  await testRefusedScreenshotTravelsWithShow();
  await testFailedShowOpensNoTab();
  await testOpenPreviewDroppedWhenSurfaceGone();
  await testReconcileDropsRulesWithoutPreview();
  testShiftClickOpensPreview();
  testOtherPressesKeepDefault();
  testPreviewFrameReportsIn();
  await testPreviewFrameEscape();
  console.log('link preview tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
