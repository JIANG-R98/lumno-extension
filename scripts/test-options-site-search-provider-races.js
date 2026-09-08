const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const optionsSource = fs.readFileSync('src/options/options.js', 'utf8');
const factoryStart = optionsSource.indexOf(
  'function createSiteSearchProviderRefreshCoordinator('
);
const factoryEnd = optionsSource.indexOf(
  '\n  function createAggregateSearchStateCoordinator(',
  factoryStart
);

assert.ok(
  factoryStart >= 0 && factoryEnd > factoryStart,
  'site-search provider refresh coordinator must exist'
);
assert.match(
  optionsSource,
  /function saveDisabledSiteSearchKeys\(keys\) \{[\s\S]*?enqueueSiteSearchProviderStorageOperation[\s\S]*?function saveCustomSiteSearchProviders\(items\) \{[\s\S]*?enqueueSiteSearchProviderStorageOperation[\s\S]*?function saveSiteSearchProviderState\(items, keys\) \{[\s\S]*?enqueueSiteSearchProviderStorageOperation/,
  'all provider writes must share the same serialization queue'
);
assert.match(
  optionsSource,
  /persist\(_prepared, context\)[\s\S]*?enqueueSiteSearchProviderStorageOperation\(async \(\) =>[\s\S]*?loadCustomSiteSearchProviders\(defaults\)[\s\S]*?prepareSiteSearchProviderSnapshot\([\s\S]*?writeSiteSearchProviderState\(/,
  'provider migration must re-read and prepare storage inside the serialized write'
);

const createSiteSearchProviderRefreshCoordinator = vm.runInNewContext(
  `(${optionsSource.slice(factoryStart, factoryEnd)})`,
  { Object, Promise }
);

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function flushTasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function prepareSnapshot(snapshot) {
  const value = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return {
    items: (Array.isArray(value.items) ? value.items : []).map((item) => ({
      ...item,
      id: item.id || `stable-${item.key}`
    })),
    needsPersistence: Boolean(value.needsMigration)
  };
}

async function testNewerRefreshInvalidatesOlderRead() {
  const loadCalls = [];
  const persisted = [];
  const applied = [];
  const coordinator = createSiteSearchProviderRefreshCoordinator({
    apply(prepared) {
      applied.push(prepared.items.map((item) => item.key));
    },
    load() {
      const deferred = createDeferred();
      loadCalls.push(deferred);
      return deferred.promise;
    },
    persist(prepared) {
      persisted.push(prepared.items.map((item) => item.key));
      return Promise.resolve();
    },
    prepare: prepareSnapshot
  });

  const olderRefresh = coordinator.refresh();
  await flushTasks();
  const newerRefresh = coordinator.refresh();

  loadCalls[0].resolve({
    items: [{ key: 'old' }],
    needsMigration: true
  });
  await olderRefresh;
  await flushTasks();

  assert.strictEqual(loadCalls.length, 2, 'refreshes must run through one serialized queue');
  loadCalls[1].resolve({
    items: [{ id: 'new-id', key: 'new' }],
    needsMigration: false
  });
  await newerRefresh;

  assert.deepStrictEqual(persisted, [], 'an invalidated snapshot must never be migrated');
  assert.deepStrictEqual(applied, [['new']], 'an invalidated snapshot must never be published');
}

async function testMigrationReloadsLatestStorageAndConfirmsWrite() {
  const snapshots = [
    {
      items: [{ key: 'old' }],
      needsMigration: true
    },
    {
      items: [{ key: 'old' }, { key: 'external' }],
      needsMigration: true
    }
  ];
  const persisted = [];
  const applied = [];
  let storedSnapshot = null;
  let loadCount = 0;
  const coordinator = createSiteSearchProviderRefreshCoordinator({
    apply(prepared) {
      applied.push(prepared.items.map((item) => item.key));
    },
    load() {
      loadCount += 1;
      if (snapshots.length > 0) {
        return Promise.resolve(snapshots.shift());
      }
      return Promise.resolve(storedSnapshot);
    },
    persist(prepared) {
      const items = prepared.items.map((item) => ({ ...item }));
      persisted.push(items);
      storedSnapshot = { items, needsMigration: false };
      return Promise.resolve();
    },
    prepare: prepareSnapshot
  });

  await coordinator.refresh();

  assert.strictEqual(loadCount, 3, 'migration must re-read before and after its storage write');
  assert.deepStrictEqual(
    persisted[0].map((item) => item.key),
    ['old', 'external'],
    'migration must preserve providers added after the first read'
  );
  assert.ok(
    persisted[0].every((item) => item.id),
    'the latest provider snapshot must receive stable ids before persistence'
  );
  assert.deepStrictEqual(
    applied,
    [['old', 'external']],
    'the UI must publish the storage-confirmed provider snapshot'
  );
}

async function testRefreshDuringMigrationCannotPublishOldState() {
  const persistDeferred = createDeferred();
  const applied = [];
  const loadSnapshots = [
    { items: [{ key: 'old' }], needsMigration: true },
    { items: [{ key: 'old' }], needsMigration: true },
    { items: [{ id: 'new-id', key: 'new' }], needsMigration: false }
  ];
  let persistCount = 0;
  let persistContext = null;
  const coordinator = createSiteSearchProviderRefreshCoordinator({
    apply(prepared) {
      applied.push(prepared.items.map((item) => item.key));
    },
    load() {
      return Promise.resolve(loadSnapshots.shift());
    },
    persist(_prepared, context) {
      persistCount += 1;
      persistContext = context;
      return persistDeferred.promise;
    },
    prepare: prepareSnapshot
  });

  const olderRefresh = coordinator.refresh();
  await flushTasks();
  await flushTasks();
  assert.strictEqual(persistCount, 1, 'the older migration should be in flight');

  const newerRefresh = coordinator.refresh();
  assert.strictEqual(
    persistContext.isCurrent(),
    false,
    'a queued provider write must be able to reject an invalidated migration token'
  );
  persistDeferred.resolve();
  await olderRefresh;
  await newerRefresh;

  assert.deepStrictEqual(
    applied,
    [['new']],
    'a refresh invalidated during persistence must not publish its old snapshot'
  );
}

(async () => {
  await testNewerRefreshInvalidatesOlderRead();
  await testMigrationReloadsLatestStorageAndConfirmsWrite();
  await testRefreshDuringMigrationCannotPublishOldState();
  console.log('options site-search provider race tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
