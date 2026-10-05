const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const repoRoot = path.resolve(__dirname, '..');
const backgroundSource = fs.readFileSync(path.join(repoRoot, 'src/background/background.js'), 'utf8');
const injectionList = backgroundSource.match(/const overlayInjectionFiles = (\[[\s\S]*?\n  \]);/);
assert.ok(injectionList, 'the production overlay injection list must be available');
const injectionFiles = vm.runInNewContext(injectionList[1], {
  shouldInjectOverlayCodexDebugSurface: false
});

async function waitFor(condition, message, errors) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    assert.deepStrictEqual(errors, [], 'the full overlay runtime must not throw');
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(message);
}

async function testSearchResults(enhancedFetchEnabled, priority) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><body><p>Host page</p></body></html>', {
    url: 'https://page.example.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });
  const { window } = dom;
  const messages = [];
  const settings = {
    _x_extension_language_2024_unique_: 'en',
    _x_extension_motion_effects_enabled_2026_unique_: false,
    _x_extension_overlay_open_tabs_default_visible_2026_unique_: false,
    _x_extension_favicon_enhanced_fetch_enabled_2026_unique_: enhancedFetchEnabled,
    _x_extension_search_result_priority_2026_unique_: priority
  };
  const historyResult = {
    type: 'history',
    title: 'Lumno regression history result',
    url: 'https://history.example.test/lumnotest',
    favicon: 'https://history.example.test/favicon.ico'
  };
  const storageArea = {
    get(keys, callback) {
      const requestedKeys = typeof keys === 'string' ? [keys] : (Array.isArray(keys) ? keys : Object.keys(keys || settings));
      const values = {};
      requestedKeys.forEach((key) => {
        if (Object.hasOwn(settings, key)) {
          values[key] = settings[key];
        } else if (keys && !Array.isArray(keys) && typeof keys === 'object') {
          values[key] = keys[key];
        }
      });
      window.setTimeout(() => callback?.(values), 0);
      return Promise.resolve(values);
    },
    set(values, callback) {
      Object.assign(settings, values);
      callback?.();
      return Promise.resolve();
    }
  };
  window.chrome = {
    runtime: {
      id: 'kkcjcneagmlhpeaafngjdlpcfjakejgb',
      getURL: (resource) => `chrome-extension://kkcjcneagmlhpeaafngjdlpcfjakejgb/${resource}`,
      getManifest: () => ({ version: '0.9.56' }),
      sendMessage(message, callback) {
        messages.push(message);
        let response = {};
        if (message.action === 'getSearchSuggestions') {
          response = { suggestions: message.query === 'lumnotest' ? [historyResult] : [] };
        } else if (message.action === 'getSearchEngineSuggestions') {
          response = { suggestions: message.localSuggestions || [], hasRemoteSuggestions: false };
        } else if (message.action === 'getTabs') {
          response = { tabs: [] };
        }
        window.setTimeout(() => callback?.(response), 0);
        return Promise.resolve(response);
      }
    },
    i18n: { getUILanguage: () => 'en', getMessage: () => '' },
    storage: {
      sync: storageArea,
      local: storageArea,
      onChanged: { addListener() {}, removeListener() {} }
    }
  };
  window.matchMedia = (media) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {}
  });
  window.fetch = async (url) => {
    const parsed = new URL(url);
    assert.strictEqual(parsed.protocol, 'chrome-extension:', 'the overlay test must only read packaged resources');
    const resource = fs.readFileSync(path.join(repoRoot, parsed.pathname), 'utf8');
    return { ok: true, json: async () => JSON.parse(resource), text: async () => resource };
  };

  try {
    // Evaluate the unmodified production files together, preserving their real
    // lexical scopes. Extracting individual functions hid the original regression.
    injectionFiles.forEach((file) => {
      window.eval(`${fs.readFileSync(path.join(repoRoot, file), 'utf8')}\n//# sourceURL=${file}`);
    });
    window._x_extension_toggleSearchOverlay_2026_unique_([], {
      currentTabId: 1,
      currentTabUrl: window.location.href
    });
    const host = window.document.getElementById('_x_extension_overlay_host_2026_unique_');
    const panel = window.LumnoOverlayShell.findOverlayPanel(window.document);
    assert.ok(host && panel, 'the real React overlay shell should mount');
    const root = panel._lumnoOverlayRoot;
    const input = root.querySelector('#_x_extension_search_input_2024_unique_');
    assert.ok(input, 'the overlay input should mount');
    await waitFor(() => root.activeElement === input, 'the overlay should finish initialization', errors);

    const fill = (query) => {
      input.value = query;
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    };
    fill('lumnotest');
    await waitFor(
      () => root.textContent.includes(historyResult.title),
      'typing should render the background history result',
      errors
    );
    assert.ok(root.querySelectorAll('.x-ov-suggestion-item').length >= 2,
      'the search action and history result should both render');
    assert.ok(messages.some((message) => message.action === 'getSearchSuggestions' && message.query === 'lumnotest'),
      'typing should request background search results');

    fill('emptyregressionquery');
    await waitFor(
      () => root.textContent.includes('emptyregressionquery') && !root.textContent.includes(historyResult.title),
      'a query without history should still render the default search action',
      errors
    );
    assert.ok(root.querySelector('.x-ov-suggestion-item'), 'the default search action must remain available');

    fill('');
    await waitFor(
      () => root.querySelectorAll('.x-ov-suggestion-item').length === 0,
      'clearing the query should clear results when default open tabs are disabled',
      errors
    );
    assert.deepStrictEqual(errors, []);
  } finally {
    window._x_extension_toggleSearchOverlay_2026_unique_?.([], {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.close();
  }
}

(async () => {
  await testSearchResults(false, 'autocomplete');
  await testSearchResults(true, 'search');
  console.log('Overlay search results pass with enhanced favicon fetch both off and on.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
