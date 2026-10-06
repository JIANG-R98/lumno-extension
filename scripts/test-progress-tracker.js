const assert = require('assert');
const progressMatch = require('../src/shared/progress-match.js');
const progressHistory = require('../src/shared/progress-history.js');
const { createProgressTracker } = require('../src/background/progress-tracker.js');

const PINNED_KEY = '_x_extension_newtab_pinned_recent_sites_2026_unique_';
const HISTORY_KEY = progressHistory.STORAGE_KEY;

function createArea(initial) {
  const data = { ...initial };
  return {
    data,
    get(keys, callback) {
      const result = {};
      keys.forEach((key) => {
        if (key in data) result[key] = JSON.parse(JSON.stringify(data[key]));
      });
      callback(result);
    },
    set(value, callback) {
      Object.assign(data, JSON.parse(JSON.stringify(value)));
      callback();
    }
  };
}

function createHarness(pinned, options = {}) {
  const tabs = new Map();
  const listeners = { updated: [], activated: [], removed: [], replaced: [] };
  const timers = [];
  const syncArea = createArea({ [PINNED_KEY]: pinned });
  const localArea = createArea({});
  let enabled = options.enabled !== false;
  const chromeApi = {
    runtime: { lastError: null },
    tabs: {
      get(tabId, callback) { callback(tabs.get(tabId) || null); },
      onUpdated: { addListener: (fn) => listeners.updated.push(fn) },
      onActivated: { addListener: (fn) => listeners.activated.push(fn) },
      onRemoved: { addListener: (fn) => listeners.removed.push(fn) },
      onReplaced: { addListener: (fn) => listeners.replaced.push(fn) }
    }
  };
  const tracker = createProgressTracker({
    chromeApi,
    progressMatch,
    progressHistory,
    getPinnedArea: () => syncArea,
    historyArea: localArea,
    pinnedKey: PINNED_KEY,
    isEnabled: () => enabled,
    dwellMs: 1000,
    now: () => 5000,
    setTimer(callback, delay) {
      timers.push({ callback, delay, cleared: false });
      return timers.length;
    },
    clearTimer(id) {
      if (timers[id - 1]) timers[id - 1].cleared = true;
    }
  });
  tracker.attach();
  return {
    tracker,
    syncArea,
    localArea,
    setEnabled(value) { enabled = value; },
    visit(tabId, url, title, extra = {}) {
      const tab = { id: tabId, url, title, active: true, audible: false, incognito: false, ...extra };
      tabs.set(tabId, tab);
      listeners.updated.forEach((fn) => fn(tabId, { url, status: 'complete' }, tab));
      return tab;
    },
    update(tabId, patch, changeInfo) {
      const tab = { ...tabs.get(tabId), ...patch };
      tabs.set(tabId, tab);
      listeners.updated.forEach((fn) => fn(tabId, changeInfo, tab));
    },
    async activate(tabId) {
      tabs.set(tabId, { ...tabs.get(tabId), active: true });
      listeners.activated.forEach((fn) => fn({ tabId }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    async elapse() {
      const due = timers.filter((timer) => !timer.cleared && !timer.fired);
      for (const timer of due) {
        timer.fired = true;
        await timer.callback();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    pinned() { return syncArea.data[PINNED_KEY]; },
    history() { return localArea.data[HISTORY_KEY] || {}; }
  };
}

const trackedCard = {
  title: '某剧 第1集',
  url: 'https://vidhub3.top/vodplay/55357-1-1.html',
  host: 'vidhub3.top',
  siteName: 'vidhub3',
  pinnedAt: 1,
  progressTracking: true
};
const otherCard = {
  title: 'GitHub',
  url: 'https://github.com/',
  host: 'github.com',
  pinnedAt: 2
};

(async () => {
  // Watching the next episode for the dwell time moves the card forward.
  {
    const harness = createHarness([trackedCard, otherCard]);
    harness.visit(1, 'https://vidhub3.top/vodplay/55357-1-2.html', '某剧 第2集');
    assert.strictEqual(harness.pinned()[0].url, trackedCard.url, 'nothing changes before the dwell time');
    await harness.elapse();
    const [card, untouched] = harness.pinned();
    assert.strictEqual(card.url, 'https://vidhub3.top/vodplay/55357-1-2.html');
    assert.strictEqual(card.title, '某剧 第2集');
    assert.strictEqual(card.lastVisitTime, 5000);
    assert.strictEqual(card.progressTracking, true);
    assert.strictEqual(card.pinnedAt, 1, 'other card fields are kept');
    assert.strictEqual('siteName' in card, false, 'a site name taken from the old title is derived again');
    assert.deepStrictEqual(untouched, otherCard, 'other cards are untouched');
    assert.deepStrictEqual(harness.history()['vidhub3.top'], [
      { url: trackedCard.url, title: '某剧 第1集', updatedAt: 5000 }
    ]);
  }

  // Passing through: leaving before the dwell time ends does nothing.
  {
    const harness = createHarness([trackedCard]);
    harness.visit(1, 'https://vidhub3.top/vodplay/55357-1-2.html', '某剧 第2集');
    harness.visit(1, 'https://vidhub3.top/', '首页');
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].url, trackedCard.url);
  }

  // A background tab waits until the person looks at it, then dwells again.
  {
    const harness = createHarness([trackedCard]);
    harness.visit(1, 'https://vidhub3.top/vodplay/55357-1-2.html', '某剧 第2集', { active: false });
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].url, trackedCard.url, 'unseen tabs do not count');
    await harness.activate(1);
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].url, 'https://vidhub3.top/vodplay/55357-1-2.html');
  }

  // A playing video counts even in a background tab.
  {
    const harness = createHarness([trackedCard]);
    harness.visit(1, 'https://vidhub3.top/vodplay/55357-1-2.html', '某剧 第2集', { active: false });
    await harness.elapse();
    harness.update(1, { audible: true }, { audible: true });
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].url, 'https://vidhub3.top/vodplay/55357-1-2.html');
  }

  // Rewatching an earlier episode keeps the card where it is.
  {
    const harness = createHarness([{ ...trackedCard, url: 'https://vidhub3.top/vodplay/55357-1-12.html' }]);
    harness.visit(1, 'https://vidhub3.top/vodplay/55357-1-3.html', '某剧 第3集');
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].url, 'https://vidhub3.top/vodplay/55357-1-12.html');
  }

  // Untracked cards, other works and disabled tracking never move.
  {
    const harness = createHarness([{ ...trackedCard, progressTracking: false }]);
    harness.visit(1, 'https://vidhub3.top/vodplay/55357-1-2.html', '某剧 第2集');
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].url, trackedCard.url, 'untracked card');
  }
  {
    const harness = createHarness([trackedCard]);
    harness.visit(1, 'https://vidhub3.top/vodplay/60001-1-1.html', '另一部剧 第1集');
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].url, trackedCard.url, 'another work');
  }
  {
    const harness = createHarness([trackedCard], { enabled: false });
    harness.visit(1, 'https://vidhub3.top/vodplay/55357-1-2.html', '某剧 第2集');
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].url, trackedCard.url, 'Labs switch off');
  }
  {
    const harness = createHarness([trackedCard]);
    harness.visit(1, 'https://vidhub3.top/vodplay/55357-1-2.html', '某剧 第2集', { incognito: true });
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].url, trackedCard.url, 'incognito tabs');
  }

  // Watching on: each later episode advances again and the history keeps the trail.
  {
    const harness = createHarness([trackedCard]);
    harness.visit(1, 'https://vidhub3.top/vodplay/55357-1-2.html', '某剧 第2集');
    await harness.elapse();
    harness.update(1, { title: '某剧 第2集 - 正在播放' }, { title: '某剧 第2集 - 正在播放' });
    await harness.elapse();
    harness.visit(1, 'https://vidhub3.top/vodplay/55357-1-3.html', '某剧 第3集');
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].url, 'https://vidhub3.top/vodplay/55357-1-3.html');
    assert.deepStrictEqual(
      harness.history()['vidhub3.top'].map((version) => version.url),
      ['https://vidhub3.top/vodplay/55357-1-2.html', trackedCard.url]
    );
  }

  // Several works on one site: each card follows its own work and keeps its own history.
  {
    const seriesA = { ...trackedCard, progressId: 'pa' };
    const seriesB = {
      title: '另一部剧 第5集',
      url: 'https://vidhub3.top/vodplay/60001-1-5.html',
      host: 'vidhub3.top',
      pinnedAt: 3,
      progressTracking: true,
      progressId: 'pb'
    };
    const harness = createHarness([seriesA, seriesB]);
    harness.visit(1, 'https://vidhub3.top/vodplay/60001-1-6.html', '另一部剧 第6集');
    await harness.elapse();
    const [a, b] = harness.pinned();
    assert.strictEqual(a.url, seriesA.url, 'the other work stays put');
    assert.strictEqual(b.url, 'https://vidhub3.top/vodplay/60001-1-6.html');
    assert.deepStrictEqual(Object.keys(harness.history()), ['pb']);
  }

  // History helpers.
  {
    let map = {};
    for (let index = 1; index <= 12; index += 1) {
      map = progressHistory.recordVersion(map, 'site', { url: `https://site/${index}`, title: `${index}`, updatedAt: index });
    }
    assert.strictEqual(map.site.length, progressHistory.MAX_VERSIONS, 'history keeps ten versions');
    assert.strictEqual(map.site[0].url, 'https://site/12');
    const restored = progressHistory.restoreVersion(map, 'site', 2, { url: 'https://site/13', title: '13', updatedAt: 13 });
    assert.strictEqual(restored.version.url, 'https://site/10');
    assert.strictEqual(restored.map.site[0].url, 'https://site/13', 'the version left behind can be restored back');
    assert(!restored.map.site.some((version) => version.url === 'https://site/10'), 'the restored version is current, not history');
    assert.strictEqual(progressHistory.restoreVersion(map, 'site', 99, null).version, null);
  }

  console.log('progress tracker tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
