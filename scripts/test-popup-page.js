const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const html = fs.readFileSync('src/popup/popup.html', 'utf8');
const source = fs.readFileSync('src/popup/popup.js', 'utf8');
const backgroundSource = fs.readFileSync('src/background/background.js', 'utf8');

assert.strictEqual(manifest.action.default_popup, 'src/popup/popup.html');
assert(html.includes('data-react-entry="../react/popup-islands.js"'));
assert(html.includes('data-page-entry="../popup/popup.js"'));
assert(backgroundSource.includes("'getPinnedRecentToolbarState'"));
assert(backgroundSource.includes("'updatePinnedRecentFromToolbar'"));
assert(backgroundSource.includes("'linkPinnedRecentFromToolbar'"));
assert(backgroundSource.includes("'openDocumentPipFromToolbar'"));
assert(!backgroundSource.includes("chrome.action.onClicked.addListener"));

const calls = [];
let lastModel = null;
let closeCalls = 0;
let toolbarState = {
  ok: true,
  status: 'update-available',
  page: { tabId: 7, title: 'Episode 2', url: 'https://example.com/?p=2' },
  linkedCard: { cardId: 'card-7', title: 'Episode 1', url: 'https://example.com/?p=1' },
  canUpdate: true,
  updateGuard: { cardId: 'card-7', sourceUrl: 'https://example.com/?p=1', pageUrl: 'https://example.com/?p=2' },
  undo: { available: true, expectedUrl: 'https://example.com/?p=1' }
};

const context = {
  console,
  document: { getElementById: () => ({}) },
  window: { close: () => { closeCalls += 1; } },
  LumnoPopupReact: {
    createPopupController: () => ({ render: (model) => { lastModel = model; } })
  },
  chrome: {
    i18n: { getMessage: () => '' },
    tabs: { query: (_query, callback) => callback([{ id: 7 }]) },
    runtime: {
      lastError: null,
      getURL: (path) => `chrome-extension://test${path}`,
      sendMessage(message, callback) {
        calls.push(message);
        if (message.action === 'getPinnedRecentToolbarState') callback(toolbarState);
        else if (message.action === 'updatePinnedRecentFromToolbar') {
          toolbarState = {
            ...toolbarState,
            status: 'up-to-date',
            canUpdate: false,
            linkedCard: { cardId: 'card-7', title: 'Episode 2', url: 'https://example.com/?p=2' },
            undo: { available: true, expectedUrl: 'https://example.com/?p=2' }
          };
          callback({ ok: true });
        } else if (message.action === 'undoPinnedRecentTrackingUpdate') {
          toolbarState = { ...toolbarState, undo: { available: false, expectedUrl: '' } };
          callback({ ok: true });
        } else if (message.action === 'openDocumentPipFromToolbar') {
          callback({ ok: false, reason: 'injection-failed' });
        } else callback({ ok: true });
      }
    }
  }
};

vm.runInNewContext(source, context, { filename: 'src/popup/popup.js' });

setImmediate(async () => {
  assert.strictEqual(lastModel.status, 'update-available');
  assert.strictEqual(lastModel.canUndo, false, 'undo stays hidden until this popup performs an update');
  await lastModel.onUpdate();
  assert(calls.some((call) => call.action === 'updatePinnedRecentFromToolbar' &&
    call.guard.cardId === 'card-7'));
  assert.strictEqual(lastModel.status, 'up-to-date');
  assert.strictEqual(lastModel.canUndo, true);
  await lastModel.onUndo();
  assert(calls.some((call) => call.action === 'undoPinnedRecentTrackingUpdate' &&
    call.expectedUrl === 'https://example.com/?p=2'));
  await lastModel.onClip();
  assert(calls.some((call) => call.action === 'openDocumentPipFromToolbar' && call.tabId === 7));
  assert.strictEqual(closeCalls, 0);
  await lastModel.onOpenSettings();
  assert(calls.some((call) => call.action === 'openOptionsPage' && !call.hash));
  assert.strictEqual(closeCalls, 1);
  console.log('popup page tests passed');
});
