const assert = require('assert');
const bookmarkStore = require('../../src/newtab/bookmarks-store.js');
const {
  BOOKMARK_EVENT_NAMES,
  createBookmarksRuntime
} = require('../../src/newtab/bookmarks-runtime.js');

function createChromeEvent() {
  const listeners = new Set();
  return {
    addListener(listener) {
      listeners.add(listener);
    },
    removeListener(listener) {
      listeners.delete(listener);
    },
    emit(...args) {
      Array.from(listeners).forEach((listener) => listener(...args));
    },
    get size() {
      return listeners.size;
    }
  };
}

function createTree() {
  return [{
    id: '0',
    title: '',
    children: [{
      id: '10',
      title: 'Bookmarks bar',
      children: [
        {
          id: '11',
          title: 'OpenAI',
          url: 'https://openai.com/'
        },
        {
          id: '13',
          title: 'Design',
          children: [{
            id: '14',
            title: 'Figma',
            url: 'https://figma.com/files'
          }]
        }
      ]
    }]
  }];
}

async function run() {
  const events = Object.fromEntries(
    BOOKMARK_EVENT_NAMES.map((eventName) => [eventName, createChromeEvent()])
  );
  const calls = {
    getTree: 0,
    move: [],
    update: [],
    remove: [],
    removeTree: [],
    create: []
  };
  let createdId = 100;
  const chromeApi = {
    runtime: {
      lastError: null
    },
    bookmarks: {
      ...events,
      getTree(callback) {
        calls.getTree += 1;
        callback(createTree());
      },
      move(id, destination, callback) {
        calls.move.push({ id, destination });
        events.onMoved.emit(id, { parentId: destination.parentId });
        callback({ id, ...destination });
      },
      update(id, changes, callback) {
        calls.update.push({ id, changes });
        events.onChanged.emit(id, changes);
        callback({ id, ...changes });
      },
      remove(id, callback) {
        calls.remove.push(id);
        events.onRemoved.emit(id, {});
        callback();
      },
      removeTree(id, callback) {
        calls.removeTree.push(id);
        events.onRemoved.emit(id, {});
        callback();
      },
      create(details, callback) {
        const node = { ...details, id: String(createdId) };
        createdId += 1;
        calls.create.push(node);
        events.onCreated.emit(node.id, node);
        callback(node);
      }
    }
  };
  const runtime = createBookmarksRuntime({
    chromeApi,
    store: bookmarkStore,
    normalizeHost: (host) => String(host || '').toLowerCase()
  });

  const root = await runtime.readFolder('', { rootTitle: '书签' });
  assert.strictEqual(root.ready, true);
  assert.strictEqual(root.rootFolderId, '10');
  assert.strictEqual(root.folderId, '10');
  assert.deepStrictEqual(root.items.map((item) => item.id), ['11', '13']);
  assert.strictEqual(calls.getTree, 1);
  assert.strictEqual(
    runtime.getSnapshot().folderItemsCache.has('13'),
    false,
    'startup should not build unopened bookmark folders'
  );

  const nested = await runtime.readFolder('13', { rootTitle: '书签' });
  assert.deepStrictEqual(nested.path.map((item) => item.title), ['书签', 'Design']);
  assert.deepStrictEqual(nested.items.map((item) => item.id), ['14']);
  assert.strictEqual(runtime.getNode('14').title, 'Figma');
  assert.strictEqual(runtime.getFolderItems('13')[0].parentId, '13');
  assert.strictEqual(
    runtime.getSnapshot().folderItemsCache.has('13'),
    true,
    'opening a bookmark folder should cache its items for later reads'
  );

  const fallback = await runtime.readFolder('missing', {
    rootTitle: '书签',
    limit: 1
  });
  assert.strictEqual(fallback.folderId, '10');
  assert.deepStrictEqual(fallback.items.map((item) => item.id), ['11']);

  const changes = [];
  const unsubscribe = runtime.subscribe((change) => {
    changes.push(change);
  });
  BOOKMARK_EVENT_NAMES.forEach((eventName) => {
    assert.strictEqual(events[eventName].size, 1);
  });

  events.onChanged.emit('11', { title: 'Updated' });
  assert.strictEqual(changes.length, 1);
  assert.strictEqual(changes[0].eventName, 'onChanged');
  assert.strictEqual(changes[0].invalidatesHistory, false);
  assert.strictEqual(runtime.getSnapshot().dirty, true);
  await runtime.ensureReady(false);
  assert.strictEqual(calls.getTree, 2);

  const controlledUpdateChangesBefore = changes.length;
  const updatedNode = await runtime.runControlledMutation(() => {
    return runtime.update('11', {
      title: 'OpenAI Docs',
      url: 'https://openai.com/docs'
    });
  });
  assert.deepStrictEqual(updatedNode, {
    id: '11',
    title: 'OpenAI Docs',
    url: 'https://openai.com/docs'
  });
  assert.deepStrictEqual(calls.update[0], {
    id: '11',
    changes: {
      title: 'OpenAI Docs',
      url: 'https://openai.com/docs'
    }
  });
  assert.strictEqual(changes.length, controlledUpdateChangesBefore + 1);
  assert.strictEqual(changes.at(-1).eventName, 'onChanged');
  assert.strictEqual(changes.at(-1).isControlled, true);
  assert.strictEqual(changes.at(-1).shouldRefreshCascade, true);

  const controlledChangesBefore = changes.length;
  const movedNode = await runtime.runControlledMutation(async () => {
    const node = await runtime.move('11', { parentId: '13', index: 2.4 });
    events.onChildrenReordered.emit('13', {});
    return node;
  });
  assert.strictEqual(movedNode.parentId, '13');
  assert.deepStrictEqual(calls.move[0], {
    id: '11',
    destination: {
      parentId: '13',
      index: 2
    }
  });
  assert.strictEqual(
    changes.length,
    controlledChangesBefore + 1,
    'one controlled mutation should coalesce its browser event burst'
  );
  assert.strictEqual(changes.at(-1).isControlled, true);

  await runtime.runControlledMutation(() => runtime.remove('11'));
  await runtime.runControlledMutation(() => runtime.remove('13', { recursive: true }));
  assert.deepStrictEqual(calls.remove, ['11']);
  assert.deepStrictEqual(calls.removeTree, ['13']);

  const restoredRoot = await runtime.runControlledMutation(() => runtime.restore({
    title: 'Restored',
    url: '',
    children: [
      {
        title: 'Child link',
        url: 'https://example.com/',
        children: []
      },
      {
        title: 'Nested',
        url: '',
        children: [{
          title: 'Deep link',
          url: 'https://example.com/deep',
          children: []
        }]
      }
    ]
  }, {
    parentId: '10',
    index: 1
  }));
  assert.strictEqual(restoredRoot.title, 'Restored');
  assert.deepStrictEqual(
    calls.create.map((node) => ({
      parentId: node.parentId,
      index: node.index,
      title: node.title,
      url: node.url || ''
    })),
    [
      { parentId: '10', index: 1, title: 'Restored', url: '' },
      { parentId: '100', index: 0, title: 'Child link', url: 'https://example.com/' },
      { parentId: '100', index: 1, title: 'Nested', url: '' },
      { parentId: '102', index: 0, title: 'Deep link', url: 'https://example.com/deep' }
    ]
  );

  unsubscribe();
  BOOKMARK_EVENT_NAMES.forEach((eventName) => {
    assert.strictEqual(events[eventName].size, 0);
  });

  const pendingTreeCallbacks = [];
  const staleRuntime = createBookmarksRuntime({
    store: bookmarkStore,
    chromeApi: {
      runtime: { lastError: null },
      bookmarks: {
        getTree(callback) {
          pendingTreeCallbacks.push(callback);
        }
      }
    }
  });
  const staleLoad = staleRuntime.ensureReady(false);
  staleRuntime.invalidate();
  pendingTreeCallbacks.shift()(createTree());
  assert.strictEqual(await staleLoad, false);
  assert.strictEqual(staleRuntime.getSnapshot().ready, false);

  const sharedTreeCallbacks = [];
  let sharedTreeReads = 0;
  const sharedRuntime = createBookmarksRuntime({
    store: bookmarkStore,
    chromeApi: {
      runtime: { lastError: null },
      bookmarks: {
        getTree(callback) {
          sharedTreeReads += 1;
          sharedTreeCallbacks.push(callback);
        }
      }
    }
  });
  const cardSurfaceReload = sharedRuntime.readFolder('10');
  const cascadeSurfaceReload = sharedRuntime.ensureReady(false);
  assert.strictEqual(
    sharedTreeReads,
    1,
    'card and cascade surfaces should share one in-flight tree reload'
  );
  sharedTreeCallbacks.shift()(createTree());
  assert.strictEqual(await cascadeSurfaceReload, true);
  assert.deepStrictEqual(
    (await cardSurfaceReload).items.map((item) => item.id),
    ['11', '13'],
    'a concurrent cascade refresh must not turn the card surface into an empty result'
  );

  console.log('New tab bookmarks runtime tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
