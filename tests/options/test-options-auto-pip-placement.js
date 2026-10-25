const assert = require('assert');
const { parsePageCss } = require('../helpers/css-rules');
const { createOptionsPage } = require('../helpers/options-page');

// Where the General tab's switches sit on the rendered page.
(async () => {
  const page = await createOptionsPage({});
  await page.settle(150);
  const content = (name) => {
    const block = page.document.querySelector(`._x_extension_settings_content_2024_unique_[data-content="${name}"]`);
    assert.ok(block, `${name} settings content should exist`);
    return block;
  };
  const general = content('general');
  const labs = content('labs');
  const before = (first, second) => Boolean(first && second && (first.compareDocumentPosition(second) & 4));
  const row = (id) => {
    const input = page.byId(id);
    return input ? input.closest('._x_extension_setting_row_2024_unique_') : null;
  };

  const updateNotice = row('_x_extension_update_notice_toggle_2026_unique_');
  const autoPip = row('_x_extension_auto_pip_toggle_2024_unique_');
  const tabSwitcher = row('_x_extension_tab_switcher_toggle_2026_unique_');
  const searchResults = page.byId('_x_extension_search_result_tab_position_select_2026_unique_');
  assert.ok(updateNotice && general.contains(updateNotice), 'update notice switch should live in general settings');
  assert.ok(autoPip && general.contains(autoPip), 'auto picture-in-picture should live in general settings');
  assert.ok(tabSwitcher && general.contains(tabSwitcher), 'Alt+Q tab switcher should live in general settings');
  assert.ok(searchResults, 'general settings should include search results section');
  assert.ok(before(updateNotice, autoPip), 'auto picture-in-picture should appear below the update notice switch');
  assert.ok(before(autoPip, tabSwitcher) && before(tabSwitcher, searchResults),
    'Alt+Q tab switcher should appear directly after auto picture-in-picture and before search results settings');
  assert.ok(!labs.contains(autoPip) && !labs.contains(tabSwitcher), 'neither should appear in Labs');
  assert.ok(!general.contains(page.byId('lumno-browser-sync-title')), 'browser sync status should no longer appear in general settings');
  assert.strictEqual(page.byId('_x_extension_update_notice_toggle_2026_unique_').checked, true,
    'update notice switch should default to on');
  page.close();

  const contentRule = parsePageCss('src/options/options.html').rule('._x_extension_settings_content_2024_unique_');
  assert.strictEqual(contentRule && contentRule.get('padding-bottom'), '0',
    'all settings pages should share bottom spacing without extra content padding');

  console.log('options auto PiP placement tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
