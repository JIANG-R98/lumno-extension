const assert = require('assert');
const { JSDOM } = require('jsdom');
const { parsePageCss } = require('../helpers/css-rules');
const { readPageSource } = require('../helpers/page-source');

const optionsDocument = new JSDOM(readPageSource('src/options/options.html')).window.document;

function content(name) {
  const block = optionsDocument.querySelector(`._x_extension_settings_content_2024_unique_[data-content="${name}"]`);
  assert.ok(block, `${name} settings content should exist`);
  return block;
}

const general = content('general');
const labs = content('labs');
const title = (block, key) => block.querySelector(`[data-i18n="${key}"]`);
const before = (first, second) => Boolean(first && second && (first.compareDocumentPosition(second) & 4));

const updateNotice = title(general, 'settings_update_notice_title');
const autoPip = title(general, 'settings_auto_pip_title');
const tabSwitcher = title(general, 'settings_tab_switcher_title');
const searchResults = title(general, 'settings_search_results_section_title');
assert.ok(updateNotice, 'update notice switch should live in general settings');
assert.ok(autoPip, 'auto picture-in-picture should live in general settings');
assert.ok(tabSwitcher, 'Alt+Q tab switcher should live in general settings');
assert.ok(searchResults, 'general settings should include search results section');
assert.ok(before(updateNotice, autoPip), 'auto picture-in-picture should appear below the update notice switch');
assert.ok(before(autoPip, tabSwitcher) && before(tabSwitcher, searchResults),
  'Alt+Q tab switcher should appear directly after auto picture-in-picture and before search results settings');
assert.strictEqual(title(labs, 'settings_auto_pip_title'), null, 'auto picture-in-picture should no longer appear in Labs');
assert.strictEqual(title(labs, 'settings_tab_switcher_title'), null, 'Alt+Q tab switcher should no longer appear in Labs');

assert.strictEqual(title(general, 'settings_sync_title'), null, 'browser sync status should no longer appear in general settings');

assert.strictEqual(optionsDocument.getElementById('_x_extension_update_notice_toggle_2026_unique_').checked, true,
  'update notice switch should default to checked in markup');

const contentRule = parsePageCss('src/options/options.html').rule('._x_extension_settings_content_2024_unique_');
assert.strictEqual(contentRule && contentRule.get('padding-bottom'), '0',
  'all settings pages should share bottom spacing without extra content padding');

console.log('options auto PiP placement tests passed');
