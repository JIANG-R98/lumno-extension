const assert = require('assert');
const diagnostics = require('../../src/domain/diagnostics.ts');
const { createDiagnosticsExport } = require('../../src/options/options-diagnostics.ts');

function createArea(values) {
  return {
    requested: [],
    get(keys, callback) {
      this.requested.push(keys);
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
  };
}

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

async function run() {
  const settingsArea = createArea({ theme: 'dark', quote: 'A private note', unrelated: true });
  const localArea = createArea({
    [diagnostics.DIAGNOSTIC_ERRORS_STORAGE_KEY]: [{ at: 0, context: 'Storage write', name: 'Error', message: 'failed', count: 2 }]
  });
  const { documentObj, downloads } = createDocument();
  const exporter = createDiagnosticsExport({
    chromeApi: { runtime: {} },
    documentObj,
    getPrimaryAreaName: () => 'local',
    getSettingsArea: () => settingsArea,
    getVersion: () => '1.2.0',
    localArea,
    navigatorObj: { userAgent: 'TestBrowser/1', language: 'de' },
    now: () => Date.UTC(2026, 9, 25, 8),
    settingKeys: ['theme', 'quote']
  });

  await exporter.exportReport();
  assert.deepStrictEqual(settingsArea.requested, [['theme', 'quote']], 'only the listed settings are read');
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
    settings: { theme: 'dark', quote: { redacted: 'text', length: 14 } },
    recentErrors: [{ time: '1970-01-01T00:00:00.000Z', context: 'Storage write', name: 'Error', message: 'failed', count: 2 }]
  });

  // A settings read that fails rejects, so the page can say the export failed.
  const failingChrome = { runtime: { lastError: null } };
  const failing = createDiagnosticsExport({
    chromeApi: failingChrome,
    documentObj,
    getPrimaryAreaName: () => 'sync',
    getSettingsArea: () => ({
      get(keys, callback) {
        failingChrome.runtime.lastError = { message: 'read failed' };
        callback(undefined);
        failingChrome.runtime.lastError = null;
      },
      set() {}
    }),
    getVersion: () => '1.2.0',
    localArea: null,
    navigatorObj: null,
    settingKeys: ['theme']
  });
  await assert.rejects(failing.exportReport(), /read failed/);
  assert.strictEqual(downloads.length, 1, 'nothing is saved after a failed read');

  console.log('Options diagnostics export tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
