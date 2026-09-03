const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const html = fs.readFileSync('src/popup/popup.html', 'utf8');
const source = fs.readFileSync('src/popup/popup.js', 'utf8');
const style = fs.readFileSync('src/popup/popup.css', 'utf8');
const backgroundSource = fs.readFileSync('src/background/background.js', 'utf8');
const extensionPageRoutes = backgroundSource.slice(
  backgroundSource.indexOf('extensionPages: {'),
  backgroundSource.indexOf('handler: handleExtensionPageMessage')
);

assert.strictEqual(manifest.action.default_popup, 'src/popup/popup.html');
assert(html.includes('data-react-entry="../react/popup-islands.js"'));
assert(html.includes('data-page-entry="../popup/popup.js"'));
assert(backgroundSource.includes("'getPinnedRecentToolbarState'"));
assert(backgroundSource.includes("'updatePinnedRecentFromToolbar'"));
assert(backgroundSource.includes("'linkPinnedRecentFromToolbar'"));
assert(backgroundSource.includes("'undoPinnedRecentTrackingLink'"));
assert(
  extensionPageRoutes.includes("'undoPinnedRecentTrackingLink'"),
  'the popup link-undo message must be registered before it can reach its background handler'
);
assert(source.includes("kind: 'link', guard: result.undoGuard"));
assert(backgroundSource.includes("'openDocumentPipFromToolbar'"));
assert(!backgroundSource.includes("chrome.action.onClicked.addListener"));
assert(/\.popup-header-button[^}]*background:linear-gradient/.test(style));
assert(/\.popup-header-actions[^}]*gap:8px/.test(style));
assert(/\.popup-shell\[data-status="unsupported"\][^}]*min-height:0/.test(style));
assert(/\.popup-shell\[data-status="unsupported"\] \.popup-content[^}]*display:none/.test(style));
assert(/\.popup-confetti i[^}]*animation:popup-confetti-fall/.test(style));
assert(/@keyframes popup-confetti-fall/.test(style));
assert(/\.popup-update-diff-card[^}]*height:184px/.test(style));
assert(/\.popup-update-diff-card\[data-phase="confirmed"\] \.popup-diff-row--old[^}]*opacity:0/.test(style));
assert(/\.popup-diff-stack[^}]*gap:6px/.test(style));
assert(/\.popup-notice[^}]*position:absolute[^}]*animation:popup-notice-drop/.test(style));
assert(/\.popup-notice[^}]*animation:popup-notice-drop 3s/.test(style));
assert(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.popup-notice\[data-visible="true"\][^}]*animation:none/.test(style));
assert(/\.popup-button--warning[^}]*background:linear-gradient/.test(style));

const calls = [];
let lastModel = null;
const renderedModels = [];
let closeCalls = 0;
const pendingTimers = [];
let toolbarState = {
  ok: true,
  status: 'update-available',
  page: { tabId: 7, title: 'Episode 2', url: 'https://example.com/?p=2' },
  linkedCard: { cardId: 'card-7', title: 'Episode 1', url: 'https://example.com/?p=1' },
  canUpdate: true,
  updateGuard: { cardId: 'card-7', sourceUrl: 'https://example.com/?p=1', pageUrl: 'https://example.com/?p=2' },
  undo: { available: false, expectedUrl: '' }
};

const context = {
  console,
  document: { getElementById: () => ({}) },
  window: {
    close: () => { closeCalls += 1; },
    setTimeout(callback, delay) {
      if (delay < 3000) {
        callback();
        return 0;
      }
      pendingTimers.push({ callback, delay, noticeAtSchedule: lastModel && lastModel.notice });
      return pendingTimers.length;
    },
    clearTimeout(timerId) {
      if (timerId > 0 && pendingTimers[timerId - 1]) pendingTimers[timerId - 1] = null;
    }
  },
  LumnoPopupReact: {
    createPopupController: () => ({ render: (model) => { lastModel = model; renderedModels.push(model); } })
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
  assert.strictEqual(lastModel.notice.celebrate, true);
  const dismissTimer = pendingTimers.find((timer) => timer && timer.delay === 3000);
  assert(dismissTimer, 'operation feedback should schedule dismissal after three seconds');
  assert(dismissTimer.noticeAtSchedule && dismissTimer.noticeAtSchedule.celebrate,
    'the three-second countdown should begin only after operation feedback is rendered');
  dismissTimer.callback();
  assert.strictEqual(lastModel.notice, null, 'operation feedback should disappear after three seconds');
  assert(renderedModels.some((model) => model.comparison && model.comparison.phase === 'confirmed'));
  const exitingModel = renderedModels.find((model) => model.comparison && model.comparison.phase === 'exiting');
  assert(exitingModel, 'the completed comparison should crossfade into the final linked card');
  assert.strictEqual(exitingModel.busy, 'update',
    'popup actions should stay locked until the final-card crossfade completes');
  assert.strictEqual(lastModel.comparison, null,
    'the final linked card should replace the comparison only after its exit phase');
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
