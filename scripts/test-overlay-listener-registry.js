const assert = require('assert');
const fs = require('fs');

delete globalThis.LumnoOverlayLifecycle;
require('../src/overlay/lifecycle.js');

const lifecycle = globalThis.LumnoOverlayLifecycle;
const activeListeners = new Set();
const eventTarget = {
  addListener(listener) {
    activeListeners.add(listener);
  },
  removeListener(listener) {
    activeListeners.delete(listener);
  }
};
const registry = lifecycle.createChromeEventListenerRegistry(eventTarget);
const first = () => {};
const second = () => {};

assert.strictEqual(registry.add(first), first);
assert.strictEqual(registry.add(first), first);
assert.strictEqual(registry.add(second), second);
assert.strictEqual(registry.add(null), null);
assert.strictEqual(registry.size, 2);
assert.strictEqual(activeListeners.size, 2);
assert.strictEqual(registry.remove(first), true);
assert.strictEqual(registry.remove(first), false);
assert.strictEqual(registry.size, 1);
assert.strictEqual(activeListeners.has(first), false);
registry.clear();
assert.strictEqual(registry.size, 0);
assert.strictEqual(activeListeners.size, 0);

const unavailableRegistry = lifecycle.createChromeEventListenerRegistry(null);
assert.strictEqual(unavailableRegistry.add(first), null);
assert.strictEqual(unavailableRegistry.size, 0);

const searchPanelSource = fs.readFileSync('src/overlay/search-panel.js', 'utf8');
assert.strictEqual(
  (searchPanelSource.match(/storageChangeListeners\.add\(/g) || []).length,
  18,
  'all overlay storage listeners should be owned by the lifecycle registry'
);
assert.strictEqual(
  (searchPanelSource.match(/storageChangeListeners\.clear\(\)/g) || []).length,
  1,
  'overlay teardown should clear its storage listeners in one place'
);
assert.doesNotMatch(searchPanelSource, /chrome\.storage\.onChanged\.(?:add|remove)Listener/);

console.log('overlay listener registry tests passed');
