const assert = require('assert');
const ORDER = require('../../src/shared/search/search-source-order.js');
const { createSearchSourceOrderController } = require('../../src/options/options-search-source-order.js');

const flush = () => new Promise((resolve) => setImmediate(resolve));

// Restoring the browser content order puts the usual order back as one move
// that undo can step back over, and does nothing when it is already there.
(async () => {
  const writes = [];
  const controller = createSearchSourceOrderController({
    document: null,
    read: () => ORDER.withLocal(ORDER.normalizeOrder(null), ['history', 'topSite', 'bookmark']),
    write: (value) => { writes.push(value); }
  });
  await controller.load();
  assert.strictEqual(controller.isLocalDefault(), false);

  await controller.resetLocal();
  assert.strictEqual(controller.isLocalDefault(), true);
  assert.deepStrictEqual(controller.getOrder().local, ['topSite', 'bookmark', 'history']);
  assert.strictEqual(writes.length, 1);

  await controller.resetLocal();
  assert.strictEqual(writes.length, 1);

  assert.strictEqual(controller.undo(), true);
  await flush();
  assert.deepStrictEqual(controller.getOrder().local, ['history', 'topSite', 'bookmark']);
  assert.strictEqual(controller.isLocalDefault(), false);

  controller.destroy();
  console.log('Options search source order tests passed: restore browser content order');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
