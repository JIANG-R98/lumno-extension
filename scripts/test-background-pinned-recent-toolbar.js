const assert = require('assert');
const toolbar = require('../src/background/pinned-recent-toolbar.js');

async function run() {
  const freshTab = { id: 12, url: 'https://example.com/new', title: 'Fresh title' };
  const calls = [];
  const chromeApi = {
    runtime: { lastError: null },
    tabs: {
      get(tabId, callback) {
        calls.push({ type: 'get', tabId });
        callback(freshTab);
      }
    }
  };
  const controller = {
    updateForTab(tab, guard) {
      calls.push({ type: 'update', tab, guard });
      return Promise.resolve({ ok: true, reason: 'updated' });
    }
  };
  const result = await toolbar.callControllerForFreshTab(chromeApi, controller, {
    tabId: 12,
    method: 'updateForTab',
    args: [{ cardId: 'card-12' }]
  });
  assert.deepStrictEqual(result, { ok: true, reason: 'updated' });
  assert.strictEqual(calls[0].tabId, 12);
  assert.strictEqual(calls[1].tab, freshTab);
  assert.strictEqual(calls[1].guard.cardId, 'card-12');

  chromeApi.tabs.get = (_tabId, callback) => {
    chromeApi.runtime.lastError = { message: 'missing' };
    callback(null);
    chromeApi.runtime.lastError = null;
  };
  const missing = await toolbar.callControllerForFreshTab(chromeApi, controller, {
    tabId: 13,
    method: 'updateForTab'
  });
  assert.strictEqual(missing.reason, 'tab-unavailable');

  const unavailable = await toolbar.callControllerForFreshTab(chromeApi, controller, {
    tabId: 'bad',
    method: 'updateForTab'
  });
  assert.strictEqual(unavailable.reason, 'unavailable');
  console.log('background pinned recent toolbar tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
