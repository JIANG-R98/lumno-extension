'use strict';

// The user flows the end-to-end run checks, each in a fresh browser profile.
// A flow throws to fail; any extension error the browser reports during it
// fails it too (see browser.js).

const assert = require('assert');
const { delay } = require('./browser');
const SETTINGS = require('../../src/domain/settings/index.ts');

const OVERLAY_HOST_ID = '_x_extension_overlay_host_2026_unique_';
const OVERLAY_INPUT = '#_x_extension_search_input_2024_unique_';
const TAB_SWITCHER_HOST_ID = '_x_extension_tab_switcher_host_2026_unique_';
const LINK_PREVIEW_HOST_ID = '_x_extension_link_preview_host_2026_unique_';
const LINK_PREVIEW_TOGGLE_ID = '_x_extension_link_preview_toggle_2026_unique_';
const NEWTAB_INPUT_ID = '_x_extension_newtab_search_input_2024_unique_';

function getText() {
  return this.textContent.replace(/\s+/g, ' ').trim();
}

// The URL of the active tab, as the worker sees it.
function activeTabUrl(browser) {
  return browser.worker.evaluate(`chrome.tabs.query({ active: true, lastFocusedWindow: true })
    .then(([tab]) => (tab ? tab.url : ''))`);
}

// Makes a tab the active one and gives it input focus.
async function focusTab(browser, page) {
  const href = await page.evaluate('location.href');
  await browser.worker.evaluate(`(async () => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === ${JSON.stringify(href)});
    if (!tab) throw new Error('no tab at ' + ${JSON.stringify(href)});
    await chrome.tabs.update(tab.id, { active: true });
  })()`);
  await browser.cdp.send('Page.bringToFront', {}, page.sessionId);
}

function dispatchCommand(browser, command) {
  return browser.worker.evaluate(`chrome.commands.onCommand.dispatch(${JSON.stringify(command)})`);
}

async function elementCenter(page, expression) {
  const center = await page.waitFor(`(() => {
    const element = ${expression};
    if (!element || !element.checkVisibility()) return null;
    element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const rect = element.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`, { message: `${expression} is not visible` });
  return center;
}

// Every extension page opens, renders, and survives a burst of settings
// changes and a walk through the new tab appearance panel.
async function surfaces({ browser }) {
  const pages = [
    'newtab.html',
    'newtab.html?focus=1',
    'src/options/options.html',
    'src/onboarding/onboarding.html',
    'src/popup/popup.html'
  ];
  const settingsRounds = [
    {
      themeMode: 'dark',
      language: 'en',
      newtabThemeMode: 'dark',
      newtabGlassStyle: 'liquid',
      newtabGlassTheme: 'dark',
      newtabTopContentMode: 'time',
      newtabTimeFontSize: 72,
      newtabTimeSecondsVisible: true,
      newtabWidthMode: 'wide',
      newtabShortcutColumns: 6,
      newtabShortcutSize: 64,
      newtabShortcutGap: 20,
      newtabShortcutsVisible: false,
      bookmarkCount: 12,
      bookmarkColumns: 3,
      bookmarkFolderIconsVisible: false,
      recentCount: 12,
      newtabFeedbackButtonVisible: false,
      newtabAppearanceButtonVisible: false,
      newtabZenMode: true,
      searchResultDisplayLimit: 6,
      newtabOpenInNewTab: true,
      numberShortcutInstantEnabled: true,
      searchBlacklist: ['example.com'],
      faviconEnhancedFetchEnabled: true
    },
    {
      themeMode: 'light',
      language: 'zh_CN',
      newtabGlassStyle: 'frosted',
      newtabZenMode: false,
      newtabShortcutsVisible: true,
      newtabFeedbackButtonVisible: true,
      newtabAppearanceButtonVisible: true
    }
  ].map((round) => Object.fromEntries(Object.entries(round).map(([name, value]) => {
    assert.ok(SETTINGS[name], `the settings registry has no ${name}`);
    return [SETTINGS[name].key, value];
  })));

  for (const file of pages) {
    const page = await browser.openPage(browser.extensionUrl(file));
    // A page whose script failed to start renders no text, often with no error.
    await page.waitFor('document.body && document.body.innerText.trim().length > 0', {
      timeout: 8000,
      message: `${file} rendered no text`
    });
    await delay(1500);
    if (file === 'newtab.html') {
      for (const values of settingsRounds) {
        await page.evaluate(`Promise.all([
          chrome.storage.sync.set(${JSON.stringify(values)}),
          chrome.storage.local.set(${JSON.stringify(values)})
        ])`);
        await delay(1200);
      }
      const clicks = await page.evaluate(`(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const button = document.querySelector('.x-nt-wallpaper-button');
        if (!button) return 0;
        button.click();
        await wait(900);
        let clicks = 0;
        for (const [selector, limit] of [
          ['[data-wallpaper-tab]', 8],
          ['[data-wallpaper-mode]', 3],
          ['[data-wallpaper-id]', 2],
          ['[data-newtab-favicon-id]', 2],
          ['[data-wallpaper-effect-ink-tone]', 2]
        ]) {
          for (const element of Array.from(document.querySelectorAll(selector)).slice(0, limit)) {
            element.click();
            clicks += 1;
            await wait(250);
          }
        }
        button.click();
        await wait(600);
        return clicks;
      })()`);
      assert.ok(clicks > 0, 'the appearance panel should have controls to click');
    }
    await browser.closePage(page);
  }
}

