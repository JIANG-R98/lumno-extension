const assert = require('assert');
const recentStore = require('../src/newtab/recent-sites-store.js');
const tracking = require('../src/background/pinned-recent-tracking-registry.js');

function createMemoryStorage(initialData) {
  const data = { ...(initialData || {}) };
  return {
    data,
    get(keys, callback) {
      const result = {};
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
        result[key] = data[key];
      });
      callback(result);
    },
    set(value, callback) {
      Object.assign(data, value || {});
      if (callback) callback();
    }
  };
}

function createFailingStorage() {
  return {
    get(_keys, callback) {
      callback({});
    },
    set(_value, callback) {
      this.runtime.lastError = { message: 'write failed' };
      callback();
      this.runtime.lastError = null;
    },
    runtime: null
  };
}

function createTransientReadFailureStorage(runtime, initialData) {
  const storage = createMemoryStorage(initialData);
  const immediateGet = storage.get.bind(storage);
  let failed = false;
  storage.get = (keys, callback) => {
    if (!failed) {
      failed = true;
      runtime.lastError = { message: 'temporary read failure' };
      callback({});
      runtime.lastError = null;
      return;
    }
    immediateGet(keys, callback);
  };
  return storage;
}

function createTokenFactory() {
  let next = 1;
  return () => `${String(next++).padStart(8, '0')}-0000-4000-8000-000000000000`;
}

function createRegistry(options) {
  const config = options || {};
  return tracking.createPinnedRecentTrackingRegistry({
    runtime: { lastError: null },
    recentStore,
    sessionStorage: config.sessionStorage,
    durableStorage: config.durableStorage,
    randomUUID: config.randomUUID || createTokenFactory(),
    now: config.now || (() => 10_000),
    tokenTtlMs: config.tokenTtlMs,
    maxTokens: config.maxTokens,
    maxTokenForks: config.maxTokenForks
  });
}

