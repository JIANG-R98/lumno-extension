const assert = require('assert');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const historyApi = require(path.join(repoRoot, 'src/shared/search/search-input-history.js'));
const shortcutReference = require(path.join(repoRoot, 'src/shared/shortcut-reference.js'));
const { SURFACES, openSearchSurface } = require('../helpers/search-surfaces');
const { getInjectedScripts, getPageScripts } = require('../helpers/runtime-scripts');

function createStorage(initialValue) {
  const state = {
    [historyApi.STORAGE_KEY]: initialValue
  };
  return {
    state,
    get(keys, callback) {
      const result = {};
      keys.forEach((key) => {
        result[key] = state[key];
      });
      callback(result);
    },
    set(payload) {
      Object.assign(state, payload);
    }
  };
}

async function testHistoryNavigationRestoresDraft() {
  const storage = createStorage(['first query', 'second query']);
  const controller = historyApi.createSearchInputHistoryController({
    storageArea: storage
  });
  await controller.load();

  assert.deepStrictEqual(
    controller.move('previous', 'unfinished draft'),
    { handled: true, value: 'second query' }
  );
  assert.deepStrictEqual(
    controller.move('previous', 'second query'),
    { handled: true, value: 'first query' }
  );
  assert.deepStrictEqual(
    controller.move('next', 'first query'),
    { handled: true, value: 'second query' }
  );
  assert.deepStrictEqual(
    controller.move('next', 'second query'),
    { handled: true, value: 'unfinished draft' }
  );
}

async function testRecordDeduplicatesAndPersists() {
  const storage = createStorage(['one', 'two', 'one']);
  const controller = historyApi.createSearchInputHistoryController({
    maxEntries: 3,
    storageArea: storage
  });
  await controller.load();

  assert.deepStrictEqual(controller.getEntries(), ['two', 'one']);
  assert.strictEqual(controller.record('  three  '), true);
  assert.strictEqual(controller.record('two'), true);
  assert.deepStrictEqual(controller.getEntries(), ['one', 'three', 'two']);
  assert.deepStrictEqual(
    storage.state[historyApi.STORAGE_KEY],
    ['one', 'three', 'two']
  );
}

function testShortcutDetection() {
  assert.strictEqual(
    historyApi.getShortcutDirection({
      key: 'ArrowUp',
      code: 'ArrowUp',
      ctrlKey: false,
      altKey: true,
      metaKey: false,
      shiftKey: false
    }),
    'previous'
  );
  assert.strictEqual(
    historyApi.getShortcutDirection({
      key: 'ArrowDown',
      code: 'ArrowDown',
      ctrlKey: false,
      altKey: true,
      metaKey: false,
      shiftKey: false
    }),
    'next'
  );
  assert.strictEqual(
    historyApi.getShortcutDirection({
      key: 'ArrowUp',
      code: 'ArrowUp',
      ctrlKey: false,
      altKey: true,
      metaKey: false,
      shiftKey: true
    }),
    ''
  );
}

// Alt+Up / Alt+Down walk through what was submitted before, on both search
// surfaces, and come back to the unfinished draft.
async function testSurfacesWalkTheHistory(name) {
  const history = { [historyApi.STORAGE_KEY]: ['first query', 'second query'] };
  const surface = await openSearchSurface(name, name === 'overlay' ? { localSettings: history } : { local: history });
  await surface.settle(80);
  await surface.type('unfinished draft');
  const step = async (key) => {
    surface.press(key, { altKey: true });
    await surface.settle(40);
    return surface.input().value;
  };
  assert.deepStrictEqual([await step('ArrowUp'), await step('ArrowUp'), await step('ArrowDown'), await step('ArrowDown')],
    ['second query', 'first query', 'second query', 'unfinished draft'], `${name}: Alt+arrows should walk the submitted input`);
  surface.close();
}

function testShortcutIsListed() {
  const listed = shortcutReference.getShortcutReferenceGroups()
    .flatMap((group) => group.items || group.shortcuts || [])
    .concat(shortcutReference.getFixedShortcutDefinitions());
  assert.ok(listed.some((item) => item.shortcut === 'Alt+ArrowUp / Alt+ArrowDown'),
    'the shortcut reference in Settings should list the input history shortcut');
  assert.ok(getPageScripts('newtab.html').includes('src/shared/search/search-input-history.js'));
  assert.ok(getInjectedScripts('overlay').includes('src/shared/search/search-input-history.js'));
}

(async () => {
  await testHistoryNavigationRestoresDraft();
  await testRecordDeduplicatesAndPersists();
  testShortcutDetection();
  for (const name of SURFACES) {
    await testSurfacesWalkTheHistory(name);
  }
  testShortcutIsListed();
  console.log('search input history tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
