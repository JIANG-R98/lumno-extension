'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const optionsHtml = read('src/options/options.html');
const newtabHtml = read('newtab.html');
const optionsSource = read('src/options/options.js');
const backgroundSource = read('src/background/background.js');
const controllerSource = read('src/background/pinned-recent-context-menu.js');
const newtabSource = read('src/newtab/newtab.js');

assert(optionsHtml.includes('id="_x_extension_linked_cards_toggle_2026_unique_"'));
assert(optionsHtml.includes('data-i18n="settings_linked_cards_title"'));
assert(!/id="_x_extension_linked_cards_toggle_2026_unique_"[^>]*checked/.test(optionsHtml),
  'the Labs switch must be opt-in');
assert(optionsSource.includes('[LINKED_CARDS_ENABLED_STORAGE_KEY]: next'));
assert(optionsSource.includes('storageArea.get([LINKED_CARDS_ENABLED_STORAGE_KEY]'));
assert(optionsSource.includes('changes[LINKED_CARDS_ENABLED_STORAGE_KEY]'));
assert(backgroundSource.includes('isEnabled: () => linkedCardsEnabled'));
assert(backgroundSource.includes('pinnedRecentContextMenuController.refreshAvailability()'));
assert(controllerSource.includes("reason: 'feature-disabled'"));
assert(controllerSource.includes('updateMenuState({ visible: false, enabled: false })'));
assert(newtabHtml.includes('.x-nt-recent-track[hidden]'));
assert(newtabSource.includes('if (!linkedCardsEnabled) return false;'));
assert(newtabSource.includes("reason: 'feature-disabled'"));
assert(newtabSource.includes('button.hidden = !linkedCardsEnabled'));
assert(newtabSource.includes('linkedCardsEnabled && item &&'));
assert(newtabSource.includes('updateHistory: []'));
assert(backgroundSource.includes('isPrimaryStorageAreaName(areaName)'));
assert(backgroundSource.includes('featureReady: linkedCardsFeatureReady'));

['en', 'ja', 'zh_CN', 'zh_TW'].forEach((locale) => {
  const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
  assert(messages.settings_linked_cards_title && messages.settings_linked_cards_title.message);
  assert(messages.settings_linked_cards_desc && messages.settings_linked_cards_desc.message);
});

console.log('linked cards Labs setting tests passed');
