const assert = require('assert');
const fs = require('fs');
const path = require('path');
const settings = require('../../src/shared/settings.js');
const shortcuts = require('../../src/newtab/shortcuts/shortcuts-store.js');
const siteDisplayName = require('../../src/shared/site-display-name.js');
const menu = require('../../src/background/page-shortcut-menu.js');
const { loadBackground, wait } = require('../helpers/background-harness');

const repoRoot = path.resolve(__dirname, '..', '..');
const LANGUAGE_KEY = settings.LANGUAGE_STORAGE_KEY;
const THEME_KEY = '_x_extension_theme_mode_2024_unique_';

function readMessages(locale) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, `_locales/${locale}/messages.json`), 'utf8'));
}

function device(initial = {}, options = {}) {
  const listeners = [];
  const menuItems = new Map();
  const clickListeners = [];
  const scripts = [];
  const chrome = {
    runtime: { lastError: null, getURL: (file) => `chrome-extension://lumno/${file}` },
    i18n: { getUILanguage: () => options.uiLanguage || 'en-US' },
    storage: { onChanged: { addListener(fn) { listeners.push(fn); } } },
    contextMenus: {
      items: menuItems,
      onClicked: { addListener(fn) { clickListeners.push(fn); } },
      create(properties, fn) {
        menuItems.set(properties.id, structuredClone(properties));
        if (fn) queueMicrotask(fn);
      },
      update(id, properties, fn) {
        if (!menuItems.has(id)) {
          chrome.runtime.lastError = { message: `Cannot find menu item with id ${id}` };
          fn();
          chrome.runtime.lastError = null;
          return;
        }
        menuItems.set(id, { ...menuItems.get(id), ...structuredClone(properties) });
        fn();
      }
    },
    scripting: {
      async executeScript(details) {
        if (options.scriptingFails) throw new Error('Cannot access contents of the page');
        scripts.push(details);
        return [{ result: true }];
      }
    }
  };
  for (const name of ['local', 'sync']) {
    const values = structuredClone(initial[name] || {});
    chrome.storage[name] = { values, QUOTA_BYTES: 102400,
      get(keys, fn) {
        const list = keys === null ? Object.keys(values) : (Array.isArray(keys) ? keys : [keys]);
        fn(Object.fromEntries(list.filter((key) => Object.hasOwn(values, key))
          .map((key) => [key, structuredClone(values[key])])));
      },
      set(payload, fn) {
        const changes = {};
        for (const [key, value] of Object.entries(payload)) {
          if (JSON.stringify(value) !== JSON.stringify(values[key])) changes[key] = { newValue: structuredClone(value) };
          values[key] = structuredClone(value);
        }
        if (Object.keys(changes).length) listeners.forEach((listener) => listener(changes, name));
        if (fn) fn();
      },
      remove(keys, fn) {
        (Array.isArray(keys) ? keys : [keys]).forEach((key) => { delete values[key]; });
        if (fn) fn();
      }
    };
  }
  const controller = menu.createController({
    chrome,
    settings,
    shortcuts,
    siteDisplayName,
    loadLocaleMessages: async (locale) => readMessages(locale),
    themeStorageKey: THEME_KEY
  });
  return {
    chrome,
    controller,
    scripts,
    menuItem: () => menuItems.get(menu.MENU_ITEM_ID),
    click: (info, tab) => controller.handleClick({ menuItemId: menu.MENU_ITEM_ID, ...info }, tab),
    clickListeners,
    toastArgs: () => scripts.filter((details) => details.func).map((details) => details.args)
  };
}

