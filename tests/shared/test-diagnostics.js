const assert = require('assert');
const diagnostics = require('../../src/domain/diagnostics.ts');
const { createDiagnosticsLog } = require('../../src/platform/diagnostics-log.ts');
const { diagnosticErrors } = require('../../src/domain/settings/sync-state.ts');

function createArea(initial = {}) {
  const values = { ...initial };
  return {
    values,
    writes: 0,
    get(keys, callback) {
      const result = {};
      keys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(values, key)) result[key] = values[key];
      });
      setTimeout(() => callback(result), 0);
    },
    set(items, callback) {
      this.writes += 1;
      Object.assign(values, items);
      setTimeout(callback, 0);
    }
  };
}

async function run() {
  // Failure text keeps the extension's own file paths and drops other addresses.
  assert.strictEqual(
    diagnostics.redactText('Failed to fetch https://intranet.example/private?q=secret from chrome-extension://abc/src/background.js?x=1', 300),
    'Failed to fetch https://... from chrome-extension://.../src/background.js'
  );
  assert.strictEqual(diagnostics.redactText('Mail person@example.com\n  again', 300), 'Mail ...@... again');
  assert.strictEqual(diagnostics.redactText('x'.repeat(20), 10), 'xxxxxxx...');

  // Repeats of the latest failure raise its count; the log keeps the newest entries.
  let log = diagnostics.appendDiagnosticError(undefined, 'Failed to restore pinned tabs.', new Error('Tab not found'), 1000);
  log = diagnostics.appendDiagnosticError(log, 'Failed to restore pinned tabs.', new Error('Tab not found'), 2000);
  assert.deepStrictEqual(log, [{ at: 2000, context: 'Failed to restore pinned tabs.', name: 'Error', message: 'Tab not found', count: 2 }]);
  log = diagnostics.appendDiagnosticError(log, 'Storage write', new DOMException('Quota exceeded', 'QuotaExceededError'), 3000);
  assert.strictEqual(log.length, 2);
  assert.deepStrictEqual(log[1], { at: 3000, context: 'Storage write', name: 'QuotaExceededError', message: 'Quota exceeded', count: 1 });
  assert.deepStrictEqual(diagnostics.appendDiagnosticError([], 'Rejected', 42, 1)[0],
    { at: 1, context: 'Rejected', name: 'number', message: '', count: 1 });
  for (let index = 0; index < diagnostics.MAX_DIAGNOSTIC_ERRORS + 5; index += 1) {
    log = diagnostics.appendDiagnosticError(log, `Step ${index}`, 'failed', 4000 + index);
  }
  assert.strictEqual(log.length, diagnostics.MAX_DIAGNOSTIC_ERRORS);
  assert.strictEqual(log[log.length - 1].context, `Step ${diagnostics.MAX_DIAGNOSTIC_ERRORS + 4}`);

  // A stored log is read as untrusted: malformed entries are dropped.
  assert.deepStrictEqual(diagnostics.readDiagnosticErrors('broken'), []);
  assert.deepStrictEqual(diagnostics.readDiagnosticErrors([
    null,
    { at: 'yesterday', context: 'a', name: 'Error', message: 'b' },
    { at: 1e20, context: 'a', name: 'Error', message: 'b' },
    { at: 5, context: 'a', name: 'Error', message: 'b', count: -3 }
  ]), [{ at: 5, context: 'a', name: 'Error', message: 'b', count: 1 }]);

  // Setting values keep their shape; free text, addresses and site lists do not.
  assert.strictEqual(diagnostics.summarizeSettingValue(true), true);
  assert.strictEqual(diagnostics.summarizeSettingValue(12), 12);
  assert.strictEqual(diagnostics.summarizeSettingValue('zh_CN'), 'zh_CN');
  assert.deepStrictEqual(diagnostics.summarizeSettingValue('example.com'), { redacted: 'text', length: 11 });
  assert.deepStrictEqual(diagnostics.summarizeSettingValue('https://example.com/a'), { redacted: 'text', length: 21 });
  assert.deepStrictEqual(diagnostics.summarizeSettingValue({ mode: 'daily', enabled: true, sizes: [1, 2], words: ['casino'] }),
    { mode: 'daily', enabled: true, sizes: [1, 2], words: { redacted: 'list', length: 1 } });
  assert.deepStrictEqual(diagnostics.summarizeSettingValue({ 'example.com': true }), { redacted: 'object', length: 1 });
  assert.deepStrictEqual(diagnostics.summarizeSettingValue([{ title: 'Bank', url: 'https://bank.example/' }]),
    { redacted: 'list', length: 1 });
  assert.deepStrictEqual(diagnostics.summarizeSettingValue({ a: { b: { c: 1 } } }), { a: { b: { redacted: 'object', length: 1 } } });
  assert.deepStrictEqual(diagnostics.summarizeSettingValue(new Array(30).fill('x')), { redacted: 'list', length: 30 });
  assert.deepStrictEqual(diagnostics.summarizeSettingValue(Infinity), { redacted: 'other' });

  const report = diagnostics.buildDiagnosticsReport({
    generatedAt: '2026-10-25T08:00:00.000Z',
    version: '1.2.0',
    userAgent: 'TestBrowser/1',
    language: 'en-US',
    primaryArea: 'sync',
    settings: [
      { key: 'theme', diagnostics: 'value', stored: 'dark' },
      { key: 'quote', diagnostics: 'value', stored: 'A private note' },
      { key: 'mode', diagnostics: 'shape', stored: 'dark' },
      { key: 'missing', diagnostics: 'value', stored: undefined }
    ],
    errors: [{ at: 0, context: 'Storage write', name: 'Error', message: 'failed', count: 3 }]
  });
  assert.deepStrictEqual(report, {
    format: 'lumno-diagnostics',
    formatVersion: 1,
    generatedAt: '2026-10-25T08:00:00.000Z',
    extension: { version: '1.2.0' },
    browser: { userAgent: 'TestBrowser/1', language: 'en-US' },
    storage: { primaryArea: 'sync' },
    settings: { theme: 'dark', quote: { redacted: 'text', length: 14 }, mode: { redacted: 'text', length: 4 } },
    recentErrors: [{ time: '1970-01-01T00:00:00.000Z', context: 'Storage write', name: 'Error', message: 'failed', count: 3 }]
  });

  // The log writes one failure after another and never rejects.
  const area = createArea();
  let clock = 10;
  const diagnosticsLog = createDiagnosticsLog({ chromeApi: { runtime: {} }, area, now: () => (clock += 1) });
  await Promise.all([
    diagnosticsLog.record('First', new Error('one')),
    diagnosticsLog.record('Second', new Error('two'))
  ]);
  assert.deepStrictEqual((await diagnosticsLog.read()).map((entry) => [entry.context, entry.at]), [['First', 11], ['Second', 12]]);
  assert.deepStrictEqual(Object.keys(area.values), [diagnosticErrors.key]);

  const failingChrome = { runtime: { lastError: null } };
  const failingArea = createArea();
  failingArea.set = (items, callback) => {
    failingChrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
    callback();
    failingChrome.runtime.lastError = null;
  };
  const failingLog = createDiagnosticsLog({ chromeApi: failingChrome, area: failingArea });
  await failingLog.record('Write', new Error('x'));
  assert.deepStrictEqual(await failingLog.read(), []);
  assert.deepStrictEqual(await createDiagnosticsLog({ chromeApi: null, area: null }).read(), []);

  console.log('Diagnostics tests passed: redaction, log, setting summaries and report');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
