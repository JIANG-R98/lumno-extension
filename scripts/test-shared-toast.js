const assert = require('assert');
const path = require('path');

const timers = new Map();
let nextTimerId = 1;
const animationFrames = new Map();
let nextAnimationFrameId = 1;
const windowObj = {
  cancelAnimationFrame(frameId) {
    animationFrames.delete(frameId);
  },
  clearTimeout(timerId) {
    timers.delete(timerId);
  },
  requestAnimationFrame(callback) {
    const frameId = nextAnimationFrameId++;
    animationFrames.set(frameId, callback);
    return frameId;
  },
  setTimeout(callback, duration) {
    const timerId = nextTimerId++;
    timers.set(timerId, { callback, duration });
    return timerId;
  }
};
function flushAnimationFrame() {
  const entries = Array.from(animationFrames.entries());
  animationFrames.clear();
  entries.forEach(([, callback]) => callback());
}
const styleValues = new Map();
const toastElement = {
  attributes: new Map(),
  style: {
    removeProperty(property) {
      styleValues.delete(property);
    },
    setProperty(property, value) {
      styleValues.set(property, value);
    }
  },
  textContent: '',
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
};

delete global.LumnoToast;
require(path.resolve(__dirname, '../src/shared/toast.js'));

assert.strictEqual(global.LumnoToast.implementation, 'dom');
assert.strictEqual(typeof global.LumnoToast.createToastStyleGate, 'function');

const stylesheetListeners = new Map();
const stylesheetElement = {
  sheet: null,
  addEventListener(type, listener) {
    stylesheetListeners.set(type, listener);
  },
  removeEventListener(type, listener) {
    if (stylesheetListeners.get(type) === listener) {
      stylesheetListeners.delete(type);
    }
  }
};
const styleGate = global.LumnoToast.createToastStyleGate(toastElement, {
  stylesheetElement,
  windowObj
});
assert.strictEqual(styleValues.get('opacity'), '0');
assert.strictEqual(styleValues.get('pointer-events'), 'none');
assert.strictEqual(
  styleValues.get('transform'),
  'translateX(-50%) translateY(-10px)'
);
assert.strictEqual(styleValues.get('transition'), 'none');
assert.strictEqual(styleGate.isReady(), false);
assert.strictEqual(typeof stylesheetListeners.get('load'), 'function');

stylesheetElement.sheet = {};
stylesheetListeners.get('load')();
assert.strictEqual(styleGate.isReady(), true);
assert.strictEqual(styleValues.get('opacity'), '0');
flushAnimationFrame();
assert.strictEqual(styleValues.get('opacity'), '0');
flushAnimationFrame();
assert.strictEqual(styleValues.has('opacity'), false);
assert.strictEqual(styleValues.has('pointer-events'), false);
assert.strictEqual(styleValues.has('transform'), false);
assert.strictEqual(styleValues.has('transition'), false);
assert.strictEqual(stylesheetListeners.has('load'), false);

const controller = global.LumnoToast.createToastController(toastElement, {
  windowObj
});

controller.show('Press Backspace again');
assert.strictEqual(toastElement.textContent, 'Press Backspace again');
assert.strictEqual(toastElement.attributes.get('data-show'), 'true');
assert.strictEqual(timers.size, 1);
assert.strictEqual(Array.from(timers.values())[0].duration, 2200);

controller.hide();
assert.strictEqual(toastElement.attributes.get('data-show'), 'false');
assert.strictEqual(timers.size, 0);

controller.show('Failed', { error: true, duration: 0 });
assert.strictEqual(toastElement.attributes.get('data-tone'), 'error');
assert.strictEqual(styleValues.has('background'), false,
  'the error palette comes from toast.css so its text color can follow');
assert.strictEqual(timers.size, 0);
controller.show('Saved', { duration: 0 });
assert.notStrictEqual(toastElement.attributes.get('data-tone'), 'error');

function runPendingTimers() {
  const entries = Array.from(timers.entries());
  timers.clear();
  entries.forEach(([, timer]) => timer.callback());
}

// A quick task never flashes its loading copy; only the result shows.
controller.hide();
const quickTask = controller.begin('Importing…');
assert.strictEqual(toastElement.attributes.get('data-show'), 'false');
quickTask.done('Imported');
assert.strictEqual(toastElement.textContent, 'Imported');
assert.notStrictEqual(toastElement.attributes.get('data-tone'), 'loading');
controller.hide();

// A slow task shows its loading copy, survives a result message from elsewhere,
// and comes back once that message expires.
const slowTask = controller.begin('Syncing…');
runPendingTimers();
assert.strictEqual(toastElement.attributes.get('data-tone'), 'loading');
assert.strictEqual(toastElement.attributes.get('data-show'), 'true');
assert.strictEqual(toastElement.textContent, 'Syncing…');
controller.show('Saved');
assert.strictEqual(toastElement.textContent, 'Saved');
runPendingTimers();
assert.strictEqual(toastElement.textContent, 'Syncing…');
assert.strictEqual(toastElement.attributes.get('data-tone'), 'loading');
slowTask.fail('Sync failed');
assert.strictEqual(toastElement.attributes.get('data-tone'), 'error');
assert.strictEqual(toastElement.textContent, 'Sync failed');
runPendingTimers();
assert.strictEqual(toastElement.attributes.get('data-show'), 'false');

const cancelledTask = controller.begin('Saving…', { delay: 0 });
assert.strictEqual(toastElement.textContent, 'Saving…');
cancelledTask.cancel();
assert.strictEqual(toastElement.attributes.get('data-show'), 'false');
cancelledTask.done('Ignored after cancel');
assert.strictEqual(toastElement.attributes.get('data-show'), 'false');

controller.destroy();
styleGate.destroy();
controller.show('Ignored');
assert.strictEqual(toastElement.textContent, 'Saving…');
controller.begin('Ignored', { delay: 0 }).done('Ignored');
assert.strictEqual(toastElement.attributes.get('data-show'), 'false');

console.log('shared Toast tests passed');
