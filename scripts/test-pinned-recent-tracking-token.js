const assert = require('assert');
const tokenModule = require('../src/content/pinned-recent-tracking-token.js');

function createHarness(options) {
  const config = options || {};
  const data = new Map();
  const listeners = [];
  const pageListeners = {};
  const windowObj = {
    sessionStorage: {
      getItem(key) {
        if (config.storageThrows) throw new Error('blocked');
        return data.get(key) || null;
      },
      setItem(key, value) {
        if (config.storageThrows) throw new Error('blocked');
        data.set(key, String(value));
      },
      removeItem(key) {
        if (config.storageThrows) throw new Error('blocked');
        data.delete(key);
      }
    },
    addEventListener(type, listener) {
      pageListeners[type] = listener;
    }
  };
  windowObj.top = config.childFrame ? {} : windowObj;
  const sent = [];
  const chromeApi = {
    runtime: {
      lastError: null,
      onMessage: {
        addListener(listener) {
          listeners.push(listener);
        }
      },
      sendMessage(message, callback) {
        sent.push(message);
        callback(config.response || { status: 'ignored' });
      }
    }
  };
  return { windowObj, chromeApi, data, listeners, pageListeners, sent };
}

async function run() {
  const harness = createHarness({
    response: { status: 'bound', token: 'trk-11111111111111111111111111111111' }
  });
  const controller = tokenModule.createTrackingTokenController(harness);
  assert.strictEqual(controller.attach(), true);
  await Promise.resolve();
  assert.strictEqual(harness.sent[0].action, tokenModule.SYNC_ACTION);
  assert.strictEqual(harness.sent[0].trackingToken, '');
  assert.strictEqual(
    harness.data.get(tokenModule.PAGE_TOKEN_STORAGE_KEY),
    'trk-11111111111111111111111111111111'
  );

  harness.data.set(tokenModule.PAGE_TOKEN_STORAGE_KEY, 'trk-old');
  harness.chromeApi.runtime.sendMessage = (message, callback) => {
    harness.sent.push(message);
    callback({ status: 'clear', clear: true });
  };
  harness.listeners[0]({ action: tokenModule.REFRESH_ACTION });
  await Promise.resolve();
  assert.strictEqual(harness.data.has(tokenModule.PAGE_TOKEN_STORAGE_KEY), false);

  const blocked = createHarness({ storageThrows: true, response: { status: 'ignored' } });
  const blockedController = tokenModule.createTrackingTokenController(blocked);
  assert.strictEqual(blockedController.attach(), true);
  await blockedController.requestSync();
  assert.strictEqual(blocked.sent[0].trackingToken, '');

  const child = createHarness({ childFrame: true });
  const childController = tokenModule.createTrackingTokenController(child);
  assert.strictEqual(childController.attach(), false);
  assert.strictEqual(child.sent.length, 0);
  console.log('pinned recent tracking token tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
