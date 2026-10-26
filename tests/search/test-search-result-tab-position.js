const assert = require('assert');
const settings = require('../../src/domain/settings/index.ts');
const { loadBackground, wait } = require('../helpers/background-harness');

// Where a search result opens: next to the tab the search came from, before
// it, or at the end of the strip, as Settings says, and in that tab's group.
// The real worker handles the messages the search surfaces send.

const SOURCE = { id: 10, index: 5, windowId: 3, groupId: 42, url: 'https://page.test/' };
// The page's own view of its tab is older; the worker should ask again.
const SENDER = { tab: Object.assign({}, SOURCE, { index: 1 }), url: SOURCE.url };

function createWorker(options = {}) {
  const searched = [];
  const grouped = [];
  const worker = loadBackground({
    tabs: options.closedSource ? [] : [Object.assign({}, SOURCE)],
    sync: options.position ? { [settings.searchResultTabPosition.key]: options.position } : {},
    configureChrome(chrome) {
      chrome.tabGroups = Object.assign({ TAB_GROUP_ID_NONE: -1 }, chrome.tabGroups || {});
      chrome.tabs.group = (properties, callback) => {
        grouped.push(JSON.parse(JSON.stringify(properties)));
        setTimeout(() => callback(properties.groupId), 0);
      };
      const create = chrome.tabs.create;
      chrome.tabs.create = (properties, callback) => {
        if (options.createError) {
          chrome.runtime.lastError = { message: 'create failed' };
          callback();
          chrome.runtime.lastError = null;
          return;
        }
        create(properties, (tab) => callback(Object.assign({}, tab, { id: 100, groupId: -1 })));
      };
      if (options.noSearchApi) {
        delete chrome.search;
        return;
      }
      chrome.search = {
        query(properties, callback) {
          searched.push(JSON.parse(JSON.stringify(properties)));
          if (options.searchThrows) throw new Error('search unavailable');
          chrome.runtime.lastError = options.searchError ? { message: 'search failed' } : null;
          setTimeout(() => {
            callback();
            chrome.runtime.lastError = null;
          }, 0);
        }
      };
    }
  });
  const recorded = (name) => worker.calls.filter((call) => call.name === name).map((call) => JSON.parse(JSON.stringify(call.args)));
  return {
    send: async (request, sender = SENDER) => {
      await wait(30);
      return worker.sendMessage(request, sender, 1000);
    },
    created: () => recorded('tabs.create').map(([properties]) => properties),
    updated: () => recorded('tabs.update').map(([id, properties]) => Object.assign({ id }, properties)),
    searched,
    grouped
  };
}

