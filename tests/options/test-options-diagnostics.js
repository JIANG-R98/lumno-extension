const assert = require('assert');
const { createDiagnosticsExport } = require('../../src/options/options-diagnostics.ts');
const { diagnosticErrors } = require('../../src/domain/settings/sync-state.ts');
const { themeMode } = require('../../src/domain/settings/appearance.ts');
const { searchBlacklist } = require('../../src/domain/settings/search.ts');
const { createSettingsStore } = require('../../src/platform/settings-store.ts');

function createDocument() {
  const downloads = [];
  const view = {
    Blob,
    URL: { createObjectURL: (blob) => { downloads.push({ blob }); return 'blob:diagnostics'; }, revokeObjectURL() {} },
    setTimeout: () => 0
  };
  const documentObj = {
    defaultView: view,
    body: { appendChild() {} },
    createElement: () => ({
      click() { downloads[downloads.length - 1].fileName = this.download; },
      remove() {}
    })
  };
  return { documentObj, downloads };
}

// A store over in-memory areas; reading fails when `failing` says so.
function createStore(sync, local, failing) {
  const chromeApi = { runtime: { lastError: null } };
  const area = (values) => ({
    requested: [],
    get(keys, callback) {
      this.requested.push(keys);
      if (failing) {
        chromeApi.runtime.lastError = { message: 'read failed' };
        callback(undefined);
        chromeApi.runtime.lastError = null;
        return;
      }
      const result = {};
      keys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(values, key)) result[key] = values[key];
      });
      callback(result);
    },
    set(items, callback) {
      Object.assign(values, items);
      callback();
    }
  });
  chromeApi.storage = { sync: area(sync), local: area(local) };
  return { chromeApi, store: createSettingsStore({ chromeApi, settings: [] }) };
}

async function run() {
  const { chromeApi, store } = createStore(
    { [themeMode.key]: 'dark', [searchBlacklist.key]: [{ pattern: 'private.example' }], unrelated: true },
    { [diagnosticErrors.key]: [{ at: 0, context: 'Storage write', name: 'Error', message: 'failed', count: 2 }] }
  );
  const { documentObj, downloads } = createDocument();
  const exporter = createDiagnosticsExport({
    settingsStore: store,
    settings: [themeMode, searchBlacklist],
    documentObj,
    getPrimaryAreaName: () => 'local',
    getVersion: () => '1.2.0',
    navigatorObj: { userAgent: 'TestBrowser/1', language: 'de' },
    now: () => Date.UTC(2026, 9, 25, 8)
  });

  await exporter.exportReport();
  assert.deepStrictEqual(chromeApi.storage.sync.requested.filter((keys) => keys.includes(themeMode.key)),
    [[themeMode.key, searchBlacklist.key]], 'only the listed settings are read');
  assert.strictEqual(downloads.length, 1);
  assert.strictEqual(downloads[0].fileName, `lumno-diagnostics-${Date.UTC(2026, 9, 25, 8)}.json`);
  assert.strictEqual(downloads[0].blob.type, 'application/json');
  const report = JSON.parse(await downloads[0].blob.text());
  assert.deepStrictEqual(report, {
    format: 'lumno-diagnostics',
    formatVersion: 1,
    generatedAt: '2026-10-25T08:00:00.000Z',
    extension: { version: '1.2.0' },
    browser: { userAgent: 'TestBrowser/1', language: 'de' },
    storage: { primaryArea: 'local' },
    settings: { [themeMode.key]: 'dark', [searchBlacklist.key]: { redacted: 'list', length: 1 } },
    recentErrors: [{ time: '1970-01-01T00:00:00.000Z', context: 'Storage write', name: 'Error', message: 'failed', count: 2 }]
  });

  // A settings read that fails rejects, so the page can say the export failed.
  const failing = createDiagnosticsExport({
    settingsStore: createStore({}, {}, true).store,
    settings: [themeMode],
    documentObj,
    getPrimaryAreaName: () => 'sync',
    getVersion: () => '1.2.0',
    navigatorObj: null
  });
  await assert.rejects(failing.exportReport(), /could not be read/);
  assert.strictEqual(downloads.length, 1, 'nothing is saved after a failed read');

  console.log('Options diagnostics export tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
