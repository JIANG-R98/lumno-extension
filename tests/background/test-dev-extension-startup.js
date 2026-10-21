const assert = require('assert');
const vm = require('vm');
const { readBackgroundSource } = require('../helpers/background-source');
const { runModuleInContext } = require('../helpers/module-script');

function loadRuntime() {
  const sandbox = { Promise };
  sandbox.globalThis = sandbox;
  return runModuleInContext('src/background/dev-extension-startup.js', vm.createContext(sandbox));
}

async function run() {
  const runtime = loadRuntime();
  assert.strictEqual(runtime.isSameVersionReload({ reason: 'update', previousVersion: '0.9.22' }, '0.9.22'), true);
  assert.strictEqual(runtime.isSameVersionReload({ reason: 'update', previousVersion: '0.9.21' }, '0.9.22'), false);
  assert.strictEqual(runtime.isSameVersionReload({ reason: 'chrome_update', previousVersion: '0.9.22' }, '0.9.22'), false);

  const backgroundSource = readBackgroundSource();
  assert.match(backgroundSource, /import \* as DEV_EXTENSION_STARTUP from '\.\/dev-extension-startup\.js';/);
  assert.match(backgroundSource, /DEV_EXTENSION_STARTUP\.isSameVersionReload\(details, chrome\.runtime\.getManifest\(\)\.version\)/);
  assert.match(
    backgroundSource,
    /chrome\.runtime\.onStartup\.addListener\(\(\) => \{\s*restoreBackgroundStateOnStartup\(\);\s*\}\)/,
    'restored tabs load with the manifest content scripts, so startup should not sweep them'
  );
}

run().then(() => {
  console.log('development extension startup tests passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