// The new tab search box lists an open tab and switches to it.
async function newtabSearch({ browser, fixtures }) {
  const fixture = await browser.openPage(fixtures.url('/fixture.html'));
  const newtab = await browser.openPage(browser.extensionUrl('newtab.html'));
  await focusTab(browser, newtab);
  await newtab.waitFor(`Boolean(document.getElementById('${NEWTAB_INPUT_ID}'))`, { message: 'no search box' });
  await newtab.evaluate(`document.getElementById('${NEWTAB_INPUT_ID}').focus()`);
  await newtab.type('Lumno fixture');
  const item = `Array.from(document.querySelectorAll('.x-nt-suggestion-item'))
    .find((element) => element.innerText.includes('Lumno fixture page'))`;
  const center = await elementCenter(newtab, item);
  await newtab.click(center.x, center.y);
  const expected = await fixture.evaluate('location.href');
  await browser.worker.waitFor(`chrome.tabs.query({ active: true, lastFocusedWindow: true })
    .then(([tab]) => tab && tab.url === ${JSON.stringify(expected)})`, { message: 'the open tab did not become active' });
}

// The search overlay opens on a web page with its input focused, lists open
// tabs, and closes on Escape.
async function overlaySearch({ browser, fixtures }) {
  await browser.openPage(fixtures.url('/fixture.html'));
  const web = await browser.openPage(fixtures.url('/page.html'));
  await focusTab(browser, web);
  await dispatchCommand(browser, 'show-search');
  await web.waitForShadow(OVERLAY_HOST_ID, OVERLAY_INPUT, function isFocused() {
    return this.getRootNode().activeElement === this;
  }, (results) => results.length === 1 && results[0] === true, { message: 'the overlay input was not focused' });
  await web.type('Lumno fixture');
  await web.waitForShadow(OVERLAY_HOST_ID, '.x-ov-suggestion-item', getText,
    (texts) => texts.some((text) => text.includes('Lumno fixture page')),
    { message: 'the overlay did not list the open fixture tab' });
  await web.press('Escape');
  await web.waitFor(`!document.getElementById('${OVERLAY_HOST_ID}')`, { message: 'Escape did not close the overlay' });
}

