const assert = require('assert');
const dragApi = require('../../src/newtab/cross-surface-drag');
const { createNewtabPage } = require('../helpers/newtab-page');

// Dropping one website shortcut onto the middle of another stacks them into a
// new bookmarks-bar folder, shown as a folder shortcut, with undo (⌘Z) and
// redo (⇧⌘Z). The drags run through New Tab's pointer handling on boxes
// from fake-layout.js.

const site = (id) => ({ url: `https://${id}.example/`, title: id[0].toUpperCase() + id.slice(1) });
const planSite = (id) => ({ id, title: id[0].toUpperCase() + id.slice(1), url: `https://${id}.example/` });
const TILE = { left: 300, top: 400, width: 64, height: 64, gap: 8 };

async function openNewtab(options) {
  const config = options || {};
  const page = await createNewtabPage({
    layout: true,
    shortcuts: config.shortcuts || [site('one'), site('two'), site('three')],
    bookmarks: [{ id: '50', title: 'Existing', url: 'https://existing.example/' }].concat(config.bookmarks || [])
  });
  await page.settle(250);
  const doc = page.document;
  const tiles = () => Array.from(doc.querySelectorAll('.x-nt-shortcut-tile:not(.x-nt-shortcut-tile--add)'));
  const grid = tiles()[0].parentElement;
  page.layout.place(grid, { left: 300, top: 400, width: 400, height: 80 });
  page.layout.flow(grid, '.x-nt-shortcut-tile', TILE);
  const tile = (title) => tiles().find((item) => item.getAttribute('aria-label') === `Open ${title}`);
  const toast = () => doc.getElementById('_x_extension_toast_2024_unique_').textContent;
  const bar = () => page.bookmarks.find('1').children;
  return {
    page,
    toast,
    bar,
    titles: () => tiles().map((item) => item.getAttribute('aria-label').replace(/^Open /, '')),
    folder: () => bar().find((node) => !node.url) || null,
    // Drags `source` to `x` (a fraction across `target`'s box) and releases.
    async drop(source, target, fraction = 0.5) {
      const box = tile(target).getBoundingClientRect();
      const x = box.left + box.width * fraction;
      await page.drag(tile(source), [[x, box.top + box.height / 2]]);
      await page.settle(200);
    },
    async key(init) {
      page.trusted(doc.body, 'keydown', Object.assign({ key: 'z', code: 'KeyZ', metaKey: true, bubbles: true, cancelable: true }, init));
      await page.settle(300);
    },
    // Makes the next `times` calls to chrome.bookmarks[name] fail ('remove'
    // covers removeTree, which folders use).
    failing(name, times = 1) {
      const api = page.bookmarks;
      let left = times;
      (name === 'remove' ? ['remove', 'removeTree'] : [name]).forEach((method) => {
        const original = api[method];
        api[method] = (...args) => {
          if (left > 0) {
            left -= 1;
            const callback = args.find((arg) => typeof arg === 'function');
            page.window.chrome.runtime.lastError = { message: `${name} failed` };
            if (callback) callback();
            page.window.chrome.runtime.lastError = null;
            return callback ? undefined : Promise.reject(new Error(`${name} failed`));
          }
          return original.apply(api, args);
        };
      });
    }
  };
}

async function testStackTargets() {
  const outer = await openNewtab();
  await outer.drop('Three', 'Two', 0.1);
  assert.strictEqual(outer.folder(), null, 'the outer quarter of a tile keeps reordering');
  assert.strictEqual(outer.titles().length, 3);
  outer.page.close();

  const folders = await openNewtab({
    shortcuts: [{ type: 'folder', folderId: '60', title: 'Docs' }, site('two'), site('three')],
    bookmarks: [{ id: '60', title: 'Docs', children: [] }]
  });
  await folders.drop('Docs', 'Two');
  assert.strictEqual(folders.bar().filter((node) => !node.url).length, 1, 'a folder shortcut does not stack');
  await folders.drop('Three', 'Docs');
  assert.deepStrictEqual(folders.bar().filter((node) => !node.url).map((node) => node.title), ['Docs'], 'a folder tile takes the site in, it does not stack');
  assert.ok(folders.page.bookmarks.find('60').children.some((node) => node.url === 'https://three.example/'));
  folders.page.close();
}

async function testStackUndoRedo() {
  const newtab = await openNewtab();
  await newtab.drop('Three', 'Two');
  const created = newtab.folder();
  assert.ok(created, 'dropping onto the middle of a site should stack them');
  assert.deepStrictEqual([created.title, created.parentId, created.index], ['New folder', '1', 1], 'into a new folder at the end of the bookmarks bar');
  assert.deepStrictEqual(created.children.map((node) => node.url), ['https://two.example/', 'https://three.example/'],
    'with the site dropped onto first');
  assert.deepStrictEqual(newtab.titles(), ['One', 'New folder'], 'the folder takes the target\'s place among the shortcuts');
  assert.match(newtab.toast(), /^Folder created · ⌘Z to undo$/);

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await newtab.key({});
    assert.deepStrictEqual(newtab.titles(), ['One', 'Two', 'Three'], 'undo should bring both sites back');
    assert.deepStrictEqual(newtab.bar().map((node) => node.title), ['Existing'], 'and remove the folder');
    await newtab.key({ shiftKey: true });
    assert.deepStrictEqual(newtab.titles(), ['One', 'New folder'], 'redo should stack them again');
    assert.deepStrictEqual(newtab.folder().children.map((node) => node.title), ['Two', 'Three']);
  }

  newtab.page.close();

  // Redo restores the folder under the name and at the place it was left.
  const renamed = await openNewtab();
  await renamed.drop('One', 'Three');
  const folder = renamed.folder();
  await renamed.page.bookmarks.update(folder.id, { title: 'Reading' });
  await renamed.page.bookmarks.move(folder.id, { parentId: '1', index: 0 });
  await renamed.page.settle(150);
  await renamed.key({});
  await renamed.key({ shiftKey: true });
  assert.deepStrictEqual([renamed.folder().title, renamed.folder().index], ['Reading', 0], 'redo should restore the folder as it was left');
  renamed.page.close();

  const changed = await openNewtab();
  await changed.drop('Three', 'Two');
  await changed.page.bookmarks.create({ parentId: changed.folder().id, title: 'Later', url: 'https://later.example/' });
  await changed.page.settle(150);
  await changed.key({});
  assert.strictEqual(changed.folder().children.length, 3, 'undo should never delete bookmarks added to the folder later');
  assert.deepStrictEqual(changed.titles(), ['One', 'New folder']);
  changed.page.close();
}

