'use strict';

// Web pages for the background harness to inject into. Each tab has a
// Document of its own: chrome.scripting.executeScript runs a `func` in it the
// way Chrome does (serialized, with JSON-cloned args), and an injected
// module (src/platform/injection.ts) loads once per Document, as the browser
// keeps one instance of each; the overlay is a stand-in that records how the
// worker opens it and publishes its state in the content registry. Navigating
// a tab replaces its Document, so whatever was injected is gone, as after a
// real page load.
//
//   const pages = createFakeTabPages();
//   const harness = loadBackground({ tabs, configureChrome: pages.install });
//   pages.navigate(harness, 7, 'https://next.example.test/');

const vm = require('vm');

const OVERLAY_HOST_ID = '_x_extension_overlay_host_2026_unique_';
const OVERLAY_MODULE = 'build/injected/overlay.js';

function createFakeTabPages() {
  const documents = new Map();
  const log = [];
  let documentCount = 0;

  function createDocument(tabId) {
    documentCount += 1;
    const page = {
      id: documentCount,
      tabId,
      overlayOpen: false,
      invocations: [],
      // The injected modules this Document loaded, by extension path.
      loadedModules: [],
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

  // The overlay module, reduced to what the worker can observe: whether a
  // host is open, and the state it publishes in the content registry.
  function loadOverlay(page) {
    page.context.__lumnoContent = { claimed: {}, overlayOpen: false };
  }

  function runOverlay(page, command) {
    const settings = command && command.context ? command.context : {};
    page.invocations.push({ tabs: command && command.tabs ? command.tabs : [], context: settings });
    if (page.overlayOpen && settings.ensureOpen !== true) {
      page.overlayOpen = false;
    } else {
      page.overlayOpen = true;
    }
    page.context.__lumnoContent.overlayOpen = page.overlayOpen;
    return { ok: true, overlayOpen: page.overlayOpen };
  }

  // The extension path an injected module's URL names.
  function modulePath(url) {
    return String(url).replace(/^chrome-extension:\/\/[^/]+\//, '').replace(/^.*?(build\/injected\/)/, '$1');
  }

  // An injected function that imports modules and calls the last one's run().
  function readModuleImport(args) {
    return Array.isArray(args[0]) && args[0].length > 0 && args[0].every((url) => /\.js$/.test(String(url)))
      ? { paths: args[0].map(modulePath), command: args[1] }
      : null;
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
      log.push({ tabId, documentId: page.id, kind: 'files', files: JSON.parse(JSON.stringify(details.files)), injectImmediately: details.injectImmediately === true, at: Date.now() });
      finish([{ frameId: 0, documentId: String(page.id), result: undefined }]);
      return;
    }
    if (typeof details.func === 'function') {
      const args = JSON.parse(JSON.stringify(details.args || []));
      const moduleImport = readModuleImport(args);
      if (moduleImport) {
        const loaded = moduleImport.paths.filter((path) => !page.loadedModules.includes(path));
        page.loadedModules.push(...loaded);
        if (loaded.includes(OVERLAY_MODULE)) {
          loadOverlay(page);
        }
        const app = moduleImport.paths[moduleImport.paths.length - 1];
        const result = app === OVERLAY_MODULE ? runOverlay(page, moduleImport.command) : { ok: true };
        log.push({ tabId, documentId: page.id, kind: 'import', files: moduleImport.paths, loaded, command: moduleImport.command,
          injectImmediately: details.injectImmediately === true, at: Date.now(), result });
        finish([{ frameId: 0, documentId: String(page.id), result: JSON.parse(JSON.stringify(result)) }]);
        return;
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
