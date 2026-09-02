const assert = require('assert');
const tokenModule = require('../src/content/pinned-recent-tracking-token.js');

function createHarness(options) {
  const config = options || {};
  const data = new Map();
  const listeners = [];
  const pageListeners = {};
  const intervalListeners = [];
  const responseCallbacks = [];
  const windowObj = {
    location: { href: config.url || 'https://www.bilibili.com/video/BV-old/?p=1' },
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
    },
    setInterval(listener) {
      intervalListeners.push(listener);
      return intervalListeners.length;
    },
    clearInterval(intervalId) {
      intervalListeners[Number(intervalId) - 1] = null;
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
        if (config.sendThrows) throw new Error('extension context invalidated');
        sent.push(message);
        if (config.deferResponse) responseCallbacks.push(callback);
        else callback(config.response || { status: 'ignored' });
      }
    }
  };
  return {
    windowObj,
    chromeApi,
    data,
    listeners,
    pageListeners,
    intervalListeners,
    responseCallbacks,
    sent
  };
}

async function run() {
  const harness = createHarness({
    response: {
      status: 'bound',
      cardId: 'pinned-course',
      token: 'trk-11111111111111111111111111111111'
    }
  });
  const controller = tokenModule.createTrackingTokenController(harness);
  assert.strictEqual(controller.attach(), true);
  await Promise.resolve();
  assert.strictEqual(harness.sent[0].action, tokenModule.SYNC_ACTION);
  assert.strictEqual(harness.sent[0].trackingToken, '');
  assert.strictEqual(
    harness.sent[0].currentUrl,
    'https://www.bilibili.com/video/BV-old/?p=1'
  );
  assert.strictEqual(
    harness.data.get(tokenModule.PAGE_TOKEN_STORAGE_KEY),
    'trk-11111111111111111111111111111111'
  );
  assert.strictEqual(harness.intervalListeners.length, 1);
  harness.windowObj.location.href = 'https://www.bilibili.com/video/BV-new/?p=2';
  harness.intervalListeners[0]();
  await Promise.resolve();
  assert.strictEqual(harness.sent.length, 2);
  assert.strictEqual(
    harness.sent[1].currentUrl,
    'https://www.bilibili.com/video/BV-new/?p=2'
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

  const raced = createHarness({ deferResponse: true });
  const racedController = tokenModule.createTrackingTokenController(raced);
  assert.strictEqual(racedController.attach(), true);
  raced.windowObj.location.href = 'https://www.bilibili.com/video/BV-raced/?p=2';
  raced.pageListeners.popstate();
  assert.strictEqual(raced.sent.length, 1);
  raced.responseCallbacks.shift()({
    status: 'bound',
    cardId: 'pinned-course',
    token: 'trk-22222222222222222222222222222222'
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.strictEqual(raced.sent.length, 2);

  const invalidated = createHarness({ sendThrows: true });
  const invalidatedController = tokenModule.createTrackingTokenController(invalidated);
  assert.strictEqual(invalidatedController.attach(), true);
  assert.deepStrictEqual(await invalidatedController.requestSync(), { status: 'ignored' });

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