async function testFailuresRollBack() {
  for (const failure of ['create', 'create-child']) {
    const newtab = await openNewtab();
    if (failure === 'create') {
      newtab.failing('create');
    } else {
      // The folder is made, then a site inside it fails.
      const api = newtab.page.bookmarks;
      const create = api.create;
      let count = 0;
      api.create = (...args) => {
        count += 1;
        if (count === 3) {
          const callback = args.find((arg) => typeof arg === 'function');
          newtab.page.window.chrome.runtime.lastError = { message: 'child failed' };
          if (callback) callback();
          newtab.page.window.chrome.runtime.lastError = null;
          return callback ? undefined : Promise.reject(new Error('child failed'));
        }
        return create.apply(api, args);
      };
    }
    await newtab.drop('Three', 'Two');
    assert.deepStrictEqual(newtab.titles(), ['One', 'Two', 'Three'], `${failure}: a failed stack should leave the shortcuts as they were`);
    assert.strictEqual(newtab.folder(), null, `${failure}: and leave no folder behind`);
    await newtab.key({});
    assert.deepStrictEqual(newtab.titles(), ['One', 'Two', 'Three'], `${failure}: with nothing to undo`);
    newtab.page.close();
  }

  const undoFails = await openNewtab();
  await undoFails.drop('Three', 'Two');
  undoFails.failing('remove');
  await undoFails.key({});
  assert.deepStrictEqual(undoFails.titles(), ['One', 'New folder'], 'an undo that cannot remove the folder keeps the stack');
  assert.ok(undoFails.folder());
  await undoFails.key({});
  assert.deepStrictEqual(undoFails.titles(), ['One', 'Two', 'Three'], 'and can be tried again');
  undoFails.page.close();
}

async function testClickStillOpensFolders() {
  // A plain click on a folder tile ends a pointer session without dragging;
  // it must leave the folder menu for the click to toggle.
  const newtab = await openNewtab({
    shortcuts: [{ type: 'folder', folderId: '60', title: 'Docs' }, site('two')],
    bookmarks: [{ id: '60', title: 'Docs', children: [{ id: '61', title: 'A', url: 'https://a.example/' }] }]
  });
  const box = newtab.page.document.querySelector('.x-nt-shortcut-tile--folder').getBoundingClientRect();
  const [x, y] = [box.left + 20, box.top + 20];
  newtab.page.pointer('pointerdown', x, y);
  newtab.page.pointer('pointerup', x, y);
  newtab.page.document.querySelector('.x-nt-shortcut-tile--folder')
    .dispatchEvent(new newtab.page.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
  await newtab.page.settle(200);
  assert.ok(newtab.page.document.querySelector('.x-nt-bookmark-cascade-level[data-open="true"]'), 'clicking a folder tile should open its menu');
  newtab.page.close();
}


(async () => {
  // Pure planning: stacking replaces the target, undo restores both sources.
  const shortcuts = [planSite('one'), planSite('two'), planSite('three')];
  const sources = [{ snapshot: shortcuts[1], index: 1 }, { snapshot: shortcuts[2], index: 2 }];
  const folder = { snapshot: { id: 'stack', type: 'folder' }, index: 1 };
  const stacked = dragApi.planShortcutStack({ shortcuts, sources, folder, maxShortcuts: 10 });
  assert.deepStrictEqual(stacked.map((item) => item.id), ['one', 'stack']);
  assert.deepStrictEqual(dragApi.planShortcutStack({ shortcuts: stacked, sources, folder, undo: true, maxShortcuts: 10 })
    .map((item) => item.id), ['one', 'two', 'three']);
  assert.strictEqual(dragApi.planShortcutStack({ shortcuts: stacked, sources, folder, maxShortcuts: 10 }), null,
    'a folder entry that already exists cannot be stacked again');
  assert.strictEqual(dragApi.planShortcutStack({ shortcuts: shortcuts.slice(0, 2), sources, folder, maxShortcuts: 10 }), null,
    'a missing source blocks the stack');
  assert.strictEqual(dragApi.planShortcutStack({ shortcuts: [...stacked, planSite('two')], sources, folder, undo: true, maxShortcuts: 10 }), null,
    'undo never duplicates a website added again later');

  await testStackTargets();
  await testStackUndoRedo();
  await testFailuresRollBack();
  await testClickStillOpensFolders();
  console.log('Shortcut stacking passed: targets, folder creation, undo/redo, rename and move, later bookmarks, failures and clicks.');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