// The search scope panel opens on a double Tab, in the new tab search box
// and in the overlay; a click on a scope tags the input with it, and Escape
// closes the panel only.
async function searchScope({ browser, fixtures }) {
  const MENU = '[data-search-input-mode-menu]';
  const TILE = `${MENU} [role="menuitemradio"]`;
  const newtab = await browser.openPage(browser.extensionUrl('newtab.html'));
  await focusTab(browser, newtab);
  await newtab.waitFor(`Boolean(document.getElementById('${NEWTAB_INPUT_ID}'))`, { message: 'no search box' });
  await newtab.evaluate(`document.getElementById('${NEWTAB_INPUT_ID}').focus()`);
  await newtab.press('Tab');
  await newtab.press('Tab');
  await newtab.waitFor(`(() => {
    const menu = document.querySelector('${MENU}');
    return Boolean(menu && !menu.hidden && menu.dataset.open === 'true' &&
      menu.querySelectorAll('[role="menuitemradio"]').length > 1);
  })()`, { message: 'double Tab did not open the scope panel' });
  const label = await newtab.evaluate(`Array.from(document.querySelectorAll('${TILE}'))
    .find((tile) => tile.getAttribute('aria-checked') !== 'true').getAttribute('aria-label')`);
  const center = await elementCenter(newtab, `Array.from(document.querySelectorAll('${TILE}'))
    .find((tile) => tile.getAttribute('aria-label') === ${JSON.stringify(label)})`);
  await newtab.click(center.x, center.y);
  await newtab.waitFor(`(() => {
    const prefix = document.querySelector('[data-search-input-mode-prefix]');
    return Boolean(prefix && prefix.checkVisibility() && prefix.textContent.includes(${JSON.stringify(label)}));
  })()`, { message: 'the chosen scope did not tag the input' });
  await newtab.press('Escape');
  await newtab.waitFor(`document.querySelector('${MENU}').hidden`, { message: 'Escape did not close the scope panel' });

  const web = await browser.openPage(fixtures.url('/page.html'));
  await focusTab(browser, web);
  await dispatchCommand(browser, 'show-search');
  await web.waitForShadow(OVERLAY_HOST_ID, OVERLAY_INPUT, function isFocused() {
    return this.getRootNode().activeElement === this;
  }, (results) => results.length === 1 && results[0] === true, { message: 'the overlay input was not focused' });
  await web.press('Tab');
  await web.press('Tab');
  await web.waitForShadow(OVERLAY_HOST_ID, TILE, getText, (texts) => texts.length > 1,
    { message: 'double Tab did not open the overlay scope panel' });
  await web.press('Escape');
  await web.waitForShadow(OVERLAY_HOST_ID, MENU, function isHidden() {
    return this.hidden;
  }, (results) => results.length === 1 && results[0] === true, { message: 'Escape did not close the overlay scope panel' });
  assert.ok(await web.evaluate(`Boolean(document.getElementById('${OVERLAY_HOST_ID}'))`), 'Escape on the panel closed the overlay');
}

// The tab switcher lists the open tabs and Enter switches to the selected one,
// the previously used tab.
async function tabSwitcher({ browser, fixtures }) {
  const first = await browser.openPage(fixtures.url('/fixture.html'));
  const second = await browser.openPage(fixtures.url('/page.html'));
  await focusTab(browser, first);
  await delay(300);
  await focusTab(browser, second);
  await dispatchCommand(browser, 'show-tab-switcher');
  await second.waitForShadow(TAB_SWITCHER_HOST_ID, '.x-tab-switcher-card', getText,
    (texts) => texts.some((text) => text.includes('Lumno fixture page')) && texts.some((text) => text.includes('Lumno web page')),
    { message: 'the tab switcher did not list both tabs' });
  await second.press('Enter');
  const expected = await first.evaluate('location.href');
  await browser.worker.waitFor(`chrome.tabs.query({ active: true, lastFocusedWindow: true })
    .then(([tab]) => tab && tab.url === ${JSON.stringify(expected)})`, { message: 'Enter did not switch to the previous tab' });
  assert.strictEqual(await activeTabUrl(browser), expected);
}

async function shiftClickLink(page) {
  const center = await elementCenter(page, `document.getElementById('target-link')`);
  await page.keyDown('Shift', { modifiers: ['Shift'] });
  await page.click(center.x, center.y, { modifiers: ['Shift'] });
  await page.keyUp('Shift');
}

// Shift+click previews a link on the page; turning link preview off in
// Settings stops it.
async function linkPreview({ browser, fixtures }) {
  const web = await browser.openPage(fixtures.url('/page.html'));
  await focusTab(browser, web);
  await delay(500);
  await shiftClickLink(web);
  const target = fixtures.url('/target.html');
  await web.waitForShadow(LINK_PREVIEW_HOST_ID, 'iframe', function frameSource() {
    return this.src;
  }, (sources) => sources.includes(target), { timeout: 8000, message: 'Shift+click did not preview the link' });
  assert.strictEqual(await web.evaluate('location.pathname'), '/page.html', 'the page should stay where it was');

  const options = await browser.openPage(browser.extensionUrl('src/options/options.html'));
  await focusTab(browser, options);
  await options.waitFor(`document.documentElement.getAttribute('data-lumno-options-ready') === 'true'`, {
    timeout: 8000,
    message: 'Settings did not finish loading'
  });
  assert.strictEqual(await options.evaluate(`document.getElementById('${LINK_PREVIEW_TOGGLE_ID}').checked`), true,
    'link preview should start on');
  const toggle = await elementCenter(options, `document.querySelector('label[for="${LINK_PREVIEW_TOGGLE_ID}"]')`);
  await options.click(toggle.x, toggle.y);
  await options.waitFor(`document.getElementById('${LINK_PREVIEW_TOGGLE_ID}').checked === false`, {
    message: 'the switch did not turn off'
  });
  await browser.worker.waitFor(`Promise.all([chrome.storage.sync.get(null), chrome.storage.local.get(null)])
    .then(([sync, local]) => sync[${JSON.stringify(SETTINGS.linkPreviewEnabled.key)}] === false
      || local[${JSON.stringify(SETTINGS.linkPreviewEnabled.key)}] === false)`, {
    message: 'the switch did not save the setting'
  });

  await web.goto(fixtures.url('/page.html'));
  await focusTab(browser, web);
  await delay(500);
  await shiftClickLink(web);
  await delay(1500);
  assert.strictEqual(await web.evaluate(`Boolean(document.getElementById('${LINK_PREVIEW_HOST_ID}'))`), false,
    'Shift+click should not preview once link preview is off');
}