async function run() {
  assert.strictEqual(settings.searchResultTabPosition.parse(undefined), 'end');
  assert.strictEqual(settings.searchResultTabPosition.parse('invalid'), 'end');
  assert.strictEqual(settings.searchResultTabPosition.parse('beforeCurrent'), 'beforeCurrent');

  for (const [position, index] of [['afterCurrent', 6], ['beforeCurrent', 5]]) {
    for (const disposition of ['newTab', 'backgroundTab']) {
      const worker = createWorker({ position });
      const response = await worker.send({ action: 'searchOrNavigate', query: 'hello', disposition });
      assert.strictEqual(response && response.ok, true);
      assert.deepStrictEqual(worker.created(), [{ url: 'about:blank', active: disposition === 'newTab', index, windowId: 3 }],
        `${position} ${disposition}: the search should open in a tab placed from the source tab's current index`);
      assert.deepStrictEqual(worker.searched, [{ text: 'hello', tabId: 100 }], 'the browser search should fill that tab');
      assert.deepStrictEqual(worker.grouped, [{ tabIds: 100, groupId: 42 }], 'and the tab should join the source tab group');
    }
  }

  const directUrl = createWorker({ position: 'afterCurrent' });
  await directUrl.send({ action: 'searchOrNavigate', query: 'https://example.test/' });
  assert.strictEqual(directUrl.created()[0].index, 6, 'a typed URL should open beside the source tab too');
  assert.strictEqual(directUrl.searched.length, 0);

  const defaultPosition = createWorker();
  await defaultPosition.send({ action: 'searchOrNavigate', query: 'hello' });
  assert.strictEqual(defaultPosition.created().length, 0, 'without a preference, searches keep the browser NEW_TAB path');
  assert.deepStrictEqual(defaultPosition.searched, [{ text: 'hello', disposition: 'NEW_TAB' }]);

  const defaultBackground = createWorker();
  await defaultBackground.send({ action: 'searchOrNavigate', query: 'hello', disposition: 'backgroundTab' });
  const [backgroundTab] = defaultBackground.created();
  assert.deepStrictEqual([backgroundTab.active, backgroundTab.windowId, backgroundTab.index], [false, 3, undefined]);
  assert.match(backgroundTab.url, /hello/, 'background searches open the engine URL directly');
  assert.strictEqual(defaultBackground.searched.length, 0);

  const defaultLink = createWorker();
  await defaultLink.send({ action: 'createTab', url: 'https://example.test/' });
  assert.strictEqual(defaultLink.created()[0].index, undefined, 'without a preference, links open at the end');

  const endPosition = createWorker({ position: 'end' });
  await endPosition.send({ action: 'searchOrNavigate', query: 'https://example.test/' });
  assert.strictEqual(endPosition.created()[0].index, undefined, 'the end of the strip is an explicit choice');

  const fromPage = createWorker({ position: 'afterCurrent' });
  await fromPage.send({ action: 'createTab', url: 'https://example.test/', disposition: 'backgroundTab' }, { tab: SENDER.tab, url: SOURCE.url });
  assert.deepStrictEqual(fromPage.created()[0], { url: 'https://example.test/', active: false, index: 6, windowId: 3 });

  const current = createWorker({ position: 'afterCurrent' });
  await current.send({ action: 'createTab', url: 'https://example.test/', disposition: 'currentTab' });
  assert.strictEqual(current.created().length, 0);
  assert.deepStrictEqual(current.updated(), [{ id: 10, url: 'https://example.test/', active: true }], 'current-tab opens reuse the source tab');

  const closed = createWorker({ position: 'afterCurrent', closedSource: true });
  await closed.send({ action: 'createTab', url: 'https://example.test/' });
  assert.strictEqual(closed.created()[0].index, undefined, 'a closed source tab must not leave a stale insertion index');
  assert.strictEqual(closed.grouped.length, 0);

  for (const failure of [{ searchError: true }, { searchThrows: true }]) {
    const worker = createWorker(Object.assign({ position: 'afterCurrent' }, failure));
    const response = await worker.send({ action: 'searchOrNavigate', query: 'hello' });
    assert.strictEqual(response && response.ok, true);
    assert.strictEqual(worker.created().length, 1, 'a failed browser search should reuse the positioned tab');
    const [update] = worker.updated();
    assert.ok(update && update.id === 100 && /hello/.test(update.url), 'and load the engine URL into it');
  }

  const unavailable = createWorker({ position: 'afterCurrent', noSearchApi: true });
  await unavailable.send({ action: 'searchOrNavigate', query: 'hello' });
  assert.strictEqual(unavailable.created()[0].index, 6);
  assert.match(unavailable.created()[0].url, /hello/, 'without the search API the engine URL opens in place');

  const failedCreate = createWorker({ position: 'afterCurrent', createError: true });
  const failure = await failedCreate.send({ action: 'searchOrNavigate', query: 'hello' });
  assert.strictEqual(failure && failure.ok, false);
  assert.strictEqual(failedCreate.searched.length, 0);
  console.log('search result tab position tests passed');
  process.exit(0);
}

run().catch((error) => { console.error(error); process.exit(1); });
