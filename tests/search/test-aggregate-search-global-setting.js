const assert = require('assert');
const fs = require('fs');

const settings = require('../../src/domain/settings.ts');
const store = require('../../src/domain/search/aggregate-search-store.ts');
const { loadBackground, wait } = require('../helpers/background-harness');
const { createOptionsPage } = require('../helpers/options-page');

// One setting in the aggregate search section decides whether an aggregate search gathers the tabs
// it opens into a tab group. The editor's default names and placeholders are
// covered by src/options/react/aggregate-search-list.test.tsx.

const TOGGLE = '_x_extension_aggregate_search_auto_group_toggle_2026_unique_';
const AUTO_GROUP = settings.AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY;

async function testMarkup() {
  const page = await createOptionsPage({});
  await page.settle(150);
  const doc = page.document;
  const toggle = doc.getElementById(TOGGLE);
  assert.ok(toggle && toggle.closest('#_x_extension_aggregate_search_group_2026_unique_'),
    'the aggregate tab-group setting should live with the aggregate searches');
  const list = doc.getElementById('_x_extension_aggregate_search_list_2026_unique_');
  assert.ok(toggle.compareDocumentPosition(list) & 4, 'it should come before the list of aggregate searches');
  assert.strictEqual(toggle.checked, true, 'grouping should default to on');
  // The section heading names aggregate search, so the row drops it; the
  // switch's accessible name keeps it for screen readers moving by control.
  const row = toggle.closest('._x_extension_setting_row_2024_unique_');
  assert.strictEqual(row.querySelector('._x_extension_setting_title_2024_unique_ span').textContent, '自动创建标签页组');
  assert.strictEqual(toggle.getAttribute('aria-label'), '聚合搜索自动创建标签页组');
  assert.strictEqual(AUTO_GROUP, '_x_extension_aggregate_search_auto_group_enabled_2026_unique_');
  page.close();
}

// The worker reads the setting for every run, so a change made in Settings
// applies to the next aggregate search without a restart.
async function testWorkerReadsTheSettingEachRun() {
  const definition = { id: 'research', key: 'research', name: 'Research', sourceRefs: ['builtin:gg', 'builtin:bi'] };
  const grouped = [];
  const worker = loadBackground({
    tabs: [{ id: 10, index: 0, windowId: 1, url: 'https://page.test/' }],
    sync: {
      [settings.AGGREGATE_SEARCH_STORAGE_KEY]: store.serializeAggregateSearches([definition]),
      [AUTO_GROUP]: false
    },
    packagedFetch: true,
    configureChrome(chrome) {
      chrome.tabGroups = Object.assign({ TAB_GROUP_ID_NONE: -1, update(_id, _props, callback) { setTimeout(() => callback && callback(), 0); } }, chrome.tabGroups || {});
      chrome.tabs.group = (properties, callback) => {
        grouped.push(JSON.parse(JSON.stringify(properties)));
        setTimeout(() => callback(77), 0);
      };
    }
  });
  await wait(50);
  const run = (query) => worker.sendMessage({ action: 'runAggregateSearchQuery', aggregateId: 'research', query, disposition: 'newTab' },
    { tab: { id: 10, index: 0, windowId: 1 }, url: 'https://page.test/' }, 1500);
  const opened = () => worker.calls.filter((call) => call.name === 'tabs.create').length;

  await run('hello');
  await wait(50);
  assert.ok(opened() >= 2, 'the aggregate search should open a tab per source');
  assert.strictEqual(grouped.length, 0, 'with grouping off, the tabs should stay ungrouped');

  worker.storage.sync.data[AUTO_GROUP] = true;
  await run('world');
  await wait(50);
  assert.strictEqual(grouped.length, 1, 'turning grouping on should apply to the next run');
}

function testCopy() {
  const expectedCopy = {
    en: { defaultName: 'Aggregate search', title: 'Automatically group aggregate search tabs', shortTitle: 'Automatically create tab groups' },
    ja: { defaultName: '一括検索', title: '一括検索のタブグループを自動作成', shortTitle: 'タブグループを自動作成' },
    zh_CN: { defaultName: '聚合搜索', title: '聚合搜索自动创建标签页组', shortTitle: '自动创建标签页组' },
    zh_TW: { defaultName: '彙整搜尋', title: '彙整搜尋自動建立分頁群組', shortTitle: '自動建立分頁群組' }
  };
  Object.entries(expectedCopy).forEach(([locale, expected]) => {
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    assert.strictEqual(messages.aggregate_search_default_name.message, expected.defaultName);
    assert.strictEqual(messages.settings_aggregate_search_auto_group_title.message, expected.title);
    assert.strictEqual(messages.settings_aggregate_search_auto_group_short_title.message, expected.shortTitle);
    assert(messages.settings_aggregate_search_auto_group_desc.message.trim());
    assert(messages.aggregate_search_source_summary.message.includes('{count}'));
  });
}

(async () => {
  await testMarkup();
  await testWorkerReadsTheSettingEachRun();
  testCopy();
  console.log('aggregate search global setting tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
