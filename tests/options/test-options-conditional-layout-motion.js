const assert = require('assert');
const settings = require('../../src/domain/settings/index.ts');
const { parsePageCss } = require('../helpers/css-rules');
const { createOptionsPage } = require('../helpers/options-page');

// Settings that only apply to another setting's value fold away or hide
// their whole row, and the panel animates its height around them.

const BOOKMARK_SUBROWS = '_x_extension_bookmark_subrows_2026_unique_';
const BOOKMARK_COLUMNS_ROW = '_x_extension_bookmark_columns_setting_row_2026_unique_';
const RECENT_MODE_TABS = '_x_extension_recent_mode_tabs_wrap_2024_unique_';

function testStyles() {
  const css = parsePageCss('src/options/options.html');
  const animating = css.rule('#_x_extension_settings_panel_2024_unique_[data-height-animating="true"]');
  assert.deepStrictEqual(animating && ['overflow', 'overflow-anchor', 'will-change'].map((name) => animating.get(name)), ['clip', 'none', 'height'],
    'the outer settings panel should clip and own the height animation');
  const children = css.rule('#_x_extension_settings_panel_2024_unique_[data-height-animating="true"] > *');
  assert.strictEqual(children && children.get('flex-shrink'), '0',
    'panel children should keep their natural height while the background stretches');
  const root = css.rule('#_x_extension_options_root_2024_unique_');
  assert.deepStrictEqual(root && [root.get('--settings-focus-anchor-reserve'), root.get('margin-bottom')], ['0px', 'var(--settings-focus-anchor-reserve)'],
    'the page should expose transparent scroll reserve outside the white panel');
  const hiddenRow = css.rule('._x_extension_setting_row_2024_unique_[hidden]');
  assert.deepStrictEqual(hiddenRow && [hiddenRow.get('display'), hiddenRow.priority('display')], ['none', 'important'],
    'conditional settings should hide the complete row instead of only its control');
}

async function testRowsFollowTheirSetting() {
  const page = await createOptionsPage({
    sync: { [settings.bookmarkCount.key]: 0, [settings.recentCount.key]: 0 }
  });
  await page.settle(200);
  const unfolded = () => page.byId(BOOKMARK_SUBROWS).getAttribute('data-expanded') === 'true';
  assert.ok(page.byId(BOOKMARK_SUBROWS).contains(page.byId(BOOKMARK_COLUMNS_ROW)));
  assert.strictEqual(unfolded(), false, 'zero bookmark rows should fold the whole bookmarks-per-row setting');
  assert.strictEqual(page.byId(RECENT_MODE_TABS), null, 'no recent sites should hide the recent-site mode');

  page.changeStorage('sync', settings.bookmarkCount.key, 8);
  page.changeStorage('sync', settings.recentCount.key, 4);
  await page.settle(200);
  assert.strictEqual(unfolded(), true, 'bookmark rows should bring back the per-row setting');
  assert.ok(page.byId(RECENT_MODE_TABS), 'recent sites should bring back their mode');
  page.close();
}

(async () => {
  testStyles();
  await testRowsFollowTheirSetting();
  console.log('Options conditional layout motion tests passed.');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
