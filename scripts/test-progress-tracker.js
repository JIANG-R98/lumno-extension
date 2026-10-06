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
  const listeners = { updated: [], activated: [], removed: [], replaced: [], created: [] };
  const pageHints = options.pageHints || (() => null);
  const transitions = options.transitions || {};
  const injected = [];
  const timers = [];
  const syncArea = createArea({ [PINNED_KEY]: pinned });
  const localArea = createArea({});
  let enabled = options.enabled !== false;
  const chromeApi = {
    runtime: { lastError: null },
    tabs: {
      get(tabId, callback) { callback(tabs.get(tabId) || null); },
      query(_query, callback) { callback(Array.from(tabs.values())); },
      onCreated: { addListener: (fn) => listeners.created.push(fn) },
      onUpdated: { addListener: (fn) => listeners.updated.push(fn) },
      onActivated: { addListener: (fn) => listeners.activated.push(fn) },
      onRemoved: { addListener: (fn) => listeners.removed.push(fn) },
      onReplaced: { addListener: (fn) => listeners.replaced.push(fn) }
    },
    scripting: {
      executeScript(details, callback) {
        injected.push(details);
        const tab = tabs.get(details.target.tabId);
        callback([{ result: pageHints(tab, details.world || 'ISOLATED') }]);
      }
    },
    history: {
      getVisits({ url }, callback) {
        callback(transitions[url] ? [{ visitTime: 1, transition: transitions[url] }] : []);
      }
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
    injected,
    open(tabId, openerTabId) {
      listeners.created.forEach((fn) => fn({ id: tabId, openerTabId }));
    },
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

  // How the person got there: clicking on from the card's page counts even
  // when neither the URL nor the title can tell.
  const opaqueCard = {
    title: '发现TV 在线播放',
    url: 'https://faxiantv.cc/player.php?share=aae5ca3dda55',
    progressTracking: true,
    progressId: 'pf'
  };
  const opaqueNext = 'https://faxiantv.cc/player.php?share=f3a3ce602a22';
  {
    const harness = createHarness([opaqueCard], { transitions: { [opaqueNext]: 'link' } });
    harness.visit(1, opaqueCard.url, '发现TV 在线播放');
    harness.visit(1, opaqueNext, '发现TV 在线播放');
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].url, opaqueNext, 'clicked on from the card in the same tab');
  }
  {
    const harness = createHarness([opaqueCard], { transitions: { [opaqueNext]: 'link' } });
    harness.visit(1, opaqueCard.url, '发现TV 在线播放');
    harness.open(2, 1);
    harness.visit(2, 'about:blank', '');
    harness.visit(2, opaqueNext, '发现TV 在线播放');
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].url, opaqueNext, 'a tab opened from the card came from it');
  }
  {
    const harness = createHarness([opaqueCard], { transitions: { [opaqueNext]: 'typed' } });
    harness.visit(1, opaqueCard.url, '发现TV 在线播放');
    harness.visit(1, opaqueNext, '发现TV 在线播放');
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].url, opaqueCard.url, 'a typed URL is not a click from the card');
  }
  {
    const harness = createHarness([opaqueCard]);
    harness.visit(1, opaqueNext, '发现TV 在线播放');
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].url, opaqueCard.url, 'arriving from elsewhere proves nothing');
  }

  // What the pages say: the new page's previous link points at the card.
  {
    const harness = createHarness([opaqueCard], {
      pageHints: (tab) => (tab.url === opaqueNext ? { prevUrls: [opaqueCard.url] } : null)
    });
    harness.visit(1, opaqueNext, '发现TV 在线播放');
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].url, opaqueNext);
    assert(harness.injected.every((details) => details.world !== 'MAIN'),
      'pages other than the card are read in the isolated world only');
  }
  // The card's own page names its next page, remembered for later.
  {
    const vol2 = 'https://www.bilinovel.com/novel/2013/vol2/1.html';
    const chapterCard = {
      title: '某轻小说 第一卷 终章',
      url: 'https://www.bilinovel.com/novel/2013/72035_3.html',
      progressTracking: true,
      progressId: 'pn'
    };
    const harness = createHarness([chapterCard], {
      pageHints: (tab, world) => (world === 'ISOLATED' && tab.url === chapterCard.url ? { nextUrls: [vol2] } : null)
    });
    harness.visit(1, chapterCard.url, chapterCard.title);
    await harness.elapse();
    harness.visit(2, vol2, '某轻小说 第二卷 序章');
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].url, vol2, 'the next link settles a URL of another shape');
  }
  // Pages of sites the person does not track are never read.
  {
    const harness = createHarness([opaqueCard]);
    harness.visit(1, 'https://github.com/', 'GitHub');
    await harness.elapse();
    assert.strictEqual(harness.injected.length, 0);
  }

  // One address for every episode: the card follows what the player names.
  {
    const embyUrl = 'https://media.example.com/web/index.html#!/videoosd/videoosd.html';
    const embyCard = { title: 'Emby', url: embyUrl, progressTracking: true, progressId: 'pe' };
    let playing = { title: '第1集 初遇', series: '某剧' };
    const harness = createHarness([embyCard], {
      pageHints: (_tab, world) => (world === 'MAIN' ? playing : {})
    });
    harness.visit(1, embyUrl, 'Emby');
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].title, '某剧 第1集 初遇');
    assert.strictEqual(harness.pinned()[0].url, embyUrl);
    assert.deepStrictEqual(harness.history(), {}, 'naming the current episode is not a change');
    playing = { title: '第2集 重逢', series: '某剧' };
    harness.update(1, { audible: true }, { audible: true });
    await harness.elapse();
    assert.strictEqual(harness.pinned()[0].title, '某剧 第2集 重逢');
    assert.deepStrictEqual(harness.history().pe.map((version) => version.title), ['某剧 第1集 初遇']);
  }

  // Pinning: an open tab's episode navigation makes it a series page.
  {
    const harness = createHarness([], {
      pageHints: (tab) => (tab.url === 'https://example.com/v/abc' ? { episodeNavigation: true } : null)
    });
    harness.visit(1, 'https://example.com/v/abc', '某视频');
    assert.strictEqual(await harness.tracker.probeSeries('https://example.com/v/abc'), true);
    assert.strictEqual(await harness.tracker.probeSeries('https://example.com/v/other'), false, 'no open tab');
    harness.visit(2, 'https://example.com/docs', 'Docs');
    assert.strictEqual(await harness.tracker.probeSeries('https://example.com/docs'), false);
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

  // Reading a page: next and previous links, episode navigation and metadata.
  {
    const { JSDOM } = require('jsdom');
    const { readProgressPageHints } = require('../src/background/progress-tracker.js');
    const read = (html, url) => {
      const dom = new JSDOM(html, { url });
      const previous = { document: global.document, location: global.location, navigator: global.navigator };
      global.document = dom.window.document;
      global.location = dom.window.location;
      Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
      try {
        return readProgressPageHints();
      } finally {
        global.document = previous.document;
        global.location = previous.location;
        Object.defineProperty(global, 'navigator', { value: previous.navigator, configurable: true });
      }
    };
    const chapter = read(`
      <link rel="prev" href="/novel/2013/72034.html">
      <a href="/novel/2013/72036.html">下一章</a>
      <a href="/novel/2013/">目录</a>
      <a href="/novel/2013/72034.html">上一章</a>`, 'https://www.bilinovel.com/novel/2013/72035.html');
    assert.deepStrictEqual(chapter.nextUrls, ['https://www.bilinovel.com/novel/2013/72036.html']);
    assert.deepStrictEqual(chapter.prevUrls, ['https://www.bilinovel.com/novel/2013/72034.html']);
    assert.strictEqual(chapter.episodeNavigation, true);
    const show = read(`
      <meta property="og:type" content="video.episode">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"TVEpisode","episodeNumber":3,"partOfSeries":{"@type":"TVSeries","name":"某剧"}}]}</script>
      <a href="/play/2">Next episode ›</a>`, 'https://video.example.com/play/1');
    assert.strictEqual(show.seriesName, '某剧');
    assert.strictEqual(show.episode, 3);
    assert.deepStrictEqual(show.nextUrls, ['https://video.example.com/play/2']);
    assert.strictEqual(show.episodeNavigation, true);
    const list = read('<a href="?page=2">下一页</a><a href="javascript:void 0">下一集</a>', 'https://example.com/list');
    assert.deepStrictEqual(list.nextUrls, ['https://example.com/list?page=2'], 'non-web links are dropped');
    const plain = read('<a href="/about">About</a>', 'https://example.com/');
    assert.deepStrictEqual(plain, {
      nextUrls: [], prevUrls: [], episodeNavigation: false, seriesName: '', episode: 0, media: null
    });
  }

  console.log('progress tracker tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
