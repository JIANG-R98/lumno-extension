const assert = require('assert');

const tabGroups = require('../../src/background/tab-groups.js');

function createChromeStub(options) {
  const settings = options || {};
  const createdTabs = [];
  const groupedTabs = [];
  let nextTabId = 100;
  const chromeApi = {
    runtime: {
      lastError: null
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1
    },
    tabs: {
      create(createProperties, callback) {
        createdTabs.push({ ...(createProperties || {}) });
        const tab = {
          id: nextTabId++,
          windowId: typeof createProperties.windowId === 'number' ? createProperties.windowId : 1,
          groupId: -1,
          pinned: createProperties.pinned === true,
          url: createProperties.url || ''
        };
        callback(tab);
      },
      group(groupOptions, callback) {
        groupedTabs.push({ ...(groupOptions || {}) });
        if (settings.groupError) {
          chromeApi.runtime.lastError = { message: settings.groupError };
          callback();
          chromeApi.runtime.lastError = null;
          return;
        }
        callback(groupOptions.groupId || 7);
      }
    }
  };
  return { chromeApi, createdTabs, groupedTabs };
}

{
  const { chromeApi, createdTabs, groupedTabs } = createChromeStub();
  let callbackTab = null;
  let callbackInfo = null;
  tabGroups.createTabInSourceGroup(
    chromeApi,
    { url: 'https://example.com/', active: true },
    { id: 10, windowId: 3, groupId: 42 },
    (tab, info) => {
      callbackTab = tab;
      callbackInfo = info;
    }
  );

  assert.deepStrictEqual(
    createdTabs[0],
    { url: 'https://example.com/', active: true, windowId: 3 },
    'grouped source tabs should create the destination in the source window'
  );
  assert.deepStrictEqual(
    groupedTabs[0],
    { tabIds: callbackTab.id, groupId: 42 },
    'created destination tab should be added to the source group'
  );
  assert.strictEqual(callbackInfo.ok, true);
  assert.strictEqual(callbackInfo.grouped, true);
}

{
  const { chromeApi, groupedTabs } = createChromeStub({ groupError: 'cannot group pinned tab' });
  let callbackInfo = null;
  tabGroups.createTabInSourceGroup(
    chromeApi,
    { url: 'https://example.com/' },
    { id: 10, windowId: 3, groupId: 42 },
    (_tab, info) => {
      callbackInfo = info;
    }
  );

  assert.strictEqual(groupedTabs.length, 1);
  assert.strictEqual(callbackInfo.ok, true, 'group failures should not be reported as tab creation failures');
  assert.strictEqual(callbackInfo.grouped, false);
  assert.strictEqual(callbackInfo.groupReason, 'cannot group pinned tab');
}

{
  const { chromeApi, createdTabs, groupedTabs } = createChromeStub();
  tabGroups.createTabInSourceGroup(
    chromeApi,
    { url: 'https://example.com/', pinned: true },
    { id: 10, windowId: 3, groupId: 42 },
    () => {}
  );
  assert.strictEqual(createdTabs[0].windowId, 3);
  assert.strictEqual(groupedTabs.length, 0, 'ordinary helper should not force pinned tabs into a group');
}

assert.strictEqual(
  tabGroups.getSourceTabGroupContext({ id: 1, windowId: 2, groupId: -1 }, { tabGroups: { TAB_GROUP_ID_NONE: -1 } }),
  null,
  'ungrouped source tabs should not produce a group context'
);

console.log('background tab group tests passed');
