const assert = require('assert');
const { JSDOM } = require('jsdom');
const settings = require('../../src/domain/settings');
const { createSyncSection } = require('../../src/options/options-sync-section');

const KEY = settings.BOOKMARK_VIEW_MODE_STORAGE_KEY;
const [V2_HEAD, V2_CHUNK_2] = settings.NEWTAB_SHORTCUTS_V2_STORAGE_KEYS;

function createSection(sync, local, options) {
  const config = options || {};
  const { document } = new JSDOM('').window;
  const writes = [];
  const rendered = [];
  let syncReads = 0;
  // No remove() or clear(): migration must never delete anything.
  const storageArea = {
    get(keys, callback) {
      syncReads += 1;
      const values = typeof config.syncAfterFirstRead === 'object' && syncReads > 1
        ? Object.assign({}, sync, config.syncAfterFirstRead)
        : sync;
      callback(Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]])));
    },
    set(payload) {
      writes.push(payload);
    }
  };
  const localStorageArea = {
    get(keys, callback) {
      callback(Object.fromEntries(keys.filter((key) => key in local).map((key) => [key, local[key]])));
    }
  };
  const section = createSyncSection({
    beginToast: () => ({ cancel() {}, done() {}, fail() {} }),
    browserName: 'Edge',
    chromeApi: { runtime: { lastError: null }, storage: {} },
    documentObj: document,
    onRender: (model) => rendered.push(model),
    refreshSyncNowTooltip() {},
    formatTemplate: (text, params) => String(text).replace(/\{(\w+)\}/g, (m, k) => (params && k in params ? params[k] : m)),
    getActivePrimaryAreaName: () => config.primary || 'sync',
    getMessage: (key, fallback) => fallback,
    localStorageArea,
    settings,
    showToast() {},
    storageArea,
    syncTransfer: null
  });
  return { section, writes, model: () => rendered[rendered.length - 1] };
}

// Settings older versions kept only in local storage move into browser sync,
// unless sync gained a value meanwhile.
{
  const moved = createSection({}, { [KEY]: 'folder' });
  moved.section.migrateStorageIfNeeded([KEY]);
  assert.deepStrictEqual(moved.writes, [{ [KEY]: 'folder' }]);

  const raced = createSection({}, { [KEY]: 'folder' }, { syncAfterFirstRead: { [KEY]: 'top' } });
  raced.section.migrateStorageIfNeeded([KEY]);
  assert.deepStrictEqual(raced.writes, [], 'a value synced in the meantime is not overwritten');

  const present = createSection({ [KEY]: 'top' }, { [KEY]: 'folder' });
  present.section.migrateStorageIfNeeded([KEY]);
  assert.deepStrictEqual(present.writes, []);

  const localPrimary = createSection({}, { [KEY]: 'folder' }, { primary: 'local' });
  localPrimary.section.migrateStorageIfNeeded([KEY]);
  assert.deepStrictEqual(localPrimary.writes, [], 'nothing moves while local storage is primary');
}

// Grouped shortcuts move only as a whole save, never chunk by chunk.
{
  const partial = createSection({}, { [V2_CHUNK_2]: ['b'] });
  partial.section.migrateStorageIfNeeded(settings.NEWTAB_SHORTCUTS_V2_STORAGE_KEYS);
  assert.deepStrictEqual(partial.writes, []);
  const whole = createSection({ [V2_CHUNK_2]: ['stray'] }, { [V2_HEAD]: { v: 2 }, [V2_CHUNK_2]: ['b'] });
  whole.section.migrateStorageIfNeeded(settings.NEWTAB_SHORTCUTS_V2_STORAGE_KEYS);
  assert.deepStrictEqual(whole.writes, [{ [V2_HEAD]: { v: 2 }, [V2_CHUNK_2]: ['b'] }],
    'the whole local save moves with its head, replacing a stray chunk in sync');
  const headed = createSection({}, { [V2_HEAD]: { v: 2 }, [V2_CHUNK_2]: ['b'] }, { syncAfterFirstRead: { [V2_HEAD]: { v: 3 } } });
  headed.section.migrateStorageIfNeeded(settings.NEWTAB_SHORTCUTS_V2_STORAGE_KEYS);
  assert.deepStrictEqual(headed.writes, [], 'once sync has its own grouped save, no local chunk moves');
}

// The status line and buttons follow whether settings can sync.
{
  const page = createSection({}, {});
  assert.strictEqual(page.model().title, 'Edge 内置同步', 'the card names the browser it syncs through');
  page.section.refreshSyncStatus();
  assert.strictEqual(page.model().status.tone, 'success');
  assert.strictEqual(page.model().status.text, '同步已开启');
  assert.strictEqual(page.model().available, true);
  page.section.updateSyncStatusText('sync_status_failed_reason', '同步失败：{reason}', { reason: 'quota' });
  assert.strictEqual(page.model().status.tone, 'danger');
  assert.match(page.model().status.tooltip, /同步不可用/, 'a failure explains what to check');
  assert.strictEqual(page.model().status.text, '同步失败：quota');
}

// Without a storage area nothing can sync, and the buttons say so.
{
  const rendered = [];
  const section = createSyncSection({
    beginToast: () => ({ cancel() {}, done() {}, fail() {} }),
    browserName: 'Chrome',
    chromeApi: { runtime: { lastError: null }, storage: {} },
    documentObj: new JSDOM('').window.document,
    onRender: (model) => rendered.push(model),
    refreshSyncNowTooltip() {},
    formatTemplate: (text) => text,
    getActivePrimaryAreaName: () => 'sync',
    getMessage: (key, fallback) => fallback,
    localStorageArea: null,
    settings,
    showToast() {},
    storageArea: null,
    syncTransfer: null
  });
  section.refreshSyncStatus();
  const model = rendered[rendered.length - 1];
  assert.strictEqual(model.available, false);
  assert.strictEqual(model.status.text, '同步不可用');
  assert.strictEqual(model.summary, '');
}

// The shortcut note says how many shortcuts browser sync carries.
{
  const page = createSection({}, {});
  page.section.refreshShortcutSyncSummary();
  assert.match(page.model().summary, /^Shortcuts: all \d+ sync with the browser\.$/,
    'shortcuts that fit all travel with browser sync');
}

console.log('Options sync section tests passed.');
