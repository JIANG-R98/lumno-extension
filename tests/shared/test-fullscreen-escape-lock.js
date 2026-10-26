const assert = require('assert');

const { createFullscreenEscapeLock } = require('../../src/shared/ui/fullscreen-escape-lock.ts');

function createHarness(options = {}) {
  const calls = [];
  const listeners = new Map();
  const doc = { fullscreenElement: options.fullscreen ? { name: 'player' } : null };
  const keyboard = options.withoutKeyboard ? undefined : {
    lock(keys) {
      calls.push(['lock', keys]);
      return options.rejectLock ? Promise.reject(new Error('refused')) : Promise.resolve();
    },
    unlock() {
      calls.push(['unlock']);
    }
  };
  const win = {
    document: doc,
    navigator: { keyboard },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) {
        listeners.delete(type);
      }
    }
  };

  function setFullscreen(value) {
    doc.fullscreenElement = value ? { name: 'player' } : null;
    const handler = listeners.get('fullscreenchange');
    if (handler) {
      handler();
    }
  }

  return { calls, listeners, setFullscreen, win };
}

// An element already fullscreen: Escape is locked until the overlay closes.
{
  const harness = createHarness({ fullscreen: true });
  const lock = createFullscreenEscapeLock(harness.win);
  lock.start();
  assert.deepStrictEqual(harness.calls, [['lock', ['Escape']]]);
  lock.start();
  assert.strictEqual(harness.calls.length, 1, 'a second start should not lock again');
  lock.stop();
  assert.deepStrictEqual(harness.calls, [['lock', ['Escape']], ['unlock']]);
  assert.strictEqual(harness.listeners.has('fullscreenchange'), false);
  lock.stop();
  assert.strictEqual(harness.calls.length, 2, 'a second stop should not unlock again');
}

// Not fullscreen (or only the window is): nothing is locked or released.
{
  const harness = createHarness();
  const lock = createFullscreenEscapeLock(harness.win);
  lock.start();
  lock.stop();
  assert.deepStrictEqual(harness.calls, []);
}

// Fullscreen entered and left while the overlay is open.
{
  const harness = createHarness();
  const lock = createFullscreenEscapeLock(harness.win);
  lock.start();
  harness.setFullscreen(true);
  assert.deepStrictEqual(harness.calls, [['lock', ['Escape']]]);
  harness.setFullscreen(false);
  assert.deepStrictEqual(harness.calls, [['lock', ['Escape']], ['unlock']]);
  lock.stop();
  assert.strictEqual(harness.calls.length, 2, 'stop should not release a lock already released');
}

// A fullscreen change after the overlay closed is ignored.
{
  const harness = createHarness();
  const lock = createFullscreenEscapeLock(harness.win);
  lock.start();
  lock.stop();
  harness.setFullscreen(true);
  assert.deepStrictEqual(harness.calls, []);
}

// Browsers without the Keyboard Lock API, and a refused lock, stay quiet.
{
  const harness = createHarness({ fullscreen: true, withoutKeyboard: true });
  const lock = createFullscreenEscapeLock(harness.win);
  lock.start();
  lock.stop();
  assert.strictEqual(harness.listeners.size, 0);
}
{
  const harness = createHarness({ fullscreen: true, rejectLock: true });
  const lock = createFullscreenEscapeLock(harness.win);
  lock.start();
  lock.stop();
  assert.deepStrictEqual(harness.calls, [['lock', ['Escape']], ['unlock']]);
}

console.log('overlay fullscreen escape lock tests passed');