async function run() {
  const cards = recentStore.normalizePinnedRecentSites([{
    title: 'Course',
    url: 'https://www.bilibili.com/video/BV-old/?p=1',
    pinnedAt: 100,
    trackingEnabled: true
  }, {
    title: 'Docs',
    url: 'https://docs.example/start',
    pinnedAt: 200,
    trackingEnabled: true
  }]);
  const sessionStorage = createMemoryStorage({
    [tracking.TRACKING_SESSION_STORAGE_KEY]: {
      10: {
        cardId: cards[0].cardId,
        token: '',
        origin: 'https://www.bilibili.com'
      }
    }
  });
  const durableStorage = createMemoryStorage({});
  const registry = createRegistry({ sessionStorage, durableStorage });
  await registry.initialize(cards);
  assert.strictEqual(registry.getCardId(10), cards[0].cardId);

  const bound = await registry.bindTab({ id: 11, url: cards[0].url }, cards[0].cardId, cards);
  assert.strictEqual(bound.status, 'bound');
  assert.strictEqual(registry.getCardId(11), cards[0].cardId);
  assert.deepStrictEqual(registry.getActiveCounts(), { [cards[0].cardId]: 2 });
  const wrongHostBinding = await registry.bindTab({
    id: 19,
    url: cards[1].url
  }, cards[0].cardId, cards);
  assert.strictEqual(wrongHostBinding.status, 'ignored');
  const wrongOriginBinding = await registry.bindTab({
    id: 20,
    url: 'http://www.bilibili.com:8080/video/BV-old/'
  }, cards[0].cardId, cards);
  assert.strictEqual(wrongOriginBinding.status, 'ignored');

  const synced = await registry.syncDocument({
    id: 11,
    url: 'https://www.bilibili.com/video/BV-new/?p=2'
  }, '', cards);
  assert.strictEqual(synced.status, 'bound');
  assert.ok(tracking.normalizeTrackingToken(synced.token));
  assert.strictEqual(
    durableStorage.data[tracking.TRACKING_TOKEN_STORAGE_KEY][synced.token].cardId,
    cards[0].cardId
  );

  await registry.bindTab({ id: 18, url: cards[0].url }, cards[0].cardId, cards);
  const originBound = await registry.syncDocument({
    id: 18,
    url: cards[0].url
  }, '', cards);
  assert.strictEqual(originBound.status, 'bound');
  const navigatedAcrossOrigin = await registry.syncDocument({
    id: 18,
    url: 'http://www.bilibili.com:8080/video/BV-insecure/'
  }, originBound.token, cards);
  assert.strictEqual(navigatedAcrossOrigin.status, 'clear');
  assert.strictEqual(registry.getCardId(18), '');

  const restartedRegistry = createRegistry({ sessionStorage, durableStorage });
  await restartedRegistry.initialize(cards);
  assert.strictEqual(restartedRegistry.getCardId(11), cards[0].cardId);
  const sameDocument = await restartedRegistry.syncDocument({
    id: 11,
    url: 'https://www.bilibili.com/video/BV-new/?p=3'
  }, synced.token, cards);
  assert.strictEqual(sameDocument.token, synced.token);

  const restoredSessionStorage = createMemoryStorage({});
  const restoredRegistry = createRegistry({
    sessionStorage: restoredSessionStorage,
    durableStorage,
    randomUUID: createTokenFactory(),
    maxTokenForks: 2
  });
  await restoredRegistry.initialize(cards);
  const restored = await restoredRegistry.syncDocument({
    id: 212,
    url: 'https://www.bilibili.com/video/BV-restored/?p=7'
  }, synced.token, cards);
  assert.strictEqual(restored.status, 'restored');
  assert.strictEqual(restored.cardId, cards[0].cardId);
  assert.notStrictEqual(restored.token, synced.token);
  assert.strictEqual(restoredRegistry.getCardId(212), cards[0].cardId);
  assert.strictEqual(await restoredRegistry.replaceTab(212, 312), true);
  assert.strictEqual(restoredRegistry.getCardId(212), '');
  assert.strictEqual(restoredRegistry.getCardId(312), cards[0].cardId);

  const descendant = await restoredRegistry.syncDocument({
    id: 218,
    url: 'https://www.bilibili.com/video/BV-descendant/'
  }, restored.token, cards);
  assert.strictEqual(descendant.status, 'restored');
  const descendantTooDeep = await restoredRegistry.syncDocument({
    id: 219,
    url: 'https://www.bilibili.com/video/BV-descendant-too-deep/'
  }, descendant.token, cards);
  assert.strictEqual(descendantTooDeep.status, 'clear');

  const cloned = await restoredRegistry.syncDocument({
    id: 213,
    url: 'https://www.bilibili.com/video/BV-clone/?p=8'
  }, synced.token, cards);
  assert.strictEqual(cloned.status, 'restored');
  assert.strictEqual(cloned.cardId, cards[0].cardId);
  assert.notStrictEqual(cloned.token, restored.token);
  await restoredRegistry.releaseTab(213, { revokeToken: false });
  assert.ok(
    durableStorage.data[tracking.TRACKING_TOKEN_STORAGE_KEY][cloned.token]
  );
  const replayedTooOften = await restoredRegistry.syncDocument({
    id: 216,
    url: 'https://www.bilibili.com/video/BV-replay/'
  }, synced.token, cards);
  assert.strictEqual(replayedTooOften.status, 'clear');

  const crossOriginReplay = await restoredRegistry.syncDocument({
    id: 217,
    url: 'http://www.bilibili.com:8080/video/BV-cross-origin/'
  }, restored.token, cards);
  assert.strictEqual(crossOriginReplay.status, 'clear');

  const mismatched = await restoredRegistry.syncDocument({
    id: 214,
    url: 'https://docs.example/not-bilibili'
  }, synced.token, cards);
  assert.strictEqual(mismatched.status, 'clear');
  assert.strictEqual(restoredRegistry.getCardId(214), '');

  await restoredRegistry.bindTab({ id: 215, url: cards[0].url }, cards[0].cardId, cards);
  const incognito = await restoredRegistry.syncDocument({
    id: 215,
    url: cards[0].url,
    incognito: true
  }, synced.token, cards);
  assert.strictEqual(incognito.status, 'bound-session-only');
  assert.strictEqual(incognito.clear, true);

  const durableBeforeRelease = {
    ...durableStorage.data[tracking.TRACKING_TOKEN_STORAGE_KEY]
  };
  await restoredRegistry.releaseTab(312, { revokeToken: true });
  assert.strictEqual(restoredRegistry.getCardId(312), '');
  assert.ok(durableBeforeRelease[restored.token]);
  assert.strictEqual(
    durableStorage.data[tracking.TRACKING_TOKEN_STORAGE_KEY][restored.token],
    undefined
  );

  await restoredRegistry.prune([{ ...cards[1], trackingEnabled: true }]);
  assert.strictEqual(restoredRegistry.getCardId(213), '');
  assert.ok(Object.values(
    durableStorage.data[tracking.TRACKING_TOKEN_STORAGE_KEY]
  ).every((record) => record.cardId !== cards[0].cardId));

  const expiredToken = 'trk-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  const expiringStorage = createMemoryStorage({
    [tracking.TRACKING_TOKEN_STORAGE_KEY]: {
      [expiredToken]: {
        cardId: cards[1].cardId,
        hostKey: 'docs.example',
        origin: 'https://docs.example',
        createdAt: 1,
        lastSeenAt: 1
      }
    }
  });
  const expiringRegistry = createRegistry({
    sessionStorage: createMemoryStorage({}),
    durableStorage: expiringStorage,
    now: () => 120_001,
    tokenTtlMs: 60_000
  });
  await expiringRegistry.initialize(cards);
  assert.deepStrictEqual(
    expiringStorage.data[tracking.TRACKING_TOKEN_STORAGE_KEY],
    {}
  );

  const failingDurableStorage = createFailingStorage();
  const failingRuntime = { lastError: null };
  failingDurableStorage.runtime = failingRuntime;
  const failingRegistry = tracking.createPinnedRecentTrackingRegistry({
    runtime: failingRuntime,
    recentStore,
    sessionStorage: createMemoryStorage({}),
    durableStorage: failingDurableStorage,
    randomUUID: createTokenFactory(),
    now: () => 10_000
  });
  await failingRegistry.initialize(cards);
  await failingRegistry.bindTab({ id: 500, url: cards[0].url }, cards[0].cardId, cards);
  const degraded = await failingRegistry.syncDocument({
    id: 500,
    url: cards[0].url
  }, '', cards);
  assert.strictEqual(degraded.status, 'bound-session-only');
  assert.strictEqual(degraded.token, undefined);
  assert.strictEqual(degraded.clear, true);

  const retryRuntime = { lastError: null };
  const retryToken = 'trk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const retryDurable = createTransientReadFailureStorage(retryRuntime, {
    [tracking.TRACKING_TOKEN_STORAGE_KEY]: {
      [retryToken]: {
        cardId: cards[0].cardId,
        hostKey: 'bilibili.com',
        origin: 'https://www.bilibili.com',
        createdAt: 1,
        lastSeenAt: 10_000,
        restoreCount: 0
      }
    }
  });
  const retryRegistry = tracking.createPinnedRecentTrackingRegistry({
    runtime: retryRuntime,
    recentStore,
    sessionStorage: createMemoryStorage({}),
    durableStorage: retryDurable,
    randomUUID: createTokenFactory(),
    now: () => 10_001
  });
  await retryRegistry.initialize(cards);
  const retryResult = await retryRegistry.syncDocument({
    id: 600,
    url: 'https://www.bilibili.com/video/BV-retry/'
  }, retryToken, cards);
  assert.strictEqual(retryResult.status, 'restored');
  assert.strictEqual(retryResult.clear, undefined);

  const unavailableRuntime = { lastError: null };
  const unavailableDurable = {
    get(_keys, callback) {
      unavailableRuntime.lastError = { message: 'temporarily unavailable' };
      callback({});
      unavailableRuntime.lastError = null;
    },
    set(_value, callback) {
      callback();
    }
  };
  const unavailableRegistry = tracking.createPinnedRecentTrackingRegistry({
    runtime: unavailableRuntime,
    recentStore,
    sessionStorage: createMemoryStorage({}),
    durableStorage: unavailableDurable,
    now: () => 10_002
  });
  await unavailableRegistry.initialize(cards);
  const unavailableResult = await unavailableRegistry.syncDocument({
    id: 601,
    url: 'https://www.bilibili.com/video/BV-unavailable/'
  }, retryToken, cards);
  assert.strictEqual(unavailableResult.status, 'ignored');
  assert.strictEqual(unavailableResult.clear, undefined);

  const cappedDurable = createMemoryStorage({});
  const cappedRegistry = createRegistry({
    sessionStorage: createMemoryStorage({}),
    durableStorage: cappedDurable,
    maxTokens: 1,
    now: () => 20_000
  });
  await cappedRegistry.initialize(cards);
  await cappedRegistry.bindTab({ id: 700, url: cards[0].url }, cards[0].cardId, cards);
  await cappedRegistry.syncDocument({ id: 700, url: cards[0].url }, '', cards);
  await cappedRegistry.bindTab({ id: 701, url: cards[1].url }, cards[1].cardId, cards);
  const newestCapped = await cappedRegistry.syncDocument({
    id: 701,
    url: cards[1].url
  }, '', cards);
  const cappedTokens = Object.keys(
    cappedDurable.data[tracking.TRACKING_TOKEN_STORAGE_KEY]
  );
  assert.deepStrictEqual(cappedTokens, [newestCapped.token]);

  assert.strictEqual(tracking.normalizeTrackingToken('invalid'), '');
  assert.strictEqual(tracking.normalizeTrackingToken('trk-ABCDEFABCDEFABCDEFABCDEFABCDEFAB'),
    'trk-abcdefabcdefabcdefabcdefabcdefab');
  console.log('background pinned recent tracking registry tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
