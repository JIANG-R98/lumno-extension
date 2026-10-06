const assert = require('assert');
const fs = require('fs');
const store = require('../src/newtab/recent-sites-store.js');
const progressMatch = require('../src/shared/progress-match.js');
const progressHistory = require('../src/shared/progress-history.js');
require('../src/newtab/recent-sites-controller.js');

const PINNED_KEY = store.DEFAULT_PINNED_KEY;
const HISTORY_KEY = progressHistory.STORAGE_KEY;

// Pinned cards keep their tracking fields; other cards never gain them.
{
  const [tracked, plain] = store.normalizePinnedRecentSites([
    { url: 'https://vidhub3.top/vodplay/55357-1-2.html', title: '某剧 第2集', progressTracking: true, progressUpdatedAt: 20, progressSeenAt: 10 },
    { url: 'https://github.com/', title: 'GitHub', progressUpdatedAt: 99 }
  ]);
  assert.strictEqual(tracked.progressTracking, true);
  assert.strictEqual(tracked.progressUpdatedAt, 20);
  assert.strictEqual(tracked.progressSeenAt, 10);
  assert.strictEqual('progressTracking' in plain, false);
  assert.strictEqual('progressUpdatedAt' in plain, false);
  assert.deepStrictEqual(
    store.normalizePinnedRecentSites([{ url: '', progressTracking: true }]),
    [],
    'an invalid card stays dropped'
  );
}

function createArea(initial) {
  const data = { ...initial };
  return {
    data,
    get(keys, callback) {
      const result = {};
      keys.forEach((key) => { if (key in data) result[key] = data[key]; });
      callback(result);
    },
    set(value, callback) {
      Object.assign(data, JSON.parse(JSON.stringify(value)));
      if (callback) callback();
    }
  };
}

function createController(pinned, history, options = {}) {
  const state = {
    pinnedRecentSites: store.normalizePinnedRecentSites(pinned),
    hiddenRecentSites: [],
    recentSourceItems: [],
    recentRenderSignature: 'x',
    progressHistoryMap: progressHistory.normalizeHistoryMap(history),
    progressTrackingEnabled: options.enabled !== false
  };
  const syncArea = createArea({ [PINNED_KEY]: pinned });
  const localArea = createArea({ [HISTORY_KEY]: history });
  const toasts = [];
  const opened = [];
  let renders = 0;
  const controller = globalThis.LumnoNewtabRecentSitesController.createRecentSitesController({
    NEWTAB_CONTEXT_MENU_OPEN_VALUE: 'open',
    t: (_key, fallback) => fallback,
    showToast: (message, isError) => toasts.push({ message, isError }),
    openExternalNewTabUrl() {},
    hasShortcutForSite: () => false,
    addSiteToShortcuts() {},
    closeShortcutContextMenu() {},
    closeBookmarkContextMenu() {},
    canDismissRecentCard: () => true,
    hideCursorTooltip() {},
    hideTopActionTooltip() {},
    normalizeHost: (host) => String(host || '').toLowerCase().replace(/^www\./, ''),
    getHostFromUrl: (url) => new URL(url).hostname.replace(/^www\./, ''),
    getCanonicalPageUrlForFavicon: (url) => url,
    sanitizeDisplayText: (text) => String(text || '').trim(),
    getSiteDisplayName: (host) => host,
    shouldExcludeFromRecentSites: () => false,
    isBrowserPageRecentUrl: () => false,
    MAX_PINNED_RECENT_SITES: 3,
    NEWTAB_RECENT_STORE: store,
    recentSitesStorageArea: syncArea,
    HIDDEN_RECENT_SITES_STORAGE_KEY: '_hidden',
    renderRecentSites: () => { renders += 1; },
    PINNED_RECENT_SITES_STORAGE_KEY: PINNED_KEY,
    progressMatch,
    progressHistory,
    progressHistoryStorageArea: localArea,
    openProgressHistory: (item) => opened.push(item),
    pageState: state
  });
  return { controller, state, syncArea, localArea, toasts, opened, getRenders: () => renders };
}

const tracked = {
  url: 'https://vidhub3.top/vodplay/55357-1-3.html',
  title: '某剧 第3集',
  progressTracking: true,
  progressUpdatedAt: 300,
  progressSeenAt: 100
};
const history = {
  'vidhub3.top': [
    { url: 'https://vidhub3.top/vodplay/55357-1-2.html', title: '某剧 第2集', updatedAt: 300 },
    { url: 'https://vidhub3.top/vodplay/55357-1-1.html', title: '某剧 第1集', updatedAt: 200 }
  ]
};
const menuValues = (controller, item) => controller.getRecentContextMenuOptions({ item }).map((option) => option.value);

