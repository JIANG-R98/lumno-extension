const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(
  path.join(repoRoot, 'src/shared/react-page-bootstrap.js'),
  'utf8'
);
const executableSource = source.replace(
  'import(reactEntryUrl)',
  '__importReact(reactEntryUrl)'
);
assert.notStrictEqual(
  executableSource,
  source,
  'test harness should intercept the bootstrap dynamic import'
);

const NEWTAB_CONFIG = Object.freeze({
  reactEntry: '../react/newtab-islands.js',
  reactReadyScript: '../overlay/tab-switcher-page-bridge.js',
  pageEntry: '../newtab/newtab.js',
  reactState: 'LumnoNewtabReactBootstrap',
  pageRuntime: 'newtab'
});
const OPTIONS_CONFIG = Object.freeze({
  reactEntry: '../react/options-islands.js',
  reactReadyScript: '../overlay/tab-switcher-page-bridge.js',
  pageEntry: '../options/options.js',
  reactState: 'LumnoOptionsReactBootstrap',
  pageRuntime: 'options'
});
const ONBOARDING_CONFIG = Object.freeze({
  reactEntry: '../react/onboarding-islands.js',
  reactReadyScript: '../overlay/tab-switcher-page-bridge.js',
  pageEntry: '../onboarding/onboarding.js',
  reactState: 'LumnoOnboardingReactBootstrap',
  pageRuntime: 'onboarding'
});

async function runBootstrap({ config, importResult }) {
  const appendedScripts = [];
  const errors = [];

  const sandbox = {
    URL,
    console: {
      error(...args) {
        errors.push(args);
      }
    },
    document: {
      currentScript: {
        src: 'chrome-extension://lumno/src/shared/react-page-bootstrap.js',
        dataset: { ...config }
      },
      documentElement: {
        dataset: {}
      },
      createElement(tagName) {
        return {
          dataset: {},
          src: '',
          tagName: String(tagName).toUpperCase()
        };
      },
      body: {
        appendChild(node) {
          appendedScripts.push(node);
          if (node.src.endsWith('/overlay/tab-switcher-page-bridge.js')) {
            node.onload?.();
          }
        }
      }
    },
    __importReact(specifier) {
      assert.strictEqual(
        String(specifier),
        `chrome-extension://lumno/src/react/${config.pageRuntime}-islands.js`,
        'bootstrap should resolve the configured React entry relative to itself'
      );
      if (importResult === 'success') {
        sandbox[config.reactState].reactReady = true;
        return Promise.resolve({});
      }
      if (importResult === 'failure') {
        return Promise.reject(new Error('fixture import failure'));
      }
      return new Promise(() => {});
    }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  const script = new vm.Script(executableSource, {
    filename: 'react-page-bootstrap.js'
  });

  script.runInContext(context);
  for (let turn = 0; turn < 4; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  return {
    appendedScripts,
    context,
    errors
  };
}

function assertInjectedPage(result, config) {
  assert.strictEqual(
    result.context.document.documentElement.dataset.lumnoReactRuntime,
    'react'
  );
  assert.strictEqual(result.appendedScripts.length, 2);
  assert.strictEqual(
    result.appendedScripts[0].src,
    'chrome-extension://lumno/src/overlay/tab-switcher-page-bridge.js'
  );
  assert.strictEqual(
    result.appendedScripts[1].src,
    `chrome-extension://lumno/src/${config.pageRuntime}/${config.pageRuntime}.js`
  );
  assert.strictEqual(
    result.appendedScripts[1].dataset.lumnoPageRuntime,
    config.pageRuntime
  );
}

(async () => {
  const newtabSuccess = await runBootstrap({
    config: NEWTAB_CONFIG,
    importResult: 'success'
  });
  assert.deepStrictEqual(newtabSuccess.errors, []);
  assertInjectedPage(newtabSuccess, NEWTAB_CONFIG);

  const optionsSuccess = await runBootstrap({
    config: OPTIONS_CONFIG,
    importResult: 'success'
  });
  assert.deepStrictEqual(optionsSuccess.errors, []);
  assertInjectedPage(optionsSuccess, OPTIONS_CONFIG);

  const onboardingSuccess = await runBootstrap({
    config: ONBOARDING_CONFIG,
    importResult: 'success'
  });
  assert.deepStrictEqual(onboardingSuccess.errors, []);
  assertInjectedPage(onboardingSuccess, ONBOARDING_CONFIG);

  const failure = await runBootstrap({
    config: NEWTAB_CONFIG,
    importResult: 'failure'
  });
  assert.strictEqual(failure.appendedScripts.length, 0);
  assert.strictEqual(
    failure.context.document.documentElement.dataset.lumnoReactRuntime,
    'error'
  );
  assert.strictEqual(failure.errors.length, 1);

  const timeout = await runBootstrap({
    config: OPTIONS_CONFIG,
    importResult: 'pending'
  });
  assert.strictEqual(timeout.appendedScripts.length, 0);
  assert.strictEqual(
    timeout.context.document.documentElement.dataset.lumnoReactRuntime,
    'loading',
    'a pending React entry should keep the page in its explicit loading state'
  );

  console.log('shared React page bootstrap tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
