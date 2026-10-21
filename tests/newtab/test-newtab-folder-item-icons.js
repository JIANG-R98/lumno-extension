const assert = require('assert');
const fs = require('fs');
const path = require('path');
const icons = require('../../src/newtab/bookmarks/folder-item-icons');
const store = require('../../src/newtab/shortcuts/shortcuts-store');
const favicon = require('../../src/shared/favicon/shortcut-favicon');
const { createNewtabPage } = require('../helpers/newtab-page');
const png = (text) => `data:image/png;base64,${Buffer.from(text).toString('base64')}`;

// On New Tab: a website inside a bookmark folder opened from a shortcut can
// be given its own icon in the edit dialog, which the folder's menu then
// shows instead of the site's favicon.
async function openFolderPage(savedIcons) {
  const page = await createNewtabPage({
    shortcuts: [{ type: 'folder', folderId: '10', title: 'Docs' }],
    bookmarks: [{ id: '10', title: 'Docs', children: [
      { id: '11', title: 'MDN', url: 'https://developer.mozilla.org/' },
      { id: '12', title: 'Sub', children: [] }
    ] }],
    local: { [icons.DEFAULT_STORAGE_KEY]: savedIcons }
  });
  await page.settle(400);
  const click = (element) => element.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  const press = (element) => {
    element.dispatchEvent(new page.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    click(element);
  };
  const openFolder = async () => {
    if (!page.document.querySelector('.x-nt-bookmark-cascade-item')) {
      click(page.document.querySelector('.x-nt-shortcut-tile--folder'));
      await page.settle(200);
    }
    return Array.from(page.document.querySelectorAll('.x-nt-bookmark-cascade-item'));
  };
  const dialog = () => page.document.querySelector('.x-nt-shortcut-dialog-backdrop');
  return {
    page,
    openFolder,
    dialog,
    saved: () => page.storage.local.data[icons.DEFAULT_STORAGE_KEY] || {},
    async edit(index) {
      const [item] = (await openFolder()).slice(index, index + 1);
      item.dispatchEvent(new page.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20, button: 2 }));
      await page.settle(150);
      press(page.document.querySelector('#_x_extension_newtab_bookmark_context_menu_2026_unique__menu [data-value="edit"]'));
      await page.settle(400);
      return dialog();
    },
    async pickIconSource(value) {
      const trigger = dialog().querySelector('.x-nt-shortcut-icon-source-select ._x_extension_select_trigger_2024_unique_');
      click(trigger);
      await page.settle(60);
      const menu = page.document.getElementById(trigger.getAttribute('aria-controls').replace(/_listbox$/, '_menu')) ||
        page.document.querySelector('[role="listbox"][data-open="true"], [data-open="true"][role="menu"]');
      press(menu.querySelector(`[role="option"][data-value="${value}"]`));
      await page.settle(60);
    },
    async setUrl(url) {
      const input = dialog().querySelector('#_x_extension_newtab_shortcut_dialog_2026_unique__url');
      // React tracks its inputs' values; set it the way typing does.
      Object.getOwnPropertyDescriptor(page.window.HTMLInputElement.prototype, 'value').set.call(input, url);
      input.dispatchEvent(new page.window.Event('input', { bubbles: true }));
      input.dispatchEvent(new page.window.Event('change', { bubbles: true }));
      await page.settle(30);
    },
    async save() {
      click(Array.from(dialog().querySelectorAll('button[type="submit"]')).pop());
      await page.settle(300);
    }
  };
}

async function testOnNewTab() {
  const mine = png('mine');
  const folder = await openFolderPage({ 11: { iconSource: 'custom', dataUrl: mine } });
  const [site] = await folder.openFolder();
  assert.strictEqual(site.querySelector('img').src, mine, 'the folder menu should show the chosen icon');

  let dialog = await folder.edit(0);
  assert.ok(dialog.querySelector('.x-nt-shortcut-icon-field'), 'a website in a shortcut folder should get the icon editor');
  assert.strictEqual(dialog.querySelector('.x-nt-shortcut-icon-source-select select').value, 'custom');
  await folder.save();
  assert.deepStrictEqual(folder.saved()[11], { iconSource: 'custom', dataUrl: mine }, 'saving an unchanged choice should keep its image');

  dialog = await folder.edit(0);
  await folder.pickIconSource('builtin');
  await folder.save();
  assert.deepStrictEqual(folder.saved()[11], { iconSource: 'builtin' }, 'choosing the built-in icon should save that choice');

  dialog = await folder.edit(1);
  assert.ok(dialog, 'a subfolder can be edited');
  assert.strictEqual(dialog.querySelector('.x-nt-shortcut-icon-field'), null, 'but has no icon editor');
  folder.page.close();

  const moved = await openFolderPage({ 11: { iconSource: 'service', dataUrl: png('old') } });
  await moved.edit(0);
  await moved.setUrl('https://moved.example/');
  await moved.save();
  assert.ok(moved.page.bookmarks.calls.some((call) => call.name === 'update' && call.args[1].url === 'https://moved.example/'),
    'saving should update the bookmark');
  assert.strictEqual(moved.saved()[11], undefined, 'a new address should drop an image fetched for the old one');
  moved.page.close();
}

(async () => {
  // Entries: built-in resolves from the URL; other sources keep their image.
  assert.deepStrictEqual(icons.normalizeEntry({ iconSource: 'builtin', dataUrl: png('x') }), { iconSource: 'builtin' });
  assert.deepStrictEqual(icons.normalizeEntry({ iconSource: 'custom', dataUrl: png('x') }), { iconSource: 'custom', dataUrl: png('x') });
  assert.strictEqual(icons.normalizeEntry({ iconSource: 'service' }), null, 'online sources need their image');
  assert.strictEqual(icons.normalizeEntry({ iconSource: 'custom', dataUrl: 'https://x.example/a.png' }), null);
  assert.strictEqual(icons.normalizeEntry({ iconSource: 'other', dataUrl: png('x') }), null);

  const area = {
    data: {}, writes: 0,
    get(keys, callback) { callback({ [keys[0]]: this.data[keys[0]] }); },
    set(values, callback) { this.writes += 1; Object.assign(this.data, JSON.parse(JSON.stringify(values))); callback(); }
  };
  area.data[icons.DEFAULT_STORAGE_KEY] = { a: { iconSource: 'custom', dataUrl: png('a') }, bad: { iconSource: 'service' } };
  const runtime = icons.createStore({ storageArea: area, chrome: {} });
  await runtime.ready;
  assert.deepStrictEqual(runtime.get('a'), { iconSource: 'custom', dataUrl: png('a') });
  assert.strictEqual(runtime.get('bad'), null);
  await runtime.update({ b: { iconSource: 'builtin' }, a: null });
  assert.deepStrictEqual(area.data[icons.DEFAULT_STORAGE_KEY], { b: { iconSource: 'builtin' } });
  await runtime.update({ c: { iconSource: 'favicon-is', dataUrl: png('c') } }, (id) => id !== 'b');
  assert.deepStrictEqual(Object.keys(area.data[icons.DEFAULT_STORAGE_KEY]), ['c'], 'removed bookmarks lose their icons');
  const writes = area.writes;
  await runtime.update({ c: { iconSource: 'favicon-is', dataUrl: png('c') } });
  assert.strictEqual(area.writes, writes, 'unchanged icons are not rewritten');

  await testOnNewTab();

  console.log('Shortcut folder item icons passed: storage, pruning, saving choices, editor scope and cascade display.');
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
