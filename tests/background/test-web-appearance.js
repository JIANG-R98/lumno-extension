const assert = require('assert');

const webAppearance = require('../../src/background/web-appearance.js');
const { toFirefoxManifest } = require('../../scripts/build/firefox-manifest.js');
const manifest = require('../../manifest.json');

// A stand-in for Firefox's overrideContentColorScheme: the user's own choice,
// which an extension's value overrides until the extension clears it.
function createFirefoxSetting(options) {
  const config = options || {};
  const state = {
    userValue: config.userValue || 'auto',
    extensionValue: null,
    levelOfControl: config.levelOfControl || 'controllable_by_this_extension'
  };
  const calls = [];
  const setting = {
    get(details) {
      calls.push(['get', details]);
      const controlled = state.extensionValue !== null;
      return Promise.resolve({
        value: controlled ? state.extensionValue : state.userValue,
        levelOfControl: controlled ? 'controlled_by_this_extension' : state.levelOfControl
      });
    },
    set(details) {
      calls.push(['set', details]);
      if (state.levelOfControl === 'controlled_by_other_extensions') {
        return Promise.resolve(false);
      }
      if (!['auto', 'light', 'dark'].includes(details.value)) {
        return Promise.reject(new Error(`${details.value} is not a valid value for overrideContentColorScheme.`));
      }
      state.extensionValue = details.value;
      return Promise.resolve(true);
    },
    clear(details) {
      calls.push(['clear', details]);
      const cleared = state.extensionValue !== null;
      state.extensionValue = null;
      return Promise.resolve(cleared);
    }
  };
  return {
    state,
    calls,
    api: { browserSettings: { overrideContentColorScheme: setting } }
  };
}

function testModes() {
  assert.deepStrictEqual(Array.from(webAppearance.MODES), ['auto', 'light', 'dark']);
  assert.strictEqual(webAppearance.getNextMode('auto'), 'light');
  assert.strictEqual(webAppearance.getNextMode('light'), 'dark');
  assert.strictEqual(webAppearance.getNextMode('dark'), 'auto', 'the command cycles back to automatic');
  assert.strictEqual(webAppearance.normalizeMode('system'), '', 'Firefox deprecated "system"; Lumno never sends it');
  assert.strictEqual(webAppearance.normalizeMode('sepia'), '');
}

async function testUnsupported() {
  const api = webAppearance.create({ browserApi: {} });
  assert.deepStrictEqual(await api.getState(), { supported: false, mode: 'auto', controllable: false },
    'without the setting (Chromium), the command is unsupported');
  assert.deepStrictEqual(await api.setMode('dark'), { ok: false, reason: 'unsupported' });
}

async function testSwitching() {
  const firefox = createFirefoxSetting({ userValue: 'auto' });
  const api = webAppearance.create({ browserApi: firefox.api });
  assert.deepStrictEqual(await api.getState(), { supported: true, mode: 'auto', controllable: true });

  assert.deepStrictEqual(await api.setMode('dark'), { ok: true, mode: 'dark', controllable: true });
  assert.strictEqual(firefox.state.extensionValue, 'dark', 'light and dark are set as Lumno\'s value');
  assert.deepStrictEqual(await api.setMode('light'), { ok: true, mode: 'light', controllable: true });

  assert.deepStrictEqual(await api.setMode('auto'), { ok: true, mode: 'auto', controllable: true });
  assert.strictEqual(firefox.state.extensionValue, null,
    'automatic hands the setting back when the user\'s own choice is automatic too');
  assert.ok(!firefox.calls.some(([name, details]) => name === 'set' && details.value === 'auto'));

  assert.deepStrictEqual(await api.setMode('sepia'), { ok: false, reason: 'invalid-mode' });
}

async function testAutomaticOverUserChoice() {
  const firefox = createFirefoxSetting({ userValue: 'dark' });
  const api = webAppearance.create({ browserApi: firefox.api });
  await api.setMode('light');
  assert.deepStrictEqual(await api.setMode('auto'), { ok: true, mode: 'auto', controllable: true },
    'automatic still wins when the user\'s own choice is dark');
  assert.strictEqual(firefox.state.extensionValue, 'auto');
}

async function testControlledElsewhere() {
  const firefox = createFirefoxSetting({ userValue: 'light', levelOfControl: 'controlled_by_other_extensions' });
  const api = webAppearance.create({ browserApi: firefox.api });
  assert.deepStrictEqual(await api.getState(), { supported: true, mode: 'light', controllable: false });
  assert.deepStrictEqual(await api.setMode('dark'), { ok: false, mode: 'light', controllable: false },
    'when another extension holds the setting, the reply reports the value that stayed');
}

async function testMessageHandlers() {
  const firefox = createFirefoxSetting({ userValue: 'light' });
  const api = webAppearance.create({ browserApi: firefox.api });
  const send = (name, request) => new Promise((resolve) => {
    assert.strictEqual(api.messageHandlers[name](request, {}, resolve), true, `${name} answers asynchronously`);
  });
  assert.deepStrictEqual(await send('getWebAppearance', { action: 'getWebAppearance' }),
    { supported: true, mode: 'light', controllable: true });
  assert.deepStrictEqual(await send('setWebAppearance', { action: 'setWebAppearance', mode: 'dark' }),
    { ok: true, mode: 'dark', controllable: true });
}

// Firefox asks for the permission at install; Chromium has no such API.
function testPermission() {
  assert.ok(!manifest.permissions.includes('browserSettings'), 'the Chromium package does not ask for it');
  const firefox = toFirefoxManifest(manifest, { lazyBackgroundDeps: [], importShim: 'build/firefox-import-shim.js' });
  assert.ok(firefox.permissions.includes('browserSettings'), 'the Firefox package asks for browserSettings');
}

(async () => {
  testModes();
  testPermission();
  await testUnsupported();
  await testSwitching();
  await testAutomaticOverUserChoice();
  await testControlledElsewhere();
  await testMessageHandlers();
  console.log('web appearance tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