async function settle() {
  for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

async function run() {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
  assert(manifest.permissions.includes('contextMenus'), 'the page menu needs the contextMenus permission');
  ['en', 'ja', 'zh_CN', 'zh_TW'].forEach((locale) => {
    const messages = readMessages(locale);
    ['context_menu_add_page_shortcut', 'page_shortcut_added'].forEach((key) => {
      assert(messages[key] && messages[key].message, `${locale} needs ${key}`);
    });
  });
  // The real worker puts the item in the page menu as it starts.
  const worker = loadBackground();
  await wait(50);
  const created = worker.calls.filter((call) => call.name === 'contextMenus.create').map((call) => call.args[0].id);
  assert.deepStrictEqual(created, [menu.MENU_ITEM_ID], 'the worker should create the page menu item once');
  assert.strictEqual(worker.chrome.contextMenus.onClicked.listeners.length, 1, 'the worker should listen for menu clicks');

  // The menu item follows the language picked in Lumno, not only the browser's.
  const sync = device({ sync: { [LANGUAGE_KEY]: 'zh_CN', [THEME_KEY]: 'dark' } });
  sync.controller.start();
  await settle();
  assert.strictEqual(sync.clickListeners.length, 1, 'the click listener registers while the worker starts');
  assert.deepStrictEqual(sync.menuItem(), {
    id: menu.MENU_ITEM_ID,
    title: '添加到 Lumno 新标签页的快捷方式',
    contexts: ['page'],
    documentUrlPatterns: ['http://*/*', 'https://*/*']
  });
  sync.chrome.storage.sync.set({ [LANGUAGE_KEY]: 'en' });
  await settle();
  assert.strictEqual(sync.menuItem().title, 'Add to Lumno New Tab shortcuts', 'a language change retitles the item');
  sync.chrome.storage.sync.set({ [LANGUAGE_KEY]: 'zh_CN' });
  await settle();

  // A click saves the page to the end of the last group under its site name.
  await shortcuts.saveShortcutState(sync.chrome.storage.sync, {
    groups: [{ id: 'g0', title: '' }, { id: 'gwork', title: 'Work' }],
    items: [
      { id: 'a', groupId: 'g0', title: 'Lumno', url: 'https://lumno.kubai.design/' },
      { id: 'b', groupId: 'gwork', title: 'Docs', url: 'https://docs.example.com/' }
    ]
  });
  const result = await sync.click(
    { pageUrl: 'https://github.com/kubai087/lumno-extension' },
    { id: 7, url: 'https://github.com/kubai087/lumno-extension', title: 'kubai087/lumno-extension: Lumno' }
  );
  assert.strictEqual(result.status, 'added');
  let state = await shortcuts.loadShortcutState(sync.chrome.storage.sync);
  const added = state.items[state.items.length - 1];
  assert.strictEqual(added.url, 'https://github.com/kubai087/lumno-extension');
  assert.strictEqual(added.title, 'GitHub');
  assert.strictEqual(added.groupId, 'gwork', 'the page joins the last group');
  assert.deepStrictEqual(state.groups.map((group) => group.id), ['g0', 'gwork'], 'groups are kept');
  assert.deepStrictEqual(sync.scripts[0].files, ['build/page-shortcut-toast.js']);
  assert.strictEqual(sync.scripts[0].target.tabId, 7);
  assert.deepStrictEqual(sync.toastArgs()[0], ['已添加到 Lumno 新标签页的快捷方式', { error: false, duration: undefined, themeMode: 'dark' }]);

  // The same page again is reported, not duplicated.
  const repeat = await sync.click({ pageUrl: 'https://github.com/kubai087/lumno-extension' }, { id: 7, title: 'x' });
  assert.strictEqual(repeat.status, 'exists');
  state = await shortcuts.loadShortcutState(sync.chrome.storage.sync);
  assert.strictEqual(state.items.length, 3);
  assert.strictEqual(sync.toastArgs()[1][0], '已在快捷方式中');

  // Two quick clicks on different pages both land.
  await Promise.all([
    sync.click({ pageUrl: 'https://example.com/one' }, { id: 7, title: 'One' }),
    sync.click({ pageUrl: 'https://example.org/two' }, { id: 8, title: 'Two' })
  ]);
  state = await shortcuts.loadShortcutState(sync.chrome.storage.sync);
  assert.deepStrictEqual(state.items.slice(-2).map((item) => item.url), ['https://example.com/one', 'https://example.org/two']);

  // Other menu items are ignored.
  assert.strictEqual(await sync.controller.handleClick({ menuItemId: 'other' }, { id: 7 }), null);

  // Local-primary mode keeps the shortcut in local storage; a page that takes
  // no scripts still gets the shortcut.
  const local = device({ local: { [settings.LOCAL_PRIMARY_STORAGE_KEY]: true } }, { uiLanguage: 'ja', scriptingFails: true });
  local.controller.start();
  await settle();
  assert.strictEqual(local.menuItem().title, 'Lumno の新しいタブのショートカットに追加', 'the browser language applies without a Lumno one');
  const localResult = await local.click({ pageUrl: 'https://example.com/' }, { id: 3, title: 'Example Domain' });
  assert.strictEqual(localResult.status, 'added');
  const localState = await shortcuts.loadShortcutState(local.chrome.storage.local);
  assert(localState.items.some((item) => item.url === 'https://example.com/'), 'local-primary mode writes the local area');
  assert.strictEqual(local.chrome.storage.sync.values[shortcuts.SHORTCUTS_SYNC_KEYS[0]], undefined, 'sync stays untouched');

  // A full list is refused with the limit message.
  const full = device({}, { uiLanguage: 'en' });
  await shortcuts.saveShortcutState(full.chrome.storage.sync, {
    items: Array.from({ length: shortcuts.DEFAULT_MAX_SHORTCUTS }, (_, index) => ({
      id: `s${index}`, title: `S${index}`, url: `https://site${index}.example/`
    }))
  }, { allowOverflow: true, maxItemBytes: Number.MAX_SAFE_INTEGER, maxTotalBytes: Number.MAX_SAFE_INTEGER });
  const limited = await full.click({ pageUrl: 'https://new.example/' }, { id: 1, title: 'New' });
  assert.strictEqual(limited.status, 'limit');
  assert.deepStrictEqual(full.toastArgs()[0].slice(0, 1), [`You can add up to ${shortcuts.DEFAULT_MAX_SHORTCUTS} shortcuts.`]);
  assert.strictEqual(full.toastArgs()[0][1].error, true);

  // The toolbar popup adds a tab's page; a success shows Lumno's top toast in
  // the page and says whether it did.
  const popup = device({}, { uiLanguage: 'en' });
  const popupAdded = await popup.controller.addTabPage({ id: 4, url: 'https://example.net/page', title: 'Example' });
  assert.deepStrictEqual(popupAdded, {
    status: 'added', message: 'Added to Lumno New Tab shortcuts', error: false, toastShown: true
  });
  assert.strictEqual(popup.toastArgs()[0][0], 'Added to Lumno New Tab shortcuts');
  const popupRepeat = await popup.controller.addTabPage({ id: 4, url: 'https://example.net/page', title: 'Example' });
  assert.strictEqual(popupRepeat.status, 'exists');
  assert.strictEqual(popupRepeat.message, 'Already in shortcuts');
  assert.strictEqual(popup.toastArgs()[1][0], 'Already in shortcuts');
  assert.strictEqual((await popup.controller.addTabPage({ id: 5, url: 'chrome://extensions/', title: 'Extensions' })).status,
    'invalid', 'browser pages are not added');
  assert.strictEqual((await popup.controller.addTabPage(null)).status, 'invalid', 'a closed tab adds nothing');
  const noScripts = device({}, { uiLanguage: 'en', scriptingFails: true });
  assert.strictEqual((await noScripts.controller.addTabPage({ id: 6, url: 'https://example.org/', title: 'Org' })).toastShown,
    false, 'a page without scripts leaves the toast to the popup');
  assert.strictEqual(await popup.controller.showToast(4, { message: 'Current page URL copied' }), true);
  assert.strictEqual(popup.toastArgs()[2][0], 'Current page URL copied');

  console.log('Page shortcut menu tests passed: localized item, add to last group, duplicates, queued clicks, local mode, limit, popup adds and toasts.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
