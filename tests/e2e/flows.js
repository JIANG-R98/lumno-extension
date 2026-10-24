'use strict';

// The user flows the end-to-end run checks, each in a fresh browser profile.
// A flow throws to fail; any extension error the browser reports during it
// fails it too (see browser.js).

const assert = require('assert');
const { delay } = require('./browser');
const SETTINGS = require('../../src/shared/settings.js');

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
      THEME_STORAGE_KEY: 'dark',
      LANGUAGE_STORAGE_KEY: 'en',
      NEWTAB_THEME_MODE_STORAGE_KEY: 'dark',
      NEWTAB_GLASS_STYLE_STORAGE_KEY: 'liquid',
      NEWTAB_GLASS_THEME_STORAGE_KEY: 'dark',
      NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY: 'time',
      NEWTAB_TIME_FONT_SIZE_STORAGE_KEY: 72,
      NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY: true,
      NEWTAB_WIDTH_MODE_STORAGE_KEY: 'wide',
      NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY: 6,
      NEWTAB_SHORTCUT_SIZE_STORAGE_KEY: 64,
      NEWTAB_SHORTCUT_GAP_STORAGE_KEY: 20,
      NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY: false,
      BOOKMARK_COUNT_STORAGE_KEY: 12,
      BOOKMARK_COLUMNS_STORAGE_KEY: 3,
      BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY: false,
      RECENT_COUNT_STORAGE_KEY: 12,
      NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY: false,
      NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY: false,
      NEWTAB_ZEN_MODE_STORAGE_KEY: true,
      SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY: 6,
      NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY: true,
      NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY: true,
      SEARCH_BLACKLIST_STORAGE_KEY: ['example.com'],
      FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY: true
    },
    {
      THEME_STORAGE_KEY: 'light',
      LANGUAGE_STORAGE_KEY: 'zh_CN',
      NEWTAB_GLASS_STYLE_STORAGE_KEY: 'frosted',
      NEWTAB_ZEN_MODE_STORAGE_KEY: false,
      NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY: true,
      NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY: true,
      NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY: true
    }
  ].map((round) => Object.fromEntries(Object.entries(round).map(([name, value]) => {
    assert.ok(SETTINGS[name], `settings.js has no ${name}`);
    return [SETTINGS[name], value];
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
    .then(([sync, local]) => sync[${JSON.stringify(SETTINGS.LINK_PREVIEW_ENABLED_STORAGE_KEY)}] === false
      || local[${JSON.stringify(SETTINGS.LINK_PREVIEW_ENABLED_STORAGE_KEY)}] === false)`, {
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

module.exports = {
  surfaces,
  'newtab-search': newtabSearch,
  'overlay-search': overlaySearch,
  'tab-switcher': tabSwitcher,
  'link-preview': linkPreview
};
