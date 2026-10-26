const assert = require('assert');
const fs = require('fs');
const settings = require('../../src/domain/settings/index.ts');
const { createNewtabPage } = require('../helpers/newtab-page');
const { createOptionsPage } = require('../helpers/options-page');

const localeNames = ['en', 'ja', 'zh_CN', 'zh_TW'];

const settingsContract = [
  {
    constant: 'newtabFeedbackButtonVisible',
    htmlId: '_x_extension_newtab_feedback_button_visible_toggle_2026_unique_',
    i18nKey: 'settings_newtab_feedback_button_visible_title',
    storageKey: '_x_extension_newtab_feedback_button_visible_2026_unique_'
  },
  {
    constant: 'newtabAppearanceButtonVisible',
    htmlId: '_x_extension_newtab_appearance_button_visible_toggle_2026_unique_',
    i18nKey: 'settings_newtab_appearance_button_visible_title',
    storageKey: '_x_extension_newtab_appearance_button_visible_2026_unique_'
  }
];

settingsContract.forEach((entry) => {
  assert.strictEqual(settings[entry.constant].key, entry.storageKey);
  localeNames.forEach((locale) => {
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    assert(
      messages[entry.i18nKey] && String(messages[entry.i18nKey].message || '').trim(),
      `${locale} should localize ${entry.i18nKey}`
    );
  });
});

// On the New Tab page: each button follows its own setting, from the first
// visible frame and live when Settings changes it.
const CONTROLS = {
  newtabFeedbackButtonVisible: '.x-nt-feedback-control',
  newtabAppearanceButtonVisible: '.x-nt-wallpaper-control'
};

function shown(page, selector) {
  const control = page.document.querySelector(selector);
  return !control.hidden && control.getAttribute('aria-hidden') === 'false' && !control.inert;
}

// In Settings: each switch defaults to shown and saves the choice.
async function testSettingsSwitches() {
  const page = await createOptionsPage();
  for (const entry of settingsContract) {
    const toggle = page.byId(entry.htmlId);
    assert.strictEqual(toggle.checked, true, `${entry.htmlId} should default to shown`);
    assert.strictEqual(toggle.getAttribute('data-i18n-aria-label'), entry.i18nKey);
    await page.click(toggle);
    await page.settle(50);
    assert.ok(page.storage.sync.writes.some((write) => write[entry.storageKey] === false), `${entry.constant} should save the choice`);
  }
  page.close();
}

(async () => {
  await testSettingsSwitches();
  for (const entry of settingsContract) {
    const others = settingsContract.filter((other) => other !== entry);
    let hiddenWhenReady = null;
    const page = await createNewtabPage({
      sync: { [entry.storageKey]: false },
      setup(window) {
        // Capture the button's state on the frame the page reveals itself.
        new window.MutationObserver(() => {
          if (hiddenWhenReady === null && window.document.body && window.document.body.getAttribute('data-nt-ready') === '1') {
            const control = window.document.querySelector(CONTROLS[entry.constant]);
            hiddenWhenReady = Boolean(control && control.hidden);
          }
        }).observe(window.document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-nt-ready'] });
      }
    });
    await page.waitFor(() => hiddenWhenReady !== null, `${entry.constant}: New Tab should reveal itself`, 5000);
    assert.strictEqual(hiddenWhenReady, true, `${entry.constant}: the button should already be hidden when New Tab first shows`);
    assert.strictEqual(shown(page, CONTROLS[entry.constant]), false, `${entry.constant}: a hidden button should also leave the tab order`);
    others.forEach((other) => assert.strictEqual(shown(page, CONTROLS[other.constant]), true, `${other.constant} should not be affected`));
    page.changeStorage('sync', entry.storageKey, true);
    await page.settle(60);
    assert.strictEqual(shown(page, CONTROLS[entry.constant]), true, `${entry.constant}: turning it back on should show it at once`);
    page.changeStorage('sync', entry.storageKey, false);
    await page.settle(60);
    assert.strictEqual(shown(page, CONTROLS[entry.constant]), false, `${entry.constant}: and turning it off should hide it again`);
    page.close();
  }
  console.log('newtab action-button visibility setting tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
