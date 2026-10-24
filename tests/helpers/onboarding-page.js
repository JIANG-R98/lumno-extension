'use strict';

// The onboarding page (src/onboarding/onboarding.html) as the browser loads
// it: the preload bundle, the React islands and the page bundle, run in JSDOM
// against a fake chrome API with storage and a recording runtime.

const fs = require('fs');
const path = require('path');
const { extensionFilePath } = require('../../scripts/build/extension-output');
const { JSDOM, VirtualConsole } = require('jsdom');
const { bundleScript } = require('./module-script');
const { trackPageTimers } = require('./page-timers');
const { EXTENSION_ORIGIN, createArea, createEvent, reactEntryScript } = require('./options-page');

const repoRoot = path.resolve(__dirname, '..', '..');

// options:
//   sync, local     initial storage
//   runtimeId       chrome.runtime.id (picks the store listing)
//   respond         (message) => response for chrome.runtime.sendMessage
async function createOnboardingPage(options) {
  const config = options || {};
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error.message));
  const html = fs.readFileSync(path.join(repoRoot, 'src/onboarding/onboarding.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: `${EXTENSION_ORIGIN}/src/onboarding/onboarding.html`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });
  const { window } = dom;
  const timers = trackPageTimers(window);
  Object.defineProperty(window.navigator, 'platform', { configurable: true, value: 'MacIntel' });
  const storageChanged = createEvent();
  const sync = createArea(window, 'sync', config.sync, storageChanged);
  const local = createArea(window, 'local', config.local, storageChanged);
  const messages = [];
  window.chrome = {
    runtime: {
      id: config.runtimeId || 'lumno-test',
      lastError: null,
      getURL: (resource) => `${EXTENSION_ORIGIN}/${String(resource || '').replace(/^\//, '')}`,
      getManifest: () => JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8')),
      onMessage: createEvent(),
      sendMessage(message, callback) {
        messages.push(JSON.parse(JSON.stringify(message)));
        const response = typeof config.respond === 'function' ? config.respond(message) : undefined;
        const promise = Promise.resolve(response === undefined ? { ok: true } : response);
        promise.then((value) => window.setTimeout(() => callback && callback(value), 0));
        return typeof callback === 'function' ? undefined : promise;
      },
      openOptionsPage() {}
    },
    storage: { sync, local, onChanged: storageChanged },
    i18n: { getUILanguage: () => 'en', getMessage: () => '' },
    commands: { getAll: (callback) => window.setTimeout(() => callback([{ name: 'show-search', shortcut: '⌘K' }]), 0) },
    tabs: {
      create(_properties, callback) {
        window.setTimeout(() => callback && callback({ id: 101 }), 0);
      },
      getCurrent: (callback) => window.setTimeout(() => callback({ id: 42, windowId: 1 }), 0)
    }
  };
  window.fetch = async (url) => {
    const parsed = new URL(String(url), window.location.href);
    if (parsed.protocol !== 'chrome-extension:') throw new Error(`network disabled: ${url}`);
    const file = extensionFilePath(decodeURIComponent(parsed.pathname));
    if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    const text = fs.readFileSync(file, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
  };
  window.matchMedia = (media) => ({ matches: false, media, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = function() {};
  window.Element.prototype.animate = function() {
    return { finished: Promise.resolve(), cancel() {}, finish() {}, onfinish: null, addEventListener() {} };
  };
  const run = (source, file) => window.eval(`${source}\n//# sourceURL=${file}`);
  const settle = timers.settle;
  run(bundleScript('onboarding-preload'), 'build/onboarding-preload.js');
  run(reactEntryScript('src/react/overlay-islands.js'), 'src/react/overlay-islands.js');
  window.LumnoOnboardingReactBootstrap = { reactReady: false };
  run(reactEntryScript('src/react/onboarding-islands.js'), 'src/react/onboarding-islands.js');
  await settle(50);
  run(bundleScript('onboarding'), 'build/onboarding.js');
  await settle(120);
  return {
    window,
    document: window.document,
    errors,
    messages,
    storage: { sync, local },
    settle,
    async click(element) {
      element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      await settle();
    },
    close: () => window.close()
  };
}

module.exports = { createOnboardingPage };
