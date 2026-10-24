const assert = require('assert');
const os = require('os');
const { performance } = require('perf_hooks');
require('../node/register-typescript');
const bookmarkStore = require('../../src/newtab/bookmarks/bookmarks-store.ts');
const recentStore = require('../../src/domain/recent-sites-store.ts');
const settings = require('../../src/domain/settings.ts');

function round(value) {
  return Number(Number(value || 0).toFixed(2));
}

function summarize(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  const percentile = (ratio) => sorted[
    Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))
  ];
  const p95 = percentile(0.95);
  return {
    runs: sorted.length,
    minMs: round(sorted[0]),
    medianMs: round(percentile(0.5)),
    p95Ms: round(p95),
    maxMs: round(sorted[sorted.length - 1]),
    projectedP95At4xCpuMs: round(p95 * 4),
    projectedP95At6xCpuMs: round(p95 * 6),
    localRisk: p95 > 50 ? 'long-task-risk' : (p95 > 16.67 ? 'frame-risk' : 'within-frame'),
    projected4xRisk: p95 * 4 > 50
      ? 'long-task-risk'
      : (p95 * 4 > 16.67 ? 'frame-risk' : 'within-frame')
  };
}

function measureSync(callback, options) {
  const config = options || {};
  const warmups = Math.max(0, Number(config.warmups) || 0);
  const runs = Math.max(1, Number(config.runs) || 1);
  let latestResult = null;
  for (let index = 0; index < warmups; index += 1) {
    latestResult = callback();
  }
  if (typeof global.gc === 'function') {
    global.gc();
  }
  const durations = [];
  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();
    latestResult = callback();
    durations.push(performance.now() - startedAt);
  }
  return { latestResult, summary: summarize(durations) };
}

async function measureAsync(callback, options) {
  const config = options || {};
  const warmups = Math.max(0, Number(config.warmups) || 0);
  const runs = Math.max(1, Number(config.runs) || 1);
  let latestResult = null;
  for (let index = 0; index < warmups; index += 1) {
    latestResult = await callback();
  }
  if (typeof global.gc === 'function') {
    global.gc();
  }
  const durations = [];
  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();
    latestResult = await callback();
    durations.push(performance.now() - startedAt);
  }
  return { latestResult, summary: summarize(durations) };
}

function createBookmarkTree(folderCount, bookmarksPerFolder) {
  let nextId = 2;
  const folders = [];
  for (let folderIndex = 0; folderIndex < folderCount; folderIndex += 1) {
    const folderId = String(nextId++);
    const children = [];
    for (let bookmarkIndex = 0; bookmarkIndex < bookmarksPerFolder; bookmarkIndex += 1) {
      const bookmarkId = String(nextId++);
      children.push({
        id: bookmarkId,
        title: `Bookmark ${folderIndex}-${bookmarkIndex}`,
        url: `https://site-${folderIndex}-${bookmarkIndex}.example/path?q=${bookmarkId}`
      });
    }
    folders.push({ id: folderId, title: `Folder ${folderIndex}`, children });
  }
  return [{
    id: '0',
    title: '',
    children: [{ id: '1', title: 'Bookmarks bar', children: folders }]
  }];
}

function createRecentSiteData(historyCount, tabCount) {
  return {
    historyItems: Array.from({ length: historyCount }, (_, index) => ({
      title: `History ${index}`,
      url: `https://history-${index}.example/page`,
      lastVisitTime: historyCount - index,
      visitCount: (index % 20) + 1
    })),
    tabs: Array.from({ length: tabCount }, (_, index) => ({
      title: `Tab ${index}`,
      url: `https://tab-${index}.example/page`,
      lastAccessed: tabCount - index
    }))
  };
}

async function profileStorageBatch(requestCount) {
  let underlyingReadCount = 0;
  const source = {};
  const area = {
    get(keys, callback) {
      underlyingReadCount += 1;
      const result = {};
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
        result[key] = source[key];
      });
      callback(result);
    }
  };
  const batch = settings.createStorageReadBatch(area);
  const reads = [];
  for (let index = 0; index < requestCount; index += 1) {
    reads.push(batch.area.get(`key-${index}`));
  }
  const [diagnostics] = await Promise.all([batch.ready, ...reads]);
  return { diagnostics, underlyingReadCount };
}

async function run() {
  const bookmarkFolders = 250;
  const bookmarksPerFolder = 199;
  const bookmarkNodeCount = 2 + bookmarkFolders * (bookmarksPerFolder + 1);
  const bookmarkTree = createBookmarkTree(bookmarkFolders, bookmarksPerFolder);
  const bookmarkProfile = measureSync(
    () => bookmarkStore.buildBookmarkFolderCache(bookmarkTree),
    { runs: 4, warmups: 1 }
  );
  assert.strictEqual(bookmarkProfile.latestResult.nodeMap.size, bookmarkNodeCount);
  assert.strictEqual(bookmarkProfile.latestResult.folderItemsCache.size, bookmarkFolders + 1);
  const lazyBookmarkProfile = measureSync(
    () => bookmarkStore.buildBookmarkFolderCache(bookmarkTree, { lazy: true }),
    { runs: 6, warmups: 1 }
  );
  assert.strictEqual(lazyBookmarkProfile.latestResult.nodeMap.size, bookmarkNodeCount);
  assert.strictEqual(lazyBookmarkProfile.latestResult.folderItemsCache.size, 1);

  const historyCount = 50_000;
  const tabCount = 5_000;
  const recentData = createRecentSiteData(historyCount, tabCount);
  const recentProfile = measureSync(() => recentStore.mergeRecentSiteSources({
    ...recentData,
    candidateLimit: 10_000,
    hidden: [],
    limit: 8,
    mode: 'latest',
    pinned: []
  }), { runs: 6, warmups: 1 });
  assert.strictEqual(recentProfile.latestResult.length, 8);

  const storageRequestCount = 10_000;
  const storageProfile = await measureAsync(
    () => profileStorageBatch(storageRequestCount),
    { runs: 5, warmups: 1 }
  );
  assert.strictEqual(storageProfile.latestResult.underlyingReadCount, 1);
  assert.strictEqual(storageProfile.latestResult.diagnostics.requestCount, storageRequestCount);
  assert.strictEqual(storageProfile.latestResult.diagnostics.underlyingReadCount, 1);

  const memory = process.memoryUsage();
  console.log(JSON.stringify({
    environment: {
      architecture: process.arch,
      cpuCount: os.cpus().length,
      cpuModel: os.cpus()[0] ? os.cpus()[0].model : '',
      node: process.version,
      gcExposed: typeof global.gc === 'function'
    },
    caveat: 'CPU projections model slower devices; browser layout, paint, and GPU work require the development surface probe.',
    scenarios: {
      bookmarkCache: {
        folders: bookmarkFolders,
        nodes: bookmarkNodeCount,
        ...bookmarkProfile.summary
      },
      bookmarkCacheLazyStartup: {
        cachedFolders: lazyBookmarkProfile.latestResult.folderItemsCache.size,
        folders: bookmarkFolders,
        nodes: bookmarkNodeCount,
        ...lazyBookmarkProfile.summary
      },
      recentSites: {
        candidateLimit: 10_000,
        historyItems: historyCount,
        outputItems: 8,
        tabs: tabCount,
        ...recentProfile.summary
      },
      startupStorageBatch: {
        requests: storageRequestCount,
        underlyingReads: storageProfile.latestResult.underlyingReadCount,
        ...storageProfile.summary
      }
    },
    processMemoryBytes: {
      external: memory.external,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      rss: memory.rss
    }
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