// A failure in the worker lands in the diagnostics log, and the settings page
// saves it in the diagnostics file without the address it mentioned.
async function diagnostics({ browser }) {
  await browser.worker.evaluate(`self.dispatchEvent(new ErrorEvent('error', {
    message: 'probe',
    error: new Error('Probe failure at https://intranet.example/private?q=1')
  }))`);
  await browser.worker.waitFor(`chrome.storage.local.get(${JSON.stringify(SETTINGS.diagnosticErrors.key)})
    .then((items) => (items[${JSON.stringify(SETTINGS.diagnosticErrors.key)}] || [])
      .some((entry) => entry.message === 'Probe failure at https://...'))`, {
    message: 'the worker did not record the failure'
  });

  const options = await browser.openPage(browser.extensionUrl('src/options/options.html'));
  await focusTab(browser, options);
  await options.waitFor(`document.documentElement.getAttribute('data-lumno-options-ready') === 'true'`, {
    timeout: 8000,
    message: 'Settings did not finish loading'
  });
  // Keeps the saved file in the page instead of the downloads folder.
  await options.evaluate(`(() => {
    URL.createObjectURL = (blob) => { window.__lumnoDiagnosticsFile = blob; return 'blob:diagnostics'; };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function click() {};
  })()`);
  const button = await elementCenter(options, `document.querySelector('[data-feedback-support="diagnostics"]')`);
  await options.click(button.x, button.y);
  const text = await options.waitFor(`window.__lumnoDiagnosticsFile ? window.__lumnoDiagnosticsFile.text() : null`, {
    message: 'the diagnostics file was not saved'
  });
  const report = JSON.parse(text);
  const version = await browser.worker.evaluate('chrome.runtime.getManifest().version');
  assert.strictEqual(report.format, 'lumno-diagnostics');
  assert.strictEqual(report.extension.version, version);
  assert.ok(Object.keys(report.settings).length > 0, 'the file should list the settings');
  assert.ok(report.recentErrors.some((entry) => entry.context === 'Uncaught error in the background worker.'
    && entry.message === 'Probe failure at https://...'), 'the file should carry the recorded failure');
  assert.ok(!text.includes('intranet.example'), 'the file should not carry the address');
}