(async () => {
  // Badge state and menu items follow the Labs switch.
  {
    const { controller } = createController([tracked], history);
    assert.strictEqual(controller.getRecentProgressState(tracked), 'updated');
    assert.strictEqual(controller.getRecentProgressState({ ...tracked, progressSeenAt: 400 }), 'updated',
      'the pinned card, not the rendered copy, decides the state');
    assert.deepStrictEqual(menuValues(controller, tracked), ['open', 'add-shortcut', 'stop-progress', 'progress-history', 'remove']);
    assert.deepStrictEqual(menuValues(controller, { url: 'https://example.com/', title: 'Example' }),
      ['open', 'add-shortcut', 'track-progress', 'remove']);
  }
  {
    const { controller } = createController([tracked], history, { enabled: false });
    assert.strictEqual(controller.getRecentProgressState(tracked), '');
    assert.deepStrictEqual(menuValues(controller, tracked), ['open', 'add-shortcut', 'remove']);
  }

  // Opening an updated card acknowledges it.
  {
    const harness = createController([tracked], history);
    assert.strictEqual(await harness.controller.markProgressSeen(tracked), true);
    const [card] = harness.syncArea.data[PINNED_KEY];
    assert(card.progressSeenAt >= card.progressUpdatedAt);
    assert.strictEqual(harness.controller.getRecentProgressState(card), 'tracking');
    assert.strictEqual(await harness.controller.markProgressSeen(card), false, 'nothing to acknowledge twice');
  }

  // Tracking an unpinned card pins it; stopping keeps it pinned without the fields.
  {
    const harness = createController([], {});
    const item = { url: 'https://www.bilibili.com/video/BV11LEA6eEuj?p=2', title: '合集 P2' };
    assert.strictEqual(await harness.controller.setProgressTracking(item, true), true);
    let [card] = harness.syncArea.data[PINNED_KEY];
    assert.strictEqual(card.url, item.url);
    assert.strictEqual(card.progressTracking, true);
    assert.strictEqual(harness.controller.getRecentProgressState(item), 'tracking');
    assert.strictEqual(harness.toasts.pop().isError, false);
    assert.strictEqual(await harness.controller.setProgressTracking(item, false), true);
    [card] = harness.syncArea.data[PINNED_KEY];
    assert.strictEqual(card.url, item.url, 'stopping keeps the card pinned');
    assert.strictEqual('progressTracking' in card, false);
  }
  {
    const full = [1, 2, 3].map((n) => ({ url: `https://site${n}.com/`, title: `${n}` }));
    const harness = createController(full, {});
    assert.strictEqual(await harness.controller.setProgressTracking({ url: 'https://new.com/', title: 'New' }, true), false);
    assert.strictEqual(harness.toasts.pop().isError, true, 'the pin limit is explained');
  }

  // Restoring a version swaps it with the current one, in both stores.
  {
    const harness = createController([tracked], history);
    const ok = await harness.controller.restoreProgressVersion(
      { cardId: 'vidhub3.top', url: tracked.url, title: tracked.title, updateHistory: history['vidhub3.top'] },
      history['vidhub3.top'][1],
      1
    );
    assert.strictEqual(ok, true);
    const [card] = harness.syncArea.data[PINNED_KEY];
    assert.strictEqual(card.url, 'https://vidhub3.top/vodplay/55357-1-1.html');
    assert.strictEqual(card.title, '某剧 第1集');
    assert.strictEqual(card.progressTracking, true);
    assert.deepStrictEqual(
      harness.localArea.data[HISTORY_KEY]['vidhub3.top'].map((version) => version.url),
      [tracked.url, 'https://vidhub3.top/vodplay/55357-1-2.html']
    );
    assert.strictEqual(await harness.controller.restoreProgressVersion(
      { cardId: 'example.com', updateHistory: [] }, null, 0
    ), false, 'a card that is not tracked cannot be restored');
  }

  // The background tracker is wired into the service worker and gated by Labs.
  {
    const background = fs.readFileSync('src/background/background.js', 'utf8');
    ['src/shared/progress-match.js', 'src/shared/progress-history.js', 'src/background/progress-tracker.js']
      .forEach((file) => assert(background.includes(`chrome.runtime.getURL('${file}')`), `${file} should be imported`));
    assert(background.includes('isEnabled: () => progressTrackingEnabled'));
    const newtabHtml = fs.readFileSync('newtab.html', 'utf8');
    assert(newtabHtml.includes('../shared/progress-match.js') && newtabHtml.includes('../shared/progress-history.js'));
    assert(newtabHtml.includes('recent-history-dialog.css'));
    const optionsHtml = fs.readFileSync('src/options/options.html', 'utf8');
    assert(/id="_x_extension_progress_tracking_toggle_2026_unique_" type="checkbox">/.test(optionsHtml),
      'the Labs switch is off by default');
  }

  console.log('newtab progress tracking tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
