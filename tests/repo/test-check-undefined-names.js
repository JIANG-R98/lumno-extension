const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkUndefinedNames } = require('../../scripts/check/check-undefined-names');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumno-undefined-names-'));
function write(name, source) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, source);
  return file;
}

try {
  const publisher = write('publisher.js', `(function(root) {
  root.LumnoFixtureApi = { create() { return 1; } };
})(globalThis);
`);
  const consumer = write('consumer.js', `(function() {
  const value = LumnoFixtureApi.create();
  function kept() { return value; }
  const deps = { kept, removedHelper };
  deletedFunction(deps);
  chrome.runtime.sendMessage({ action: 'ping' });
  document.body.append(String(value));
})();
`);
  const exporter = write('exporter.js', `export function kept() { return 1; }
`);
  const importer = write('importer.js', `import { kept, removedExport } from './exporter.js';
import { missing } from './deleted-module.js';
export const values = [kept(), removedExport, missing];
`);
  const problems = checkUndefinedNames([publisher, consumer, exporter, importer]);
  assert.strictEqual(problems.length, 4, problems.join('\n'));
  assert.ok(problems.some((line) => /importer\.js:1:.*removedExport/.test(line)),
    'an import of a deleted export is reported');
  assert.ok(problems.some((line) => /importer\.js:2:.*deleted-module/.test(line)),
    'an import of a deleted module is reported');
  assert.ok(problems.some((line) => /consumer\.js:4:.*removedHelper/.test(line)),
    'a shorthand property naming a deleted function is reported');
  assert.ok(problems.some((line) => /consumer\.js:5:.*deletedFunction/.test(line)),
    'a call to a deleted function is reported');
  assert.ok(!problems.some((line) => /LumnoFixtureApi|chrome|document/.test(line)),
    'published globals, chrome and DOM globals resolve');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('undefined-name check tests passed');
