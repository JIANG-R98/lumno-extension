const assert = require('assert');
const vm = require('vm');
const { runModuleInContext } = require('../helpers/module-script');
const { loadBackground, wait } = require('../helpers/background-harness');

// Reloading an unpacked extension fires onInstalled with reason "update" and
// the same version. That reload should not be announced as an update, while a
// real version change should; a browser restart should not sweep open tabs.

const UPDATE_NOTICE_KEY = '_x_lumno_update_notice_2026_unique_';

function loadRuntime() {
  const sandbox = { Promise };
  sandbox.globalThis = sandbox;
  return runModuleInContext('src/background/dev-extension-startup.ts', vm.createContext(sandbox));
}

function noticeWrites(harness) {
  return ['sync', 'local'].flatMap((area) => harness.storage[area].writes.filter((write) => UPDATE_NOTICE_KEY in write));
}

function observerSweeps(harness) {
  return harness.calls.filter((call) => call.name === 'scripting.executeScript' &&
    call.args[0].files && call.args[0].files.includes('build/shortcut-key-observer.js'));
}

const openTabs = [{ id: 1, windowId: 1, active: true, url: 'https://open.example.com/', status: 'complete' }];

async function run() {
  const runtime = loadRuntime();
  assert.strictEqual(runtime.isSameVersionReload({ reason: 'update', previousVersion: '0.9.22' }, '0.9.22'), true);
  assert.strictEqual(runtime.isSameVersionReload({ reason: 'update', previousVersion: '0.9.21' }, '0.9.22'), false);
  assert.strictEqual(runtime.isSameVersionReload({ reason: 'chrome_update', previousVersion: '0.9.22' }, '0.9.22'), false);

  const reload = loadBackground({ version: '0.9.22', tabs: openTabs, fetch: () => Promise.reject(new Error('offline')) });
  await wait(30);
  reload.chrome.runtime.onInstalled.dispatch({ reason: 'update', previousVersion: '0.9.22' });
  await wait(100);
  assert.deepStrictEqual(noticeWrites(reload), [], 'reloading the same version should not publish an update notice');
  assert.strictEqual(observerSweeps(reload).length, 1, 'a reload should still prepare the shortcut observer in open tabs');

  const update = loadBackground({ version: '0.9.22', tabs: openTabs, fetch: () => Promise.reject(new Error('offline')) });
  await wait(30);
  update.chrome.runtime.onInstalled.dispatch({ reason: 'update', previousVersion: '0.9.21' });
  await wait(100);
  const [write] = noticeWrites(update);
  assert.ok(write, 'a new version should publish an update notice');
  assert.strictEqual(JSON.parse(JSON.stringify(write[UPDATE_NOTICE_KEY])).previousVersion, 'v0.9.21');

  const restart = loadBackground({ version: '0.9.22', tabs: openTabs });
  await wait(30);
  restart.calls.length = 0;
  restart.chrome.runtime.onStartup.dispatch();
  await wait(100);
  assert.deepStrictEqual(observerSweeps(restart), [],
    'restored tabs load with the manifest content scripts, so startup should not sweep them');
}

run().then(() => {
  console.log('development extension startup tests passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
