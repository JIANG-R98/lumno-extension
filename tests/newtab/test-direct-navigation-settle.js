const assert = require('assert');
const path = require('path');

const {
  createDirectNavigationSettleController
} = require(path.join('..', '..', 'src', 'newtab', 'search', 'direct-navigation-settle.ts'));

let nextTimerId = 1;
const timers = new Map();
const clearedTimerIds = [];
const settledContexts = [];
const controller = createDirectNavigationSettleController({
  delayMs: 120,
  setTimeout(callback, delayMs) {
    const timerId = nextTimerId;
    nextTimerId += 1;
    timers.set(timerId, { callback, delayMs });
    return timerId;
  },
  clearTimeout(timerId) {
    clearedTimerIds.push(timerId);
    timers.delete(timerId);
  },
  onSettle(context) {
    settledContexts.push(context);
  }
});

controller.schedule({ query: 'first.example', requestSeq: 1 });
assert.strictEqual(controller.isPending(), true);
assert.strictEqual(timers.get(1).delayMs, 120);

controller.schedule({ query: 'second.example', requestSeq: 2 });
assert.deepStrictEqual(clearedTimerIds, [1], 'a newer request should cancel the previous settle timer');
assert.strictEqual(timers.has(1), false);
assert.strictEqual(timers.has(2), true);

timers.get(2).callback();
assert.strictEqual(controller.isPending(), false);
assert.deepStrictEqual(
  settledContexts,
  [{ query: 'second.example', requestSeq: 2 }],
  'only the latest request context should settle'
);
assert.strictEqual(controller.cancel(), false, 'cancelling an idle controller should be a no-op');

controller.schedule({ query: 'cancelled.example', requestSeq: 3 });
assert.strictEqual(controller.cancel(), true);
assert.strictEqual(controller.isPending(), false);
assert.strictEqual(timers.has(3), false);

console.log('direct navigation settle controller tests passed');
