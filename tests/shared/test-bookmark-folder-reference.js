const assert = require('assert');
const refs = require('../../src/shared/bookmark-folder-reference.ts');
const shortcuts = require('../../src/newtab/shortcuts/shortcuts-store.ts');
const settings = require('../../src/shared/settings.ts');
const drag = require('../../src/newtab/cross-surface-drag.ts');
const { openDragPage } = require('../helpers/newtab-drag-page');

function tree(folderId = '42', rootId = '1', rootTitle = '书签栏') {
  return [{ id: '0', children: [{ id: rootId, parentId: '0', title: rootTitle,
    folderType: 'bookmarks-bar', syncing: true, children: [{ id: folderId, parentId: rootId,
      title: '灵感', children: [{ id: `${folderId}-url`, parentId: folderId,
        title: 'Design', url: 'https://example.com/design' }] }] }] }];
}
function device(initial = {}, nodes = tree()) {
  const listeners = [];
  const events = {};
  const chrome = { runtime: { lastError: null }, storage: { onChanged: { addListener(fn) { listeners.push(fn); } } },
    bookmarks: { getTree(fn) { fn(structuredClone(nodes)); } } };
  for (const name of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded']) {
    events[name] = [];
    chrome.bookmarks[name] = { addListener(fn) { events[name].push(fn); } };
  }
  for (const name of ['local', 'sync']) {
    const values = structuredClone(initial[name] || {});
    chrome.storage[name] = { values, QUOTA_BYTES: 102400,
      get(keys, fn) { fn(keys === null ? structuredClone(values) : Object.fromEntries(keys.filter((key) =>
        Object.hasOwn(values, key)).map((key) => [key, structuredClone(values[key])]))); },
      set(payload, fn) {
        const changes = {};
        for (const [key, value] of Object.entries(payload)) {
          if (JSON.stringify(value) !== JSON.stringify(values[key])) changes[key] = { newValue: structuredClone(value) };
          values[key] = structuredClone(value);
        }
        if (Object.keys(changes).length) listeners.forEach((listener) => listener(changes, name));
        if (fn) fn();
      }
    };
  }
  return { chrome, setTree(value, name = 'onChanged') { nodes = value; events[name].forEach((fn) => fn()); } };
}
function entry(map, id = 'entry-a', folderId = '42') {
  return shortcuts.createShortcutRecord({ id, type: 'folder', title: '灵感', folderRef: refs.describe(folderId, map) }, { now: 1 });
}

