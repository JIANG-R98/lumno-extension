const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { loadBackground, wait } = require('./helpers/background-harness');

const ACTION = 'lumno:newtab-toggle-search-overlay';
const source = fs.readFileSync('src/newtab/search-overlay.js', 'utf8');

function bootPage(options = {}) {
  const dom = new JSDOM('<input id="search" value="draft"><button id="other">Other</button>', {
    url: 'chrome-extension://abc/newtab.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const win = dom.window;
  const tab = { id: 7, active: true };
  const listeners = [];
  const loaded = [];
  const toggles = [];
  let now = 1000;
  let failScript = options.failScript || '';
  win.Date.now = () => now;
  win.console.warn = () => {};
  win.chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://abc/${path}`,
      onMessage: { addListener: (listener) => listeners.push(listener) },
      sendMessage(request, callback) {
        callback(request.action === 'getShowSearchShortcut'
          ? { shortcut: options.shortcut === undefined ? 'Ctrl+Shift+K' : options.shortcut }
          : { tabs: [{ id: 12, url: 'https://example.com/' }] });
      }
    },
    tabs: {
      getCurrent: (callback) => callback({ ...tab }),
      getZoom: (_tabId, callback) => callback(1.25)
    }
  };
  win.document.head.appendChild = (script) => {
    loaded.push(script.src);
    if (options.onLoad) options.onLoad(tab);
    if (failScript && script.src.endsWith(failScript)) {
      failScript = '';
      script.onerror();
    } else {
      script.onload();
    }
    return script;
  };
  win._x_extension_toggleSearchOverlay_2026_unique_ = (tabs, context) => {
    toggles.push({ tabs, context });
    win._x_extension_search_overlay_open_2026_unique_ = !win._x_extension_search_overlay_open_2026_unique_;
  };
  win.eval(source);
  return {
    win, tab, loaded, toggles,
    advance() { now += 300; },
    async message(tabId) {
      const responses = [];
      listeners[0]({ action: ACTION, tabId }, {}, (value) => responses.push(value));
      await wait(5);
      return responses;
    },
    close: () => dom.window.close()
  };
}

async function testBackgroundRouting() {
  for (const url of ['chrome://newtab/', 'chrome-extension://abc/newtab.html']) {
    const harness = loadBackground({ tabs: [{ id: 7, windowId: 1, active: true, url }] });
    harness.chrome.runtime.getURL = (path) => `chrome-extension://abc/${path}`;
    harness.chrome.commands.onCommand.dispatch('show-search');
    await wait(80);
    const messages = harness.calls.filter((call) => call.name === 'runtime.sendMessage')
      .map((call) => call.args[0]);
    assert(messages.some((message) => message.action === ACTION && message.tabId === 7),
      `default shortcut should address the current New Tab: ${url}`);
    assert(!harness.calls.some((call) => call.name === 'tabs.create' || call.name === 'tabs.remove'),
      'opening search should neither create nor close a tab');
  }
}

