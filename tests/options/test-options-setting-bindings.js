const assert = require('assert');
const bindings = require('../../src/options/options-setting-bindings');

function createArea(initial) {
  const values = Object.assign({}, initial);
  const writes = [];
  return {
    values,
    writes,
    get(keys, callback) {
      const result = {};
      keys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(values, key)) result[key] = values[key];
      });
      callback(result);
    },
    set(payload) {
      writes.push(payload);
      Object.assign(values, payload);
    }
  };
}

function createPage(initial, options) {
  const area = createArea(initial);
  const registry = bindings.createStorageChangeRegistry({
    isPrimaryAreaName: (name) => name === ((options && options.primary) || 'sync')
  });
  let refreshes = 0;
  const binder = bindings.createSettingBinder({
    storageArea: area,
    registry,
    refreshCustomSelects: () => { refreshes += 1; }
  });
  return { area, binder, registry, get refreshes() { return refreshes; } };
}

// The registry runs a handler once per event for any of its keys, in
// registration order, and keeps local-area handlers apart from primary ones.
{
  const calls = [];
  const registry = bindings.createStorageChangeRegistry({ isPrimaryAreaName: (name) => name === 'sync' });
  registry.on(['a', 'b'], (changes, area) => calls.push(['ab', Object.keys(changes).sort().join(','), area]));
  registry.on('b', () => calls.push(['b']));
  registry.on('status', () => calls.push(['local-status']), { area: 'local' });
  registry.on(undefined, () => calls.push(['never']));
  registry.dispatch({ a: { newValue: 1 }, b: { newValue: 2 } }, 'sync');
  registry.dispatch({ a: { newValue: 1 } }, 'local');
  registry.dispatch({ status: { newValue: 1 } }, 'local');
  registry.dispatch({ status: { newValue: 1 } }, 'sync');
  registry.dispatch(null, 'sync');
  assert.deepStrictEqual(calls, [['ab', 'a,b', 'sync'], ['b'], ['local-status']]);
}

// A bound setting is read, normalized, applied and repaired at startup, then
// follows storage changes with its own repair and normalization rules.
{
  const page = createPage({ mode: 'bad' });
  const applied = [];
  page.binder.bindSetting({
    key: 'mode',
    normalize: (value) => (value === 'a' || value === 'b' ? value : 'a'),
    normalizeChange: (value) => (value === 'b' ? 'b' : 'a'),
    apply: (value) => applied.push(value),
    repairOnChange: false,
    refreshSelects: true
  });
  assert.deepStrictEqual(applied, ['a']);
  assert.deepStrictEqual(page.area.writes, [{ mode: 'a' }], 'an invalid stored value is written back once');
  assert.strictEqual(page.refreshes, 1);
  page.registry.dispatch({ mode: { newValue: 'zzz' } }, 'sync');
  assert.deepStrictEqual(applied, ['a', 'a']);
  assert.strictEqual(page.area.writes.length, 1, 'changes are not repaired when repairOnChange is false');
  page.registry.dispatch({ mode: { newValue: 'b' } }, 'local');
  assert.deepStrictEqual(applied, ['a', 'a'], 'changes in a non-primary area are ignored');

  const unread = createPage({ other: 1 });
  const unreadApplied = [];
  unread.binder.bindSetting({ key: 'other', normalize: Number, apply: (v) => unreadApplied.push(v), load: false });
  assert.deepStrictEqual(unreadApplied, [], 'load: false leaves the startup read to the section');
  unread.registry.dispatch({ other: { newValue: '3' } }, 'sync');
  assert.deepStrictEqual(unreadApplied, [3]);
  assert.deepStrictEqual(unread.area.writes, [{ other: 3 }], 'changes are repaired by default');
}

// A binder made with area 'local' reads and writes chrome.storage.local and
// follows only its changes, whichever area is primary (device-only settings
// such as the overlay's local fonts).
{
  const local = createArea({ fontKey: 'PingFang SC' });
  const registry = bindings.createStorageChangeRegistry({ isPrimaryAreaName: (name) => name === 'sync' });
  const binder = bindings.createSettingBinder({ area: 'local', storageArea: local, registry });
  const applied = [];
  binder.bindSetting({ key: 'fontKey', normalize: (value) => String(value || ''), apply: (value) => applied.push(value) });
  assert.deepStrictEqual(applied, ['PingFang SC'], 'the startup read comes from the local area');
  registry.dispatch({ fontKey: { newValue: 'Zapfino' } }, 'sync');
  assert.deepStrictEqual(applied, ['PingFang SC'], 'a synced copy of the key is ignored');
  registry.dispatch({ fontKey: { newValue: 'Zapfino' } }, 'local');
  assert.deepStrictEqual(applied, ['PingFang SC', 'Zapfino'], 'local changes are followed');
}

console.log('Options setting binding tests passed.');
