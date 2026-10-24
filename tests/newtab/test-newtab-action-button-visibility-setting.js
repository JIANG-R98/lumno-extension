const assert = require('assert');
const fs = require('fs');
const settings = require('../../src/domain/settings.ts');
const { JSDOM } = require('jsdom');
const { createNewtabPage } = require('../helpers/newtab-page');

const optionsDocument = new JSDOM(fs.readFileSync('src/options/options.html', 'utf8')).window.document;
const toggleSettings = require('../../src/options/options-toggle-settings.ts').getToggleSettings(settings);
const localeNames = ['en', 'ja', 'zh_CN', 'zh_TW'];

const settingsContract = [
  {
    constant: 'NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY',
    htmlId: '_x_extension_newtab_feedback_button_visible_toggle_2026_unique_',
    i18nKey: 'settings_newtab_feedback_button_visible_title',
    storageKey: '_x_extension_newtab_feedback_button_visible_2026_unique_',
    toggleKind: 'newtab-feedback-button-visible'
  },
  {
    constant: 'NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY',
    htmlId: '_x_extension_newtab_appearance_button_visible_toggle_2026_unique_',
    i18nKey: 'settings_newtab_appearance_button_visible_title',
    storageKey: '_x_extension_newtab_appearance_button_visible_2026_unique_',
    toggleKind: 'newtab-appearance-button-visible'
  }
];

settingsContract.forEach((entry) => {
  assert.strictEqual(settings[entry.constant], entry.storageKey);
  assert.strictEqual(optionsDocument.getElementById(entry.htmlId).checked, true, `${entry.htmlId} should default to shown`);
  assert.ok(optionsDocument.querySelector(`[data-i18n="${entry.i18nKey}"]`));
  const toggleEntry = toggleSettings.find((item) => item.key === entry.storageKey);
  assert(
    toggleEntry && toggleEntry.inputId === entry.htmlId && toggleEntry.kind === entry.toggleKind,
    `${entry.constant} should use the shared Options toggle controller`
  );
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
  NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY: '.x-nt-feedback-control',
  NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY: '.x-nt-wallpaper-control'
};

function shown(page, selector) {
  const control = page.document.querySelector(selector);
  return !control.hidden && control.getAttribute('aria-hidden') === 'false' && !control.inert;
}

(async () => {
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