async function testOverlayBridge() {
  const page = bootPage();
  try {
    const input = page.win.document.querySelector('input');
    input.focus();
    assert.strictEqual(page.loaded.length, 0, 'normal startup must not load the overlay');
    assert.strictEqual((await page.message(8)).length, 0, 'another visible window must not open or answer');
    assert.strictEqual(page.toggles.length, 0);
    assert.strictEqual(page.win.document.activeElement, input, 'another tab must not change input focus');
    assert.strictEqual((await page.message(7))[0].ok, true);
    assert.strictEqual(page.toggles.length, 1);
    assert.notStrictEqual(page.win.document.activeElement, input,
      'release the inline input while the overlay waits to reveal and take focus');
    assert.strictEqual(page.toggles[0].context.currentTabId, 7);
    assert.strictEqual(page.toggles[0].context.tabZoomFactor, 1.25);
    assert.strictEqual(page.toggles[0].tabs[0].id, 12);
    const loadedCount = page.loaded.length;
    await page.win.LumnoNewtabSearchOverlay.toggleSearchOverlay();
    assert.strictEqual(page.toggles.length, 1, 'the page fallback must not duplicate the browser command');
    page.advance();
    await page.message(7);
    assert.strictEqual(page.toggles.length, 2, 'the next press should toggle the existing overlay');
    assert.strictEqual(page.loaded.length, loadedCount, 'subsequent presses should reuse loaded scripts');
    page.advance();
    page.tab.active = false;
    assert.strictEqual((await page.message(7)).length, 0);
    assert.strictEqual(page.toggles.length, 2, 'a background tab must not steal focus');
  } finally { page.close(); }

  const failed = bootPage({ failScript: 'runtime.js' });
  try {
    assert.strictEqual((await failed.message(7))[0].ok, false);
    assert.strictEqual(failed.toggles.length, 0);
    assert.strictEqual((await failed.message(7))[0].ok, true, 'failed assets must be retryable');
    assert.strictEqual(failed.toggles.length, 1);
  } finally { failed.close(); }

  const switched = bootPage({ onLoad: (tab) => { tab.active = false; } });
  try {
    assert.strictEqual((await switched.message(7))[0].ok, false);
    assert.strictEqual(switched.toggles.length, 0, 'switching tabs during lazy loading must cancel opening');
  } finally { switched.close(); }

  const unavailable = bootPage();
  try {
    unavailable.win.chrome.tabs.getCurrent = () => {
      throw new Error('Extension context invalidated.');
    };
    assert.strictEqual((await unavailable.message(7)).length, 0,
      'a stale extension page must not reject its message listener or answer another tab');
    assert.strictEqual(unavailable.toggles.length, 0);
  } finally { unavailable.close(); }
}

async function testPageKeyboard() {
  for (const [shortcut, keys] of [
    ['Ctrl+Shift+K', { ctrlKey: true, shiftKey: true, key: 'K', code: 'KeyK' }],
    ['⌘⇧K', { metaKey: true, shiftKey: true, key: 'K', code: 'KeyK' }],
    ['Alt+J', { altKey: true, key: 'j', code: 'KeyJ' }],
    ['', { ctrlKey: true, shiftKey: true, key: 'K', code: 'KeyK' }]
  ]) {
    const page = bootPage({ shortcut });
    try {
      const { win } = page;
      win.eval(fs.readFileSync('src/shared/shortcut-key-matcher.js', 'utf8'));
      win.eval(fs.readFileSync('src/newtab/input-focus.js', 'utf8'));
      const input = win.document.querySelector('input');
      const focus = win.LumnoNewtabInputFocus.createInputFocus({
        pageState: { inputParts: { input }, newtabInputAutoFocusEnabled: false },
        SHORTCUT_KEY_MATCHER: win.LumnoShortcutKeyMatcher,
        toggleSearchOverlay: win.LumnoNewtabSearchOverlay.toggleSearchOverlay,
        refreshTabsIfIdle() {},
        initialNewtabInputAutoFocusReadyTask: Promise.resolve(),
        isImeCompositionEvent: (event) => event.isComposing
      });
      win.document.querySelector('button').focus();
      const event = new win.KeyboardEvent('keydown', { ...keys, cancelable: true });
      focus.handleGlobalTypingFocus(event);
      await wait(5);
      assert.strictEqual(page.toggles.length, shortcut ? 1 : 0,
        'use the configured shortcut even with auto-focus disabled; respect an unassigned shortcut');
      assert.strictEqual(event.defaultPrevented, Boolean(shortcut));
      if (shortcut) {
        focus.handleGlobalTypingFocus(new win.KeyboardEvent('keydown', { key: 'x', cancelable: true }));
        assert.strictEqual(input.value, 'draft', 'overlay typing must not alter the inline search');
        assert.notStrictEqual(win.document.activeElement, input, 'inline auto-focus must not steal overlay focus');
      }
    } finally { page.close(); }
  }
}

(async () => {
  await testBackgroundRouting();
  await testOverlayBridge();
  await testPageKeyboard();
  console.log('newtab search overlay tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
