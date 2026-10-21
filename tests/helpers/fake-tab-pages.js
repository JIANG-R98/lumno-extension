'use strict';

// Web pages for the background harness to inject into. Each tab has a
// Document of its own: chrome.scripting.executeScript runs a `func` in it the
// way Chrome does (serialized, with JSON-cloned args), and injecting the
// overlay bundle installs a stand-in overlay runtime that records how the
// worker opens it. Navigating a tab replaces its Document, so whatever was
// injected is gone, as after a real page load.
//
//   const pages = createFakeTabPages();
//   const harness = loadBackground({ tabs, configureChrome: pages.install });
//   pages.navigate(harness, 7, 'https://next.example.test/');

const vm = require('vm');

const OVERLAY_HOST_ID = '_x_extension_overlay_host_2026_unique_';
const RUNTIME_VERSION_KEY = '_x_extension_search_overlay_runtime_version_2026_unique_';
const OPEN_FLAG_KEY = '_x_extension_search_overlay_open_2026_unique_';
const TOGGLE_KEY = '_x_extension_toggleSearchOverlay_2026_unique_';

function createFakeTabPages(options) {
  const config = options || {};
  const documents = new Map();
  const log = [];
  let lastProbedVersion = '';
  let documentCount = 0;

  function createDocument(tabId) {
    documentCount += 1;
    const page = {
      id: documentCount,
      tabId,
      overlayOpen: false,
      invocations: [],
      // When set, executeScript into this Document fails as for a page that
      // is still being replaced.
      unavailable: false
    };
    const document = {
      getElementById(id) {
        return id === OVERLAY_HOST_ID && page.overlayOpen ? { isConnected: true } : null;
      }
    };
    const context = vm.createContext({ document, console: { log() {}, warn() {}, error() {} } });
    context.window = context;
    page.context = context;
    documents.set(tabId, page);
    return page;
  }

  function current(tabId) {
    return documents.get(tabId) || createDocument(tabId);
  }

  // The overlay bundle's entry point, reduced to what the worker can observe:
  // whether a host is open and the open flag it reads back.
  function installOverlayRuntime(page) {
    const context = page.context;
    context[RUNTIME_VERSION_KEY] = config.runtimeVersion || lastProbedVersion;
    context[TOGGLE_KEY] = function(tabs, overlayContext) {
      const settings = JSON.parse(JSON.stringify(overlayContext || {}));
      page.invocations.push({ tabs: JSON.parse(JSON.stringify(tabs || [])), context: settings });
      if (page.overlayOpen && settings.ensureOpen !== true) {
        page.overlayOpen = false;
      } else {
        page.overlayOpen = true;
      }
      context[OPEN_FLAG_KEY] = page.overlayOpen;
    };
  }

  function executeScript(chromeApi, details, callback) {
    const tabId = details && details.target ? details.target.tabId : null;
    const page = current(tabId);
    const finish = (results, errorMessage) => {
      setTimeout(() => {
        if (errorMessage) {
          chromeApi.runtime.lastError = { message: errorMessage };
        }
        if (typeof callback === 'function') callback(results);
        chromeApi.runtime.lastError = null;
      }, 0);
    };
    if (page.unavailable) {
      log.push({ tabId, documentId: page.id, kind: details.files ? 'files' : 'func', failed: true });
      finish(undefined, 'Frame with ID 0 is showing error page');
      return;
    }
    if (Array.isArray(details.files)) {
      log.push({ tabId, documentId: page.id, kind: 'files', files: JSON.parse(JSON.stringify(details.files)), injectImmediately: details.injectImmediately === true });
      if (details.files.includes('build/overlay.js')) {
        installOverlayRuntime(page);
      }
      finish([{ frameId: 0, documentId: String(page.id), result: undefined }]);
      return;
    }
    if (typeof details.func === 'function') {
      const args = JSON.parse(JSON.stringify(details.args || []));
      if (typeof args[0] === 'string' && /^\d{4}-\d{2}-\d{2}-/.test(args[0])) {
        lastProbedVersion = args[0];
      }
      let result;
      try {
        page.context.__args = args;
        result = vm.runInContext(`(${details.func.toString()})(...__args)`, page.context);
      } catch (error) {
        log.push({ tabId, documentId: page.id, kind: 'func', threw: String(error) });
        finish(undefined, String(error && error.message || error));
        return;
      }
      log.push({ tabId, documentId: page.id, kind: 'func', args, injectImmediately: details.injectImmediately === true, result });
      finish([{ frameId: 0, documentId: String(page.id), result: result === undefined ? undefined : JSON.parse(JSON.stringify(result)) }]);
      return;
    }
    finish([]);
  }

  return {
    log,
    // The probe argument the worker last sent: its OVERLAY_RUNTIME_VERSION.
    probedVersion: () => lastProbedVersion,
    page: current,
    install(chromeApi, calls) {
      chromeApi.scripting.executeScript = (details, callback) => {
        calls.push({ name: 'scripting.executeScript', args: [details] });
        executeScript(chromeApi, details, callback);
        return undefined;
      };
    },
    // Starts loading `url` in the tab: a new Document replaces the old one.
    navigate(harness, tabId, url, extra) {
      const tab = harness.tabs.find((item) => item.id === tabId);
      Object.assign(tab, { url, status: 'loading' }, extra || {});
      createDocument(tabId);
      harness.chrome.tabs.onUpdated.dispatch(tabId, { status: 'loading', url }, Object.assign({}, tab));
    },
    complete(harness, tabId) {
      const tab = harness.tabs.find((item) => item.id === tabId);
      tab.status = 'complete';
      harness.chrome.tabs.onUpdated.dispatch(tabId, { status: 'complete' }, Object.assign({}, tab));
    }
  };
}

module.exports = { OVERLAY_HOST_ID, createFakeTabPages };
