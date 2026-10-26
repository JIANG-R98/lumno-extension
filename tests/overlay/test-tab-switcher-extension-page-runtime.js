const assert = require('assert');
const { JSDOM } = require('jsdom');
const { moduleScript } = require('../helpers/module-script');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  runScripts: 'outside-only',
  url: 'chrome-extension://lumno/src/options/options.html'
});
const { window } = dom;
let createViewCalls = 0;
let latestViewOptions = null;
const runtimeMessages = [];
let runtimeMessageListener = null;
let cardClickEvents = 0;
const keyupListeners = new Set();
const nativeAddEventListener = window.addEventListener.bind(window);
const nativeRemoveEventListener = window.removeEventListener.bind(window);

window.addEventListener = (type, listener, options) => {
  if (type === 'keyup') {
    keyupListeners.add(listener);
  }
  return nativeAddEventListener(type, listener, options);
};
window.removeEventListener = (type, listener, options) => {
  if (type === 'keyup') {
    keyupListeners.delete(listener);
  }
  return nativeRemoveEventListener(type, listener, options);
};

window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {}
});
window.requestAnimationFrame = (callback) => {
  callback(0);
  return 1;
};
window.cancelAnimationFrame = () => {};
window.chrome = {
  i18n: {
    getMessage() {
      return '';
    }
  },
  runtime: {
    getURL: (relativePath) => `chrome-extension://lumno/${relativePath}`,
    onMessage: {
      addListener(listener) {
        runtimeMessageListener = listener;
      },
      removeListener(listener) {
        if (runtimeMessageListener === listener) {
          runtimeMessageListener = null;
        }
      }
    },
    sendMessage(message, callback) {
      runtimeMessages.push(message);
      callback?.();
    }
  },
  storage: {
    onChanged: {
      addListener() {},
      removeListener() {}
    },
    sync: {
      get(_keys, callback) {
        callback({});
      }
    }
  }
};

// Extension pages load settings.ts before the tab switcher runtime.
window.eval(moduleScript('src/domain/settings/index.ts', 'LumnoSettings'));
window.eval(moduleScript('src/shared/ui/toast.ts', 'LumnoToast'));
window.eval(moduleScript('src/shared/page-color-scheme.ts', 'LumnoPageColorScheme'));
const tabSwitcherViewStub = {
  createTabSwitcherView(options) {
    createViewCalls += 1;
    latestViewOptions = options;
    const panel = window.document.createElement('div');
    panel.id = options.panelId;
    const buttons = options.tabs.map((_tab, index) => {
      const button = window.document.createElement('button');
      button.className = 'x-tab-switcher-card';
      button.addEventListener('click', (event) => {
        cardClickEvents += 1;
        options.onActivate(index, event);
      });
      panel.appendChild(button);
      return button;
    });
    options.root.appendChild(panel);
    return {
      panel,
      buttons,
      destroy() {},
      setTheme(theme) {
        panel.setAttribute('data-theme', theme);
      },
      updateSelection() {},
      updateThumbnail() {
        return { ok: true };
      }
    };
  }
};
// The switcher draws through this stand-in for its React view.
window.LumnoTabSwitcherViewModule = { createTabSwitcherView: (options) => tabSwitcherViewStub.createTabSwitcherView(options) };
window.eval(moduleScript('src/shared/tab-switcher/tab-switcher.ts', 'LumnoTabSwitcher', null, {
  'src/shared/react/tab-switcher.tsx': 'LumnoTabSwitcherViewModule'
}));

const readyResult =
  window.LumnoTabSwitcher.toggleTabSwitcher({
    tabs: [
      { id: 1, title: 'After React' },
      { id: 2, title: 'Custom shortcut target' }
    ],
    shortcut: 'Command+1',
    suppressInitialShortcutAdvance: true
  });
assert.deepStrictEqual(
  { ...readyResult },
  { ok: true },
  'the runtime should resolve a React API installed after the switcher script loaded'
);
assert.strictEqual(createViewCalls, 1);
const switcherHost = window.document.getElementById(
  '_x_extension_tab_switcher_host_2026_unique_'
);
assert.ok(
  switcherHost,
  'the extension page should mount the switcher after React becomes ready'
);
assert.strictEqual(
  switcherHost.shadowRoot,
  null,
  'the page must not be able to traverse the tab switcher Shadow DOM'
);

