const assert = require('assert');
const { loadBackground, wait } = require('../helpers/background-harness');

// The selection toolbar's runSelectionQuickAction message, sent to the real
// worker from a web page: which provider it opens, in which tab or group, and
// when it refuses.

const ENABLED_KEY = '_x_extension_selection_quick_actions_enabled_2026_unique_';
const PROVIDER_KEY = '_x_extension_selection_quick_actions_provider_2026_unique_';
const GROUP_KEY = '_x_extension_selection_quick_actions_group_enabled_2026_unique_';
const SITE_SEARCH_DISABLED_KEY = '_x_extension_site_search_disabled_2024_unique_';

const SOURCE_TAB = { id: 5, windowId: 2, index: 0, active: true, url: 'https://article.example.com/', status: 'complete' };

function bootWorker(sync, extraTabs) {
  const harness = loadBackground({
    extensionUrls: true,
    packagedFetch: true,
    tabs: [Object.assign({}, SOURCE_TAB)].concat(extraTabs || []),
    sync,
    configureChrome(chromeApi, calls) {
      chromeApi.tabGroups.query = (queryInfo, callback) => setTimeout(() => callback([]), 0);
      chromeApi.tabGroups.update = (groupId, properties, callback) => {
        calls.push({ name: 'tabGroups.update', args: [groupId, properties] });
        setTimeout(() => callback && callback({ id: groupId }), 0);
      };
      chromeApi.tabs.group = (options, callback) => {
        calls.push({ name: 'tabs.group', args: [options] });
        setTimeout(() => callback(40), 0);
      };
    }
  });
  const run = (request) => harness.sendMessage(
    Object.assign({ action: 'runSelectionQuickAction', text: 'What does idempotent mean?', intent: 'explain', locale: 'en' }, request || {}),
    { tab: Object.assign({}, SOURCE_TAB), url: SOURCE_TAB.url },
    3000
  );
  const created = () => harness.calls.filter((call) => call.name === 'tabs.create').map((call) => JSON.parse(JSON.stringify(call.args[0])));
  return { harness, run, created };
}

async function testNeedsTheSettingTurnedOn() {
  for (const value of [undefined, 'true', 1]) {
    const worker = bootWorker(value === undefined ? {} : { [ENABLED_KEY]: value });
    const response = await worker.run();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(response)), { ok: false, reason: 'selection-quick-actions-disabled' },
      `${JSON.stringify(value)} should not count as turned on`);
    assert.deepStrictEqual(worker.created(), [], 'nothing should open while the toolbar is off');
  }
}

async function testOpensThePreferredProviderEvenWhenHiddenFromSearch() {
  const worker = bootWorker({ [ENABLED_KEY]: true, [PROVIDER_KEY]: 'gm', [SITE_SEARCH_DISABLED_KEY]: ['gm'] });
  await worker.run();
  const [tab] = worker.created();
  assert.ok(tab, 'the action should open a tab');
  assert.strictEqual(new URL(tab.url).hostname, 'gemini.google.com',
    'the chosen provider should open even when it is hidden from the search sources');
  assert.strictEqual(tab.active, true, 'without grouping the AI page should open in front');
  assert.strictEqual(tab.openerTabId, SOURCE_TAB.id);
  assert.strictEqual(tab.windowId, SOURCE_TAB.windowId);
}

async function testGroupedQueriesUseTheLocalizedGroup() {
  const worker = bootWorker({ [ENABLED_KEY]: true, [PROVIDER_KEY]: 'gpt', [GROUP_KEY]: true });
  await worker.run({ locale: 'zh_CN' });
  const [tab] = worker.created();
  assert.strictEqual(tab.active, false, 'a grouped query should open in the background');
  const update = worker.harness.calls.find((call) => call.name === 'tabGroups.update');
  assert.ok(update, 'the new tab should be put in a group');
  assert.deepStrictEqual(
    { title: update.args[1].title, color: update.args[1].color },
    { title: 'AI 查询', color: 'blue' },
    'the group should carry the localized AI group name'
  );

  const english = bootWorker({ [ENABLED_KEY]: true, [PROVIDER_KEY]: 'gpt', [GROUP_KEY]: true });
  await english.run({ locale: 'en' });
  assert.strictEqual(english.harness.calls.find((call) => call.name === 'tabGroups.update').args[1].title, 'AI Search');
}

async function testAFailedReuseOpensOneFreshTab() {
  const openChatTab = { id: 9, windowId: 2, index: 1, active: false, url: 'https://chatgpt.com/c/older', status: 'complete' };
  const worker = bootWorker({ [ENABLED_KEY]: true, [PROVIDER_KEY]: 'gpt', [GROUP_KEY]: true }, [openChatTab]);
  const response = await worker.run();
  await wait(50);
  const groupedTabs = worker.harness.calls.filter((call) => call.name === 'tabs.group').map((call) => call.args[0].tabIds);
  assert.strictEqual(groupedTabs[0], 9, 'an open page of the provider should be reused first');
  const created = worker.created();
  assert.strictEqual(created.length, 1, 'when the prompt cannot be sent there, one fresh tab should open instead');
  assert.strictEqual(new URL(created[0].url).hostname, 'chatgpt.com');
  assert.strictEqual(response.ok, false, 'the result of the fresh attempt should be reported');
}

async function testRejectsEmptyOrOversizedText() {
  const worker = bootWorker({ [ENABLED_KEY]: true });
  assert.strictEqual((await worker.run({ text: '   ' })).reason, 'invalid-selection-text');
  assert.strictEqual((await worker.run({ text: 'x'.repeat(5000) })).reason, 'invalid-selection-text');
  assert.deepStrictEqual(worker.created(), []);
}

(async () => {
  await testNeedsTheSettingTurnedOn();
  await testOpensThePreferredProviderEvenWhenHiddenFromSearch();
  await testGroupedQueriesUseTheLocalizedGroup();
  await testAFailedReuseOpensOneFreshTab();
  await testRejectsEmptyOrOversizedText();
  console.log('background selection quick action tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
