const assert = require('assert');
const bookmarkTabGroups = require('../../src/background/bookmark-tab-groups.js');

const folderTree = {
  id: 'folder-1',
  title: 'Research',
  children: [
    { id: 'a', url: 'https://a.example/' },
    {
      id: 'nested',
      title: 'Nested',
      children: [
        { id: 'duplicate', url: 'https://a.example/' },
        { id: 'script', url: 'javascript:alert(1)' },
        { id: 'b', url: 'https://b.example/' }
      ]
    }
  ]
};

function createChromeApi(options = {}) {
  const created = [];
  const grouped = [];
  const updated = [];
  const runtime = { lastError: null };
  let nextTabId = 100;
  const withLastError = (message, callback, value) => {
    runtime.lastError = message ? { message } : null;
    callback(value);
    runtime.lastError = null;
  };
  return {
    api: {
      runtime,
      bookmarks: {
        getSubTree(folderId, callback) {
          assert.strictEqual(folderId, 'folder-1');
          withLastError(options.bookmarkError, callback, [options.tree || folderTree]);
        }
      },
      tabs: {
        create(createProperties, callback) {
          created.push({ ...createProperties });
          if (createProperties.url === options.failUrl) {
            withLastError('create failed', callback, null);
            return;
          }
          nextTabId += 1;
          withLastError('', callback, { id: nextTabId });
        },
        group(groupProperties, callback) {
          grouped.push({ tabIds: [...groupProperties.tabIds] });
          withLastError(options.groupError, callback, 44);
        }
      },
      tabGroups: {
        update(groupId, updateProperties, callback) {
          updated.push({ groupId, ...updateProperties });
          withLastError(options.updateError, callback, { id: groupId });
        }
      }
    },
    created,
    grouped,
    updated
  };
}

async function run() {
  assert.deepStrictEqual(bookmarkTabGroups.collectBookmarkUrls(folderTree), [
    'https://a.example/',
    'https://a.example/',
    'https://b.example/'
  ]);

  const success = createChromeApi();
  const successResult = await bookmarkTabGroups.openBookmarkFolderInNewTabGroup(
    success.api,
    {
      folderId: 'folder-1',
      title: 'Research',
      windowId: 7,
      insertIndex: 3
    }
  );
  assert.deepStrictEqual(successResult, {
    ok: true,
    requestedCount: 3,
    openedCount: 3,
    failedCount: 0,
    groupId: 44,
    reason: ''
  });
  assert.deepStrictEqual(success.created, [
    { url: 'https://a.example/', active: false, windowId: 7, index: 3 },
    { url: 'https://a.example/', active: false, windowId: 7, index: 4 },
    { url: 'https://b.example/', active: false, windowId: 7, index: 5 }
  ]);
  assert.deepStrictEqual(success.grouped, [{ tabIds: [101, 102, 103] }]);
  assert.deepStrictEqual(success.updated, [{ groupId: 44, title: 'Research' }]);

  const partial = createChromeApi({ failUrl: 'https://a.example/' });
  const partialResult = await bookmarkTabGroups.openBookmarkFolderInNewTabGroup(
    partial.api,
    { folderId: 'folder-1', title: 'Research' }
  );
  assert.strictEqual(partialResult.ok, false);
  assert.strictEqual(partialResult.requestedCount, 3);
  assert.strictEqual(partialResult.openedCount, 1);
  assert.strictEqual(partialResult.failedCount, 2);
  assert.strictEqual(partialResult.groupId, 44);
  assert.deepStrictEqual(partial.grouped, [{ tabIds: [101] }]);

  const empty = createChromeApi({
    tree: { id: 'folder-1', title: 'Empty', children: [] }
  });
  const emptyResult = await bookmarkTabGroups.openBookmarkFolderInNewTabGroup(
    empty.api,
    { folderId: 'folder-1' }
  );
  assert.strictEqual(emptyResult.reason, 'empty-folder');
  assert.strictEqual(empty.created.length, 0);

  const unavailableResult = await bookmarkTabGroups.openBookmarkFolderInNewTabGroup(
    {},
    { folderId: 'folder-1' }
  );
  assert.strictEqual(unavailableResult.reason, 'bookmarks-api-unavailable');
}

run()
  .then(() => console.log('background bookmark tab group tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