async function run() {
  const aMap = refs.buildNodeMap(tree());
  const item = entry(aMap);
  const bMap = refs.buildNodeMap(tree('117', '900', 'Bookmarks bar'));
  assert.strictEqual(refs.resolveReference(item.folderRef, bMap).id, '117', 'root labels and IDs are device-local');
  const firefoxNodes = [{ id: 'root________', children: [{ id: 'toolbar_____', parentId: 'root________',
    title: 'Bookmarks Toolbar', children: [{ id: 'ffFolder0001', parentId: 'toolbar_____', title: '灵感',
      children: [{ id: 'ffBookmark01', parentId: 'ffFolder0001', title: 'Design',
        url: 'https://example.com/design' }] }] }] }];
  const firefoxMap = refs.buildNodeMap(firefoxNodes);
  assert.strictEqual(refs.resolveReference(item.folderRef, firefoxMap).id, 'ffFolder0001',
    'a folder referenced in Chrome resolves in Firefox, whose roots use GUIDs');
  assert.strictEqual(refs.describe('ffFolder0001', firefoxMap).root, 'bookmarks-bar');
  assert.strictEqual(refs.describe('root________', firefoxMap), null, 'the Firefox tree root is not a folder target');
  const menuNodes = [{ id: 'root________', children: [{ id: 'menu________', parentId: 'root________',
    title: 'Bookmarks Menu', children: [{ id: 'ffMenuFold01', parentId: 'menu________', title: 'Reading', children: [] }] }] }];
  const menuRef = refs.describe('ffMenuFold01', refs.buildNodeMap(menuNodes));
  assert.strictEqual(menuRef.root, 'other',
    'Firefox menu folders use a root type that existing clients accept, since references sync through WebDAV');
  assert(!Object.hasOwn(item, 'folderId'), 'portable records contain no numeric bookmark ID');
  const generated = shortcuts.createShortcutRecord({ type: 'folder', folderRef: item.folderRef });
  assert(generated.id && generated.id.startsWith('shortcut-folder-'));
  assert.deepStrictEqual(shortcuts.normalizeShortcuts([generated]), [generated], 'normalization keeps the entry identity');
  assert.strictEqual(shortcuts.normalizeShortcutItem({ ...item, id: '' }), null,
    'a malformed portable record cannot generate a different binding identity on every read');
  assert.strictEqual(refs.normalizeReference({ ...item.folderRef, path: ['x'.repeat(1025)] }), null);
  assert.strictEqual(refs.normalizeReference({ ...item.folderRef, fingerprint: 'invalid' }), null);
  assert.strictEqual(refs.resolveReference(item.folderRef, new Map()), null);

  const duplicate = tree('117');
  const duplicateRoot = duplicate[0].children[0];
  duplicateRoot.children.push({ ...structuredClone(duplicateRoot.children[0]), id: '118' });
  assert.strictEqual(refs.resolveReference(item.folderRef, refs.buildNodeMap(duplicate)), null, 'identical candidates remain hidden');
  duplicateRoot.children[1].children[0].url = 'https://different.example/';
  assert.strictEqual(refs.resolveReference(item.folderRef, refs.buildNodeMap(duplicate)).id, '117', 'content disambiguates duplicate paths');
  const localTree = tree();
  localTree[0].children[0].syncing = false;
  assert.strictEqual(refs.resolveReference(refs.describe('42', refs.buildNodeMap(localTree)), aMap), null,
    'local-only folders never attach to another device through matching names');
  const reordered = tree();
  reordered[0].children[0].children[0].children.push({ id: 'another', title: 'Other', url: 'https://other.example/' });
  const refBefore = refs.describe('42', refs.buildNodeMap(reordered));
  reordered[0].children[0].children[0].children.reverse();
  assert.deepStrictEqual(refs.describe('42', refs.buildNodeMap(reordered)), refBefore, 'item order is not target identity');

  const a = device();
  const aRuntime = refs.createRuntime({ chrome: a.chrome });
  await aRuntime.ready;
  aRuntime.bind(item.id, '42');
  await aRuntime.flush();
  const restarted = refs.createRuntime({ chrome: a.chrome });
  await restarted.ready;
  assert.strictEqual(restarted.getNode(item, aMap).id, '42', 'drag-selected binding survives restart');

  const b = device();
  const bRuntime = refs.createRuntime({ chrome: b.chrome });
  await bRuntime.ready;
  const before = shortcuts.createShortcutRecord({ id: 'before', url: 'https://before.example/' }, { now: 1 });
  const after = shortcuts.createShortcutRecord({ id: 'after', url: 'https://after.example/' }, { now: 1 });
  const complete = [before, item, after];
  assert.deepStrictEqual(bRuntime.visibleItems(complete, new Map()).map((row) => row.id), ['before', 'after']);
  assert.deepStrictEqual(complete.map((row) => row.id), ['before', item.id, 'after'], 'hiding preserves original order and list');
  assert.deepStrictEqual(bRuntime.visibleItems(complete, bMap).map((row) => row.id), ['before', item.id, 'after']);
  await bRuntime.flush();
  assert.strictEqual(b.chrome.storage.local.values[refs.BINDINGS_KEY][item.id].folderId, '117');
  assert(!Object.keys(b.chrome.storage.sync.values).includes(refs.BINDINGS_KEY));

  const moved = tree('117', '900');
  moved[0].children[0].children[0].title = '新名字';
  moved[0].children[0].children[0].children[0].url = 'https://updated.example/';
  const movedMap = refs.buildNodeMap(moved);
  const refreshed = bRuntime.reconcile(complete, movedMap);
  assert.deepStrictEqual(refreshed[1].folderRef.path, ['新名字']);
  assert.strictEqual(bRuntime.visibleItems(refreshed, movedMap)[1].folderId, '117', 'existing binding follows edits without re-selection');
  const recreated = refs.buildNodeMap(tree('118', '900'));
  assert.strictEqual(bRuntime.getNode(item, recreated), null, 'deleted bindings never attach to a replacement folder');

  const legacy = shortcuts.createShortcutRecord({ type: 'folder', folderId: '42', title: '灵感' }, { now: 1 });
  const legacyRuntime = refs.createRuntime({ chrome: device().chrome });
  await legacyRuntime.ready;
  assert.strictEqual(legacyRuntime.reconcile([legacy], aMap)[0].folderRef.path[0], '灵感');
  assert.strictEqual(legacyRuntime.reconcile([{ ...legacy, id: 'untrusted', folderId: '117' }], aMap)[0].folderRef, undefined,
    'a legacy numeric ID from another profile is not trusted');


  const other = entry(aMap, 'entry-other');
  await shortcuts.saveShortcuts(b.chrome.storage.sync, [item, other]);
  await shortcuts.saveShortcuts(b.chrome.storage.sync, [{ ...item, title: 'Updated' }, other]);
  assert.strictEqual((await shortcuts.loadShortcuts(b.chrome.storage.sync)).length, 2, 'saving one portable entry preserves other folders');
  const plan = drag.planBookmarkToShortcut({ shortcuts: [item], record: legacy, index: 1, maxShortcuts: 1,
    getFolderId: (row) => row.folderId || aRuntime.getNode(row, aMap)?.id });
  assert.strictEqual(plan.shortcutId, item.id, 'repeat drag uses the existing portable entry');

  const sourceDevice = device({ sync: { [shortcuts.LEGACY_SHORTCUTS_KEY]: [legacy] } });
  const controller = refs.createSyncController({ chrome: sourceDevice.chrome, settings, shortcuts });
  controller.start();
  await controller.refresh();
  await controller.refresh();
  const migrated = await shortcuts.loadShortcuts(sourceDevice.chrome.storage.sync);
  assert(migrated[0].folderRef, 'background migrates old entries without an open new-tab');
  assert(!Object.hasOwn(migrated[0], 'folderId'));
  const renamed = tree();
  renamed[0].children[0].children[0].title = 'Moved';
  sourceDevice.setTree(renamed);
  await controller.refresh();
  assert.deepStrictEqual((await shortcuts.loadShortcuts(sourceDevice.chrome.storage.sync))[0].folderRef.path, ['Moved']);
  const originalFolder = renamed[0].children[0].children[0];
  originalFolder.parentId = '88';
  renamed[0].children[0].children = [{ id: '88', parentId: '1', title: 'Design', children: [originalFolder] }];
  sourceDevice.setTree(renamed, 'onMoved');
  await controller.refresh();
  assert.deepStrictEqual((await shortcuts.loadShortcuts(sourceDevice.chrome.storage.sync))[0].folderRef.path, ['Design', 'Moved']);
  assert.strictEqual(sourceDevice.chrome.storage.sync.values[refs.BINDINGS_KEY], undefined);

  // New Tab saves a site dragged out of a shortcut folder, then removes its
  // bookmark. When that save lands while the background is still updating
  // the folder's reference, the background must not write its older list
  // over it, or the site is gone from both places.
  const raceDevice = device({ local: { [refs.BINDINGS_KEY]: { 'entry-a': { folderId: '42' } } } });
  const site = shortcuts.createShortcutRecord({ url: 'https://example.com/site', title: 'Site' }, { now: 2 });
  await shortcuts.saveShortcuts(raceDevice.chrome.storage.sync, [entry(aMap)]);
  const raceTree = tree();
  raceTree[0].children[0].children[0].children = [];
  raceDevice.setTree(raceTree);
  const readTree = raceDevice.chrome.bookmarks.getTree;
  let newTabSaved = false;
  raceDevice.chrome.bookmarks.getTree = (fn) => readTree((nodes) => {
    if (newTabSaved) { fn(nodes); return; }
    newTabSaved = true;
    shortcuts.saveShortcuts(raceDevice.chrome.storage.sync, [entry(aMap), site]).then(() => fn(nodes));
  });
  await refs.createSyncController({ chrome: raceDevice.chrome, settings, shortcuts }).refresh();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const afterRace = await shortcuts.loadShortcuts(raceDevice.chrome.storage.sync);
  assert.deepStrictEqual(afterRace.map((row) => row.title), ['灵感', 'Site'],
    'a save made while the background reconciles is kept');
  assert.strictEqual(afterRace[0].folderRef.fingerprint, refs.describe('42', refs.buildNodeMap(raceTree)).fingerprint,
    'and the folder reference is still brought up to date');
  console.log('Folder reference tests passed: per-device IDs, direct binding, hidden/recovered order, ambiguity, legacy migration, background edits and isolated storage.');
}