// The background registers the picture-in-picture page bridge in the page's
// main world on the automatic picture-in-picture sites, and the bridge
// answers the isolated-world script's request there. The flow points the
// registration at the fixture page, since the real sites need the network.
async function pipPageBridge({ browser, fixtures }) {
  const registered = await browser.worker.waitFor(`chrome.scripting.getRegisteredContentScripts({ ids: ['lumno-pip-page-bridge'] })
    .then(([script]) => script || null)`, { message: 'the page bridge was not registered' });
  assert.strictEqual(registered.world, 'MAIN');
  assert.strictEqual(registered.runAt, 'document_start');
  assert.deepStrictEqual(registered.js, ['build/pip-page-bridge.js']);
  assert.ok(registered.matches.includes('*://*.youtube.com/*'));
  assert.ok(!registered.matches.includes('<all_urls>'));

  const fixtureMatch = fixtures.url('/*').replace(/:\d+\//, '/');
  await browser.worker.evaluate(`chrome.scripting.updateContentScripts([
    { id: 'lumno-pip-page-bridge', matches: [${JSON.stringify(fixtureMatch)}] }
  ])`);
  const page = await browser.openPage(fixtures.url('/fixture.html'));
  // CDP evaluates in the page's main world, the same world as the bridge.
  const response = await page.evaluate(`new Promise((resolve) => {
    window.addEventListener('__lumno_yt_force_exit_pip_res_2026__', (event) => resolve(event.detail), { once: true });
    window.dispatchEvent(new CustomEvent('__lumno_yt_force_exit_pip_req_2026__', { detail: { requestId: 42 } }));
    setTimeout(() => resolve(null), 2000);
  })`);
  assert.deepStrictEqual(response, { requestId: 42, attempted: false, before: false, after: false, error: '' },
    'the bridge should answer in the page world');
}

// Code loaded on first use leaves no global behind: pages import the
// traditional-to-simplified table and pinyin-pro by URL as ES modules, and the
// worker, which imports pinyin-pro while installing, reads it from its lazy
// module registry.
async function lazyModules({ browser }) {
  const newtab = await browser.openPage(browser.extensionUrl('newtab.html'));
  const page = await newtab.evaluate(`Promise.all([
    import(chrome.runtime.getURL('build/han-variants.js')),
    import(chrome.runtime.getURL('build/pinyin.js'))
  ]).then(([han, pinyin]) => ({
    pairs: han.HAN_VARIANT_PAIRS.length,
    readings: pinyin.pinyin('重', { toneType: 'none', type: 'array', multiple: true, v: true }),
    globals: ['LumnoSearchHanVariants', 'pinyinPro'].filter((name) => name in globalThis)
  }))`);
  assert.strictEqual(page.pairs, 2903 * 2);
  assert.ok(page.readings.includes('zhong') && page.readings.includes('chong'), 'pinyin-pro should read 重 both ways');
  assert.deepStrictEqual(page.globals, []);

  const worker = await browser.worker.evaluate(`({
    pinyin: typeof (globalThis.__lumnoWorkerLazy && globalThis.__lumnoWorkerLazy.pinyin
      && globalThis.__lumnoWorkerLazy.pinyin.pinyin),
    vendorGlobal: 'pinyinPro' in globalThis
  })`);
  assert.deepStrictEqual(worker, { pinyin: 'function', vendorGlobal: false });
}

// The onboarding page's demo overlay is the overlay the worker injects into
// web pages: the search shortcut on the onboarding page imports it there and
// opens it.
async function onboardingOverlay({ browser }) {
  const onboarding = await browser.openPage(browser.extensionUrl('src/onboarding/onboarding.html'));
  await focusTab(browser, onboarding);
  await onboarding.waitFor(`Boolean(document.getElementById('onboarding-root'))`, { message: 'onboarding did not render' });
  await dispatchCommand(browser, 'show-search');
  await onboarding.waitFor(`Boolean(document.getElementById('${OVERLAY_HOST_ID}'))`, {
    timeout: 5000,
    message: 'the search shortcut did not open the demo overlay'
  });
}

// The worker injects the copy-URL listener into a page the first time the
// command runs there; the page then confirms with its toast.
async function copyUrl({ browser, fixtures }) {
  const web = await browser.openPage(fixtures.url('/page.html'));
  await focusTab(browser, web);
  await dispatchCommand(browser, 'show-search-prefill-v');
  await web.waitFor(`Boolean(document.getElementById('_x_extension_page_toast_2026_unique_'))`, {
    message: 'the copy-URL command did not show its toast in the page'
  });
}

// The page menu's "Add to Lumno New Tab" shows the injected toast in the page.
async function pageShortcutToast({ browser, fixtures }) {
  const web = await browser.openPage(fixtures.url('/page.html'));
  await focusTab(browser, web);
  const href = await web.evaluate('location.href');
  await browser.worker.evaluate(`(async () => {
    const [tab] = (await chrome.tabs.query({})).filter((candidate) => candidate.url === ${JSON.stringify(href)});
    chrome.contextMenus.onClicked.dispatch({ menuItemId: 'lumno-add-page-shortcut', pageUrl: ${JSON.stringify(href)} }, tab);
  })()`);
  await web.waitFor(`Boolean(document.getElementById('__lumno_page_shortcut_toast_2026__'))`, {
    message: 'adding the page did not show the toast in it'
  });
}

module.exports = {
  surfaces,
  'newtab-search': newtabSearch,
  'overlay-search': overlaySearch,
  'search-scope': searchScope,
  'tab-switcher': tabSwitcher,
  'link-preview': linkPreview,
  diagnostics,
  'pip-page-bridge': pipPageBridge,
  'lazy-modules': lazyModules,
  'onboarding-overlay': onboardingOverlay,
  'copy-url': copyUrl,
  'page-shortcut-toast': pageShortcutToast
};
