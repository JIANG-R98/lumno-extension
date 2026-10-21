'use strict';

// The recording step of runtime-scripts.js's getInjectedScripts: run as a
// child process, it boots the real background, makes it inject each of its
// in-page scripts into a fresh web tab and prints the file lists it passed to
// chrome.scripting.executeScript, as JSON keyed by list name.

const { loadBackground, wait } = require('./background-harness');

const WEB_TAB = { id: 7, windowId: 1, index: 0, active: true, url: 'https://page.example.test/', title: 'Page', status: 'complete' };

function injectedFiles(harness, predicate) {
  const call = harness.calls.find((entry) => entry.name === 'scripting.executeScript' &&
    Array.isArray(entry.args[0].files) && predicate(entry.args[0]));
  return call ? Array.from(call.args[0].files) : null;
}

async function record() {
  const lists = {};
  // A tab with nothing of Lumno's in it yet answers no runtime message, so
  // each command falls back to injecting its scripts.
  const harness = loadBackground({
    tabs: [Object.assign({}, WEB_TAB)],
    sync: {
      _x_extension_tab_switcher_enabled_2026_unique_: true,
      _x_extension_document_pip_enabled_2026_unique_: true
    },
    commands: [{ name: 'show-tab-switcher', shortcut: 'Alt+Q' }],
    configureChrome(chromeApi, calls) {
      chromeApi.tabs.sendMessage = (tabId, message, optionsOrCallback, maybeCallback) => {
        const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
        calls.push({ name: 'tabs.sendMessage', args: [tabId, message] });
        setTimeout(() => {
          chromeApi.runtime.lastError = { message: 'Could not establish connection. Receiving end does not exist.' };
          if (callback) callback(undefined);
          chromeApi.runtime.lastError = null;
        }, 0);
      };
    }
  });
  await wait(50);

  harness.chrome.commands.onCommand.dispatch('show-search');
  await wait(300);
  lists.overlay = injectedFiles(harness, (options) => options.files.some((file) => file === 'build/overlay.js'));

  harness.chrome.tabs.onActivated.dispatch({ tabId: WEB_TAB.id, windowId: 1 });
  await wait(20);
  harness.calls.length = 0;
  harness.chrome.commands.onCommand.dispatch('show-tab-switcher');
  await wait(600);
  lists.shortcutObserver = injectedFiles(harness, (options) => options.target && options.target.allFrames === true);
  lists.tabSwitcher = injectedFiles(harness, (options) => options.files.includes('build/tab-switcher.js'));

  harness.calls.length = 0;
  harness.chrome.commands.onCommand.dispatch('show-search-prefill-v');
  await wait(300);
  lists.copyUrlListener = injectedFiles(harness, (options) => options.files.includes('build/hotkey-listener.js'));

  harness.calls.length = 0;
  await harness.sendMessage({ action: 'openDocumentPipPicker' }, { tab: Object.assign({}, WEB_TAB), url: WEB_TAB.url }, 600);
  // The picker is injected once no other tab turns out to be playing
  // picture-in-picture.
  await wait(600);
  lists.documentPipPicker = injectedFiles(harness, (options) => options.files.includes('build/document-pip-picker.js'));

  return lists;
}

record().then((lists) => {
  process.stdout.write(JSON.stringify(lists));
  // The worker keeps timers running; the lists are all this process is for.
  process.exit(0);
}).catch((error) => {
  process.stderr.write(String(error && error.stack || error));
  process.exit(1);
});