// On New Tab: a folder entry this device cannot bind stays stored but hidden,
// moving the visible shortcuts keeps it, and a dropped folder binds the
// folder that was dragged even when it has an identical sibling.
async function runPage() {
  const folderRef = refs.describe('42', refs.buildNodeMap(tree()));
  const stored = async (drag) => (await shortcuts.loadShortcuts(drag.page.storage.sync)).map((row) => row.id);
  const hidden = await openDragPage({
    shortcuts: [
      { id: 'before', url: 'https://before.example/', title: 'Before' },
      { id: 'entry-a', type: 'folder', title: '灵感', folderRef },
      { id: 'after', url: 'https://after.example/', title: 'After' }
    ],
    bookmarks: [{ id: '200', title: 'Docs', url: 'https://docs.example/' }]
  });
  assert.deepStrictEqual(hidden.shortcuts(), ['Before', 'After'], 'an unbound folder entry is hidden on this device');
  assert.deepStrictEqual(await stored(hidden), ['before', 'entry-a', 'after'], 'and its sync record is kept in place');
  await hidden.dragTo(hidden.tile('After'), hidden.shortcutSlot(0));
  assert.deepStrictEqual(hidden.shortcuts(), ['After', 'Before']);
  assert.deepStrictEqual(await stored(hidden), ['after', 'before', 'entry-a'], 'visible reorder does not discard hidden entries');
  hidden.close();

  const twin = (id) => ({ id, title: '灵感', children: [{ id: `${id}-url`, title: 'Design', url: 'https://example.com/design' }] });
  const drop = await openDragPage({ shortcuts: [{ id: 'x', url: 'https://x.example/', title: 'X' }], bookmarks: [twin('117'), twin('118')] });
  await drop.dragTo(drop.card('118'), drop.shortcutSlot(0));
  assert.strictEqual(drop.toast(), 'Folder added to shortcuts', 'a selected folder is added without asking');
  const [added] = await shortcuts.loadShortcuts(drop.page.storage.sync);
  assert.ok(added.folderRef && !Object.hasOwn(added, 'folderId'), 'the synced entry is portable');
  assert.strictEqual(drop.page.storage.local.data[refs.BINDINGS_KEY][added.id].folderId, '118',
    'the drop binds the dragged folder on this device even with an identical sibling');
  drop.clearToast();
  await drop.dragTo(drop.card('118'), drop.shortcutSlot(0));
  const again = await shortcuts.loadShortcuts(drop.page.storage.sync);
  assert.deepStrictEqual(again.map((row) => row.id), [added.id, 'x'], 'a repeat drop keeps the existing entry');
  drop.close();

  // With every entry hidden there is nothing to show but the add button,
  // which is gone at capacity.
  const elsewhere = refs.buildNodeMap(Array.from({ length: shortcuts.DEFAULT_MAX_SHORTCUTS }, (_, index) => tree(`f${index}`)).reduce((all, next) => {
    all[0].children[0].children.push(...next[0].children[0].children.map((node) => ({ ...node, title: node.id })));
    return all;
  }, tree('unused')));
  const unbound = (count) => Array.from({ length: count }, (_, index) => ({
    id: `hidden-${index}`, type: 'folder', title: `f${index}`, folderRef: refs.describe(`f${index}`, elsewhere)
  }));
  const rail = async (count) => {
    const page = await openDragPage({ shortcuts: unbound(count), bookmarks: [] });
    const visible = page.page.document.querySelector('.x-nt-shortcuts-section').getAttribute('data-visible');
    page.close();
    return visible;
  };
  assert.strictEqual(await rail(shortcuts.DEFAULT_MAX_SHORTCUTS), 'false', 'all-hidden entries at capacity do not leave an empty rail');
  assert.strictEqual(await rail(2), 'true', 'the add button remains available below capacity');
}

run().then(runPage).then(() => process.exit(process.exitCode || 0)).catch((error) => { console.error(error); process.exit(1); });
