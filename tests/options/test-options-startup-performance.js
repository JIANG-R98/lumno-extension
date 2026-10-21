const assert = require('assert');
const settings = require('../../src/shared/settings.js');
const { createOptionsPage } = require('../helpers/options-page');

async function run() {
  const values = {
    alpha: 1,
    beta: 2,
    gamma: 3
  };
  const readRequests = [];
  const writes = [];
  const rawArea = {
    get(keys, callback) {
      readRequests.push(keys);
      const selected = {};
      if (keys === null) {
        Object.assign(selected, values);
      } else {
        keys.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(values, key)) {
            selected[key] = values[key];
          }
        });
      }
      Promise.resolve().then(() => callback(selected));
    },
    set(payload, callback) {
      writes.push(payload);
      Object.assign(values, payload);
      if (callback) callback();
    }
  };

  const batch = settings.createStorageReadBatch(rawArea);
  assert(batch, 'a readable storage area should create a startup read batch');

  const callbackResults = [];
  batch.area.get(['alpha'], (result) => callbackResults.push(result.alpha));
  batch.area.get(['beta'], (result) => callbackResults.push(result.beta));
  const selectedPromise = batch.area.get({ gamma: 0, missing: 9 });
  batch.area.set({ delta: 4 });

  const [metrics, selected] = await Promise.all([batch.ready, selectedPromise]);
  assert.deepStrictEqual(callbackResults, [1, 2]);
  assert.deepStrictEqual(selected, { gamma: 3, missing: 9 });
  assert.deepStrictEqual(readRequests, [['alpha', 'beta', 'gamma', 'missing']]);
  assert.deepStrictEqual(writes, [{ delta: 4 }], 'writes should not wait for the read batch');
  assert.deepStrictEqual(metrics, {
    keys: ['alpha', 'beta', 'gamma', 'missing'],
    keyCount: 4,
    requestCount: 3,
    underlyingReadCount: 1
  });

  batch.area.get(['alpha'], () => {});
  assert.strictEqual(
    readRequests.length,
    2,
    'reads after the startup boundary should pass through normally'
  );

  await testOptionsPageStartup();
  await testStartupReadPrefetch();
  console.log('Options startup performance tests passed');
}

// On the page: the startup reads go out as one batch, control refreshes
// requested while it loads are coalesced, and the General tab is active.
async function testOptionsPageStartup() {
  const page = await createOptionsPage({});
  await page.settle(500);
  const largestRead = Math.max(...page.storage.sync.reads.map((keys) => (Array.isArray(keys) ? keys.length : 1)));
  assert.ok(largestRead >= 30, `Options should batch same-task startup reads (largest read: ${largestRead} keys)`);
  const refreshes = Number(page.document.documentElement.getAttribute('data-lumno-options-control-refreshes'));
  assert.ok(refreshes >= 1 && refreshes <= 3, `Options should coalesce repeated startup control refreshes (${refreshes})`);
  const activeTab = page.document.querySelector('._x_extension_settings_tab_button_2024_unique_[data-active="true"]');
  assert.strictEqual(activeTab && activeTab.getAttribute('data-tab'), 'general', 'the General tab should be active after startup');
  page.close();
}

function createPrefetchHarness(values) {
  const reads = [];
  const listeners = new Set();
  const area = {
    get(keys, callback) {
      reads.push(keys);
      const selected = {};
      keys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(values, key)) selected[key] = values[key];
      });
      Promise.resolve().then(() => callback(selected));
    }
  };
  const chromeApi = {
    storage: {
      onChanged: {
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener)
      }
    }
  };
  const change = (key, newValue) => {
    values[key] = newValue;
    listeners.forEach((listener) => listener({ [key]: { newValue } }, 'sync'));
  };
  return { area, chromeApi, reads, listeners, change };
}

async function testStartupReadPrefetch() {
  const covered = createPrefetchHarness({ alpha: 1, beta: 2 });
  assert.strictEqual(settings.prefetchStorageRead(covered.area, ['alpha', 'beta'], covered.chromeApi), true);
  const coveredBatch = settings.createStorageReadBatch(covered.area);
  const coveredResult = await coveredBatch.area.get(['alpha']);
  assert.deepStrictEqual(coveredResult, { alpha: 1 });
  assert.deepStrictEqual(covered.reads, [['alpha', 'beta']],
    'a batch covered by the prefetch should take its result instead of reading again');
  assert.strictEqual(covered.listeners.size, 0, 'the prefetch should stop watching once taken');

  const stale = createPrefetchHarness({ alpha: 1 });
  settings.prefetchStorageRead(stale.area, ['alpha'], stale.chromeApi);
  stale.change('alpha', 5);
  const staleResult = await settings.createStorageReadBatch(stale.area).area.get(['alpha']);
  assert.deepStrictEqual(staleResult, { alpha: 5 }, 'a key that changed after the prefetch should be read again');
  assert.strictEqual(stale.reads.length, 2);

  const uncovered = createPrefetchHarness({ alpha: 1, gamma: 3 });
  settings.prefetchStorageRead(uncovered.area, ['alpha'], uncovered.chromeApi);
  const uncoveredResult = await settings.createStorageReadBatch(uncovered.area).area.get(['alpha', 'gamma']);
  assert.deepStrictEqual(uncoveredResult, { alpha: 1, gamma: 3 });
  assert.deepStrictEqual(uncovered.reads, [['alpha'], ['alpha', 'gamma']],
    'a batch asking for keys the prefetch lacks should read them all itself');
  assert.strictEqual(uncovered.listeners.size, 0);

  assert.strictEqual(settings.prefetchStorageRead(covered.area, ['alpha'], {}), false,
    'without change events a prefetch could serve stale values, so it should not start');
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
