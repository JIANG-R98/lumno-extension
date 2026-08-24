const assert = require('assert');
const fs = require('fs');
const settings = require('../src/shared/settings.js');

const optionsHtml = fs.readFileSync('src/options/options.html', 'utf8');
const optionsSource = fs.readFileSync('src/options/options.js', 'utf8');
const newtabSource = fs.readFileSync('src/newtab/newtab.js', 'utf8');
const inputModeSource = fs.readFileSync('src/shared/search-input-mode.js', 'utf8');
const localeNames = ['en', 'ja', 'zh_CN', 'zh_TW'];

const settingsContract = [
  {
    constant: 'NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY',
    htmlId: '_x_extension_newtab_feedback_button_visible_toggle_2026_unique_',
    i18nKey: 'settings_newtab_feedback_button_visible_title',
    storageKey: '_x_extension_newtab_feedback_button_visible_2026_unique_',
    toggleKind: 'newtab-feedback-button-visible',
    variable: 'newtabFeedbackButtonVisibleToggle'
  },
  {
    constant: 'NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY',
    htmlId: '_x_extension_newtab_appearance_button_visible_toggle_2026_unique_',
    i18nKey: 'settings_newtab_appearance_button_visible_title',
    storageKey: '_x_extension_newtab_appearance_button_visible_2026_unique_',
    toggleKind: 'newtab-appearance-button-visible',
    variable: 'newtabAppearanceButtonVisibleToggle'
  }
];

settingsContract.forEach((entry) => {
  assert.strictEqual(settings[entry.constant], entry.storageKey);
  assert(settings.CHROME_SYNC_STORAGE_KEYS.includes(entry.storageKey));
  assert.match(optionsHtml, new RegExp(`id="${entry.htmlId}"[^>]*checked`));
  assert.match(optionsHtml, new RegExp(`data-i18n="${entry.i18nKey}"`));
  assert(optionsSource.includes(entry.constant));
  assert(newtabSource.includes(entry.constant));
  assert.match(
    optionsSource,
    new RegExp(`\\[${entry.variable}, '${entry.toggleKind}'\\]`),
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

assert.match(
  newtabSource,
  /function applyNewtabActionButtonVisibility\(\)[\s\S]*?closeFeedbackPopover\(\)[\s\S]*?closeWallpaperPanel\(\)[\s\S]*?setNewtabActionControlVisibility\(feedbackControl, newtabFeedbackButtonVisible\)[\s\S]*?setNewtabActionControlVisibility\(wallpaperControl, newtabAppearanceButtonVisible\)/,
  'New Tab should close open panels and apply both optional controls independently'
);

assert.match(
  newtabSource,
  /const actionButtonVisibilityReadyPromise = loadNewtabActionButtonVisibility\(\);[\s\S]*?const initialVisualReadyPromise = Promise\.all\(\[[\s\S]*?actionButtonVisibilityReadyPromise/,
  'visibility preferences should resolve before New Tab becomes visually ready'
);

settingsContract.forEach((entry) => {
  assert.match(
    newtabSource,
    new RegExp(`changes\\[${entry.constant}\\][\\s\\S]*?applyNewtabActionButtonVisibility\\(\\)`),
    `${entry.constant} should apply live storage changes`
  );
  assert.match(
    newtabSource,
    new RegExp(`migrateStorageIfNeeded\\(\\[[\\s\\S]*?${entry.constant}[\\s\\S]*?\\]\\);`),
    `${entry.constant} should migrate from legacy local storage`
  );
});

assert.doesNotMatch(
  `${optionsHtml}\n${optionsSource}\n${newtabSource}\n${inputModeSource}`,
  /NEWTAB_SETTINGS_BUTTON_VISIBLE|newtabSettingsButtonVisible|settings_newtab_settings_button_visible/,
  'the Settings button should remain always visible without a visibility preference'
);

console.log('newtab action-button visibility setting tests passed');
