const assert = require('assert');
const selectionTarget = require('../src/background/selection-target.js');

function createChromeStub(options) {
  const settings = options || {};
  const createdTabs = [];
  const groupedTabs = [];
  const queriedTabs = [];
  const updatedGroups = [];
  let nextTabId = 100;
  const chromeApi = {
    runtime: { lastError: null },
    tabGroups: {
      query(queryInfo, callback) {
        callback(settings.existingGroup ? [{ id: 33, ...queryInfo }] : []);
      },
      update(groupId, updateInfo, callback) {
        updatedGroups.push({ groupId, ...updateInfo });
        callback();
      }
    },
    tabs: {
      query(queryInfo, callback) {
        queriedTabs.push({ ...queryInfo });
        callback(Array.isArray(settings.openTabs) ? settings.openTabs.map((tab) => ({ ...tab })) : []);
      },
      create(createProperties, callback) {
        createdTabs.push({ ...createProperties });
        callback({
          id: nextTabId++,
          windowId: createProperties.windowId || 1,
          url: createProperties.url,
          active: createProperties.active
        });
      },
      group(groupInfo, callback) {
        groupedTabs.push({ ...groupInfo });
        callback(typeof groupInfo.groupId === 'number' ? groupInfo.groupId : 44);
      }
    }
  };
  return { chromeApi, createdTabs, groupedTabs, queriedTabs, updatedGroups };
}

{
  const { chromeApi, createdTabs, groupedTabs } = createChromeStub({ existingGroup: true });
  let response = null;
  selectionTarget.openSelectionTarget(chromeApi, {
    url: 'https://chatgpt.com/',
    sourceTab: { id: 12, windowId: 9, groupId: 77 }
  }, (result) => {
    response = result;
  });
  assert.deepStrictEqual(createdTabs[0], {
    url: 'https://chatgpt.com/',
    active: true,
    windowId: 9,
    openerTabId: 12
  }, 'selection targets should open an active new tab by default');
  assert.strictEqual(groupedTabs.length, 0, 'selection targets should stay ungrouped by default');
  assert.strictEqual(response.mode, 'tab');
  assert.strictEqual(response.groupId, null);
}

{
  const { chromeApi, groupedTabs, updatedGroups } = createChromeStub({ existingGroup: true });
  let response = null;
  selectionTarget.openSelectionTarget(chromeApi, {
    url: 'https://chatgpt.com/',
    sourceTab: { id: 12, windowId: 9, groupId: 77 },
    groupEnabled: true,
    groupTitle: 'AI 検索'
  }, (result) => {
    response = result;
  });
  assert.deepStrictEqual(
    groupedTabs[0],
    { tabIds: 100, groupId: 33 },
    'background AI targets should always join the localized AI group rather than the source page group'
  );
  assert.deepStrictEqual(updatedGroups[0], {
    groupId: 33,
    title: 'AI 検索',
    color: 'blue',
    collapsed: true
  });
  assert.strictEqual(response.mode, 'group');
  assert.strictEqual(response.groupId, 33);
}

{
  const { chromeApi, createdTabs, groupedTabs, queriedTabs } = createChromeStub({
    existingGroup: true,
    openTabs: [
      {
        id: 64,
        windowId: 9,
        url: 'https://chatgpt.com/c/existing-conversation',
        status: 'complete',
        active: false,
        lastAccessed: 200
      },
      {
        id: 65,
        windowId: 9,
        url: 'https://attacker.example/?next=https://chatgpt.com/',
        status: 'complete',
        active: false,
        lastAccessed: 300
      }
    ]
  });
  let response = null;
  selectionTarget.openSelectionTarget(chromeApi, {
    url: 'https://chatgpt.com/',
    sourceTab: { id: 7, windowId: 9 },
    groupEnabled: true
  }, (result) => {
    response = result;
  });
  assert.deepStrictEqual(queriedTabs[0], { windowId: 9 },
    'reuse should stay inside the source window');
  assert.strictEqual(createdTabs.length, 0,
    'an already-open page for the same AI provider should be reused instead of duplicated');
  assert.deepStrictEqual(groupedTabs[0], { tabIds: 64, groupId: 33 },
    'a reused AI page should be collected into the dedicated AI group');
  assert.strictEqual(response.mode, 'reused');
  assert.strictEqual(response.tab.id, 64);
}

{
  const { chromeApi, createdTabs, groupedTabs } = createChromeStub({
    existingGroup: true,
    openTabs: [
      {
        id: 7,
        windowId: 9,
        url: 'https://chatgpt.com/c/source-conversation',
        status: 'complete',
        active: true,
        lastAccessed: 400
      }
    ]
  });
  let response = null;
  selectionTarget.openSelectionTarget(chromeApi, {
    url: 'https://chatgpt.com/',
    sourceTab: { id: 7, windowId: 9 },
    groupEnabled: true
  }, (result) => {
    response = result;
  });
  assert.deepStrictEqual(createdTabs[0], {
    url: 'https://chatgpt.com/',
    active: false,
    windowId: 9,
    openerTabId: 7
  }, 'the page that triggered the selection action must not be reused as its own target');
  assert.deepStrictEqual(groupedTabs[0], { tabIds: 100, groupId: 33 },
    'a fresh target should join the dedicated AI group');
  assert.strictEqual(response.mode, 'group');
  assert.strictEqual(response.tab.id, 100);
}

{
  const { chromeApi, createdTabs, groupedTabs, updatedGroups } = createChromeStub({ existingGroup: true });
  let response = null;
  selectionTarget.openSelectionTarget(chromeApi, {
    url: 'https://chatgpt.com/',
    sourceTab: { id: 7, windowId: 9 },
    groupEnabled: true
  }, (result) => {
    response = result;
  });
  assert.deepStrictEqual(createdTabs[0], {
    url: 'https://chatgpt.com/',
    active: false,
    windowId: 9,
    openerTabId: 7
  });
  assert.deepStrictEqual(groupedTabs[0], { tabIds: 100, groupId: 33 });
  assert.deepStrictEqual(updatedGroups[0], {
    groupId: 33,
    title: 'AI Search',
    color: 'blue',
    collapsed: true
  });
  assert.strictEqual(response.mode, 'group');
  assert.strictEqual(response.groupId, 33);
}

{
  const { chromeApi, groupedTabs } = createChromeStub();
  let response = null;
  selectionTarget.openSelectionTarget(chromeApi, {
    url: 'https://gemini.google.com/app',
    sourceTab: { id: 8, windowId: 2 },
    groupEnabled: true
  }, (result) => {
    response = result;
  });
  assert.deepStrictEqual(groupedTabs[0], { tabIds: 100 });
  assert.strictEqual(response.mode, 'group');
  assert.strictEqual(response.groupId, 44);
}

console.log('background selection target tests passed');