const switcherCard = latestViewOptions.root.querySelector('.x-tab-switcher-card');
switcherCard.dispatchEvent(new window.MouseEvent('pointerdown', {
  bubbles: true,
  composed: true
}));
assert.ok(
  switcherHost.isConnected,
  'pointerdown inside the closed tab switcher must not be treated as an outside click'
);

switcherCard.click();
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
window.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'Alt' }));
assert.deepStrictEqual(
  runtimeMessages,
  [],
  'synthetic clicks and global keyboard events must not request a privileged tab switch'
);
assert.ok(
  switcherHost.isConnected,
  'rejected synthetic events must leave the switcher available for real input'
);

switcherHost._lumnoTabSwitcherAdvance(1);
const clickEventsBeforeRelease = cardClickEvents;
const shortcutKeyupListener = Array.from(keyupListeners).at(-1);
assert.strictEqual(typeof shortcutKeyupListener, 'function');
const trustedShortcutKeyupEvent = (key, code) => ({
  isTrusted: true,
  key,
  code,
  preventDefault() {},
  stopImmediatePropagation() {},
  stopPropagation() {}
});
shortcutKeyupListener(trustedShortcutKeyupEvent('1', 'Digit1'));
assert.strictEqual(
  cardClickEvents,
  clickEventsBeforeRelease,
  'releasing the custom trigger key must not commit while Command is still the hold modifier'
);
assert.ok(
  switcherHost.isConnected,
  'the switcher should remain open until the primary modifier is released'
);
shortcutKeyupListener(trustedShortcutKeyupEvent('Meta', 'MetaLeft'));
assert.strictEqual(
  cardClickEvents,
  clickEventsBeforeRelease + 1,
  'releasing Command should dispatch exactly one guarded click on the highlighted card'
);
assert.deepStrictEqual(
  runtimeMessages.map((message) => ({ ...message })),
  [{ action: 'switchToTab', tabId: 2, windowId: null }],
  'releasing Command should activate the highlighted tab'
);
assert.strictEqual(
  switcherHost.isConnected,
  false,
  'the switcher should close after Command release commits the selection'
);

runtimeMessages.length = 0;
window.LumnoTabSwitcher.toggleTabSwitcher({
  tabs: [
    { id: 1, title: 'Relay source' },
    { id: 2, title: 'Relay target' }
  ],
  shortcut: 'Command+1'
});
const relayedSwitcherHost = window.document.getElementById(
  '_x_extension_tab_switcher_host_2026_unique_'
);
relayedSwitcherHost._lumnoTabSwitcherAdvance(1);
const clickEventsBeforeRelayedRelease = cardClickEvents;
let releaseCommitResponse = null;
runtimeMessageListener({
  action: 'commitOpenTabSwitcherFromShortcutRelease'
}, {}, (response) => {
  releaseCommitResponse = response;
});
assert.deepStrictEqual(
  { ...releaseCommitResponse },
  { ok: true, committed: true },
  'a relayed Command release must commit an open switcher even when the original keyup reached another tab'
);
assert.strictEqual(
  cardClickEvents,
  clickEventsBeforeRelayedRelease + 1,
  'the relayed release should dispatch exactly one guarded click on the highlighted card'
);
assert.deepStrictEqual(
  runtimeMessages.map((message) => ({ ...message })),
  [{ action: 'switchToTab', tabId: 2, windowId: null }],
  'the relayed Command release must activate the highlighted tab'
);
assert.strictEqual(
  relayedSwitcherHost.isConnected,
  false,
  'a committed custom shortcut selection should close the switcher'
);

runtimeMessages.length = 0;
window.LumnoTabSwitcher.toggleTabSwitcher({
  tabs: [{ id: 1, title: 'Trusted pointer target' }],
  shortcut: 'Alt+Q'
});

latestViewOptions.onActivate(0, {
  isTrusted: true,
  preventDefault() {},
  stopImmediatePropagation() {},
  stopPropagation() {}
});
assert.deepStrictEqual(
  runtimeMessages.map((message) => ({ ...message })),
  [{ action: 'switchToTab', tabId: 1, windowId: null }],
  'a trusted activation must preserve the normal privileged switch path'
);

dom.window.close();
console.log('tab switcher extension-page runtime tests passed');
