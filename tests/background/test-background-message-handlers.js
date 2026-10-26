const assert = require('assert');
const { loadBackground, wait } = require('../helpers/background-harness');
const { injectedCommand, injectedModules } = require('../helpers/injected-modules');

// Behavior of individual runtime message handlers, exercised through the real
// background router with a recording chrome stub.

const SITE_SEARCH_CUSTOM_KEY = '_x_extension_site_search_custom_2024_unique_';
const DOCUMENT_PIP_ENABLED_KEY = '_x_extension_document_pip_enabled_2026_unique_';
const senderTab = { id: 5, windowId: 1, index: 0, url: 'https://example.com/', title: 'Example' };
const plain = (value) => JSON.parse(JSON.stringify(value === undefined ? null : value));

function boot(options) {
  return loadBackground(Object.assign({
    tabs: [Object.assign({ active: true }, senderTab)],
    commands: [
      { name: 'show-search', shortcut: '⌘⇧K' },
      { name: 'show-tab-switcher', shortcut: 'Alt+Q' }
    ]
  }, options || {}));
}

async function testUnreadableSettingsStillAnswer() {
  const harness = boot({
    configureChrome(chromeApi) {
      const syncGet = chromeApi.storage.sync.get;
      chromeApi.storage.sync.get = (keys, callback) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        if (keyList.includes(SITE_SEARCH_CUSTOM_KEY)) {
          setTimeout(() => callback(undefined), 0);
          return;
        }
        syncGet(keys, callback);
      };
    }
  });
  const response = await harness.sendMessage({ action: 'getSiteSearchProviders' });
  assert.ok(
    Array.isArray(response.items) && response.items.length > 0 && !response.reason,
    'settings that cannot be read leave the bundled providers to answer with'
  );
}

async function testOpenNewTabUsesBrowserNewtab() {
  const harness = boot();
  const response = await harness.sendMessage(
    { action: 'openNewTab', disposition: 'backgroundTab' },
    { tab: senderTab }
  );
  assert.strictEqual(response && response.ok, true);
  const created = harness.calls.filter((call) => call.name === 'tabs.create').map((call) => plain(call.args[0]));
  assert.strictEqual(created.length, 1);
  assert.strictEqual(created[0].url, undefined, 'openNewTab should omit an extension URL so Chromium opens chrome://newtab');
  assert.strictEqual(created[0].active, false, 'openNewTab should keep the requested background disposition');
}

async function testOpenOptionsPageKeepsRequestedHash() {
  const harness = boot();
  const response = await harness.sendMessage({ action: 'openOptionsPage', hash: 'labs' }, { tab: senderTab });
  assert.strictEqual(response && response.ok, true);
  const created = harness.calls.filter((call) => call.name === 'tabs.create').map((call) => plain(call.args[0]));
  assert.strictEqual(created.length, 1);
  assert.match(String(created[0].url || ''), /options\.html#labs$/, 'the Labs entry should open the Labs settings route');
}

async function testLoadingSessionUpdatesAreAsyncAndAnswered() {
  const harness = boot();
  const listener = harness.chrome.runtime.onMessage.listeners[harness.chrome.runtime.onMessage.listeners.length - 1];
  let response;
  const result = listener(
    { action: 'updateOverlayLoadingSession', session: { inputValue: 'draft', revision: 1 } },
    { tab: senderTab, frameId: 0 },
    (value) => {
      response = value;
    }
  );
  assert.strictEqual(result, true, 'the loading-session update answers asynchronously');
  await wait(30);
  assert.ok(response && typeof response.ok === 'boolean', 'the loading-session update should be answered');
}

async function testTopFrameDocumentStartIsAnswered() {
  const harness = boot();
  const response = await harness.sendMessage(
    { action: 'notifyTopFrameDocumentStarted', documentUrl: senderTab.url, observedAt: Date.now() },
    { tab: senderTab, frameId: 0 }
  );
  assert.ok(response && typeof response.ok === 'boolean', 'every committed top-frame Document is reported back');
}

async function testColdStartPageHotkeyIsVerifiedAgainstLiveShortcut() {
  const harness = boot();
  const mismatch = await harness.sendMessage({
    action: 'triggerShowSearchFromPageHotkey',
    requiresShortcutVerification: true,
    observedShortcut: { ctrlKey: false, altKey: false, shiftKey: true, metaKey: true, key: 'j' }
  }, { tab: senderTab });
  assert.deepStrictEqual(
    { ok: mismatch.ok, reason: mismatch.reason },
    { ok: false, reason: 'shortcut-mismatch' },
    'a key that is not the live browser shortcut must not open Lumno'
  );
  const match = await harness.sendMessage({
    action: 'triggerShowSearchFromPageHotkey',
    requiresShortcutVerification: true,
    observedShortcut: { ctrlKey: false, altKey: false, shiftKey: true, metaKey: true, key: 'k' }
  }, { tab: senderTab });
  assert.strictEqual(match.ok, true, 'the live browser shortcut should open Lumno after verification');
  assert.strictEqual(typeof match.shortcut, 'string');
}

// Zen's empty state is a tab hidden from extensions, so the page hotkey arrives
// without sender.tab; it should open New Tab like the command's no-tab path.
async function testPageHotkeyWithoutSenderTabOpensNewtab() {
  const harness = boot();
  await wait(30);
  harness.calls.length = 0;
  const mismatch = await harness.sendMessage({
    action: 'triggerShowSearchFromPageHotkey',
    requiresShortcutVerification: true,
    observedShortcut: { ctrlKey: false, altKey: false, shiftKey: true, metaKey: true, key: 'j' }
  }, {});
  assert.strictEqual(mismatch.ok, false, 'a tab-less key that is not the live shortcut must not open Lumno');
  await wait(30);
  assert.ok(!harness.calls.some((call) => call.name === 'tabs.create'));

  const match = await harness.sendMessage({
    action: 'triggerShowSearchFromPageHotkey',
    requiresShortcutVerification: true,
    observedShortcut: { ctrlKey: false, altKey: false, shiftKey: true, metaKey: true, key: 'k' }
  }, {});
  assert.strictEqual(match.ok, true, 'the live shortcut from a tab-less page should be accepted');
  await wait(30);
  const created = harness.calls.filter((call) => call.name === 'tabs.create').map((call) => plain(call.args[0]));
  assert.strictEqual(created.length, 1, 'a tab-less page hotkey should open exactly one New Tab');
  assert.match(String(created[0].url || ''), /newtab\.html/, 'the fallback should open Lumno New Tab with its search');
}

async function testWebClipCommandOpensPickerOnSenderTab() {
  const enabled = boot({ sync: { [DOCUMENT_PIP_ENABLED_KEY]: true } });
  const response = await enabled.sendMessage({ action: 'openDocumentPipPicker' }, { tab: senderTab });
  assert.deepStrictEqual(plain(response), { ok: true, enabled: true });
  await wait(50);
  assert.ok(
    enabled.calls.some((call) => call.name === 'scripting.executeScript' &&
      call.args[0] && call.args[0].target && call.args[0].target.tabId === senderTab.id),
    'web clip command messages should open the Document PiP picker on the sender tab'
  );

  const disabled = boot({ sync: { [DOCUMENT_PIP_ENABLED_KEY]: false } });
  const disabledResponse = await disabled.sendMessage({ action: 'openDocumentPipPicker' }, { tab: senderTab });
  assert.deepStrictEqual(plain(disabledResponse), { ok: false, enabled: false });
  await wait(50);
  assert.ok(!disabled.calls.some((call) => call.name === 'scripting.executeScript' &&
    call.args[0] && call.args[0].target && call.args[0].target.tabId === senderTab.id));

  const noTab = await enabled.sendMessage({ action: 'openDocumentPipPicker' }, {});
  assert.deepStrictEqual(plain(noTab), { ok: false, reason: 'no-sender-tab' });
}

// With web clip off its entry points open Settings at the web clip switch; a
// worker woken by the clip command waits for the stored setting before it
// decides; and the overlay learns the setting to show or hide its clip command.
async function testWebClipFollowsItsSetting() {
  const disabled = boot({ extensionUrls: true, sync: { [DOCUMENT_PIP_ENABLED_KEY]: false } });
  await wait(30);
  disabled.calls.length = 0;
  await disabled.sendMessage({ action: 'openDocumentPipPicker' }, { tab: senderTab });
  await wait(50);
  assert.deepStrictEqual(
    disabled.calls.filter((call) => call.name === 'tabs.create').map((call) => plain(call.args[0])),
    [{ url: 'chrome-extension://lumno-test/src/options/options.html#labs:document-pip', active: true }],
    'with web clip off, the command should open Settings at the web clip switch'
  );

  const cold = boot({ sync: { [DOCUMENT_PIP_ENABLED_KEY]: true }, storageOptions: { sync: { hold: true } } });
  const pickerInjected = () => cold.calls.some((call) => call.name === 'scripting.executeScript' &&
    injectedModules(call.args[0]).includes('build/injected/pip-picker.js'));
  const response = cold.sendMessage({ action: 'openDocumentPipPicker' }, { tab: senderTab }, 2000);
  await wait(100);
  assert.strictEqual(pickerInjected(), false, 'nothing should happen before the stored setting is read');
  cold.storage.sync.release();
  assert.deepStrictEqual(plain(await response), { ok: true, enabled: true },
    'a worker woken by the clip command should answer from the stored setting, not its default');
  await wait(600);
  assert.strictEqual(pickerInjected(), true);

  for (const enabled of [true, false]) {
    const harness = boot({ sync: { [DOCUMENT_PIP_ENABLED_KEY]: enabled } });
    await wait(30);
    harness.chrome.commands.onCommand.dispatch('show-search');
    await wait(400);
    const open = harness.calls.find((call) => call.name === 'scripting.executeScript' &&
      injectedModules(call.args[0]).includes('build/injected/overlay.js'));
    assert.ok(open, 'the search command should open the overlay with a context');
    assert.strictEqual(injectedCommand(open.args[0]).context.documentPipEnabled, enabled,
      'the overlay should be told whether web clip is on');
  }
}

// The toolbar popup's web clip must open even when another tab cannot answer
// the "is a video already in picture-in-picture?" check: a frozen tab (tab
// freezing, Memory Saver) never runs the injected script.
async function testPopupWebClipIsNotBlockedByTabsThatNeverAnswer() {
  const frozenTab = { id: 6, windowId: 1, index: 1, url: 'https://frozen.example/', title: 'Frozen', frozen: true };
  const discardedTab = { id: 7, windowId: 1, index: 2, url: 'https://discarded.example/', title: 'Discarded', discarded: true };
  const silentTab = { id: 8, windowId: 1, index: 3, url: 'https://silent.example/', title: 'Silent' };
  const harness = boot({
    tabs: [Object.assign({ active: true }, senderTab), frozenTab, discardedTab, silentTab],
    sync: { [DOCUMENT_PIP_ENABLED_KEY]: true },
    configureChrome(chromeApi, calls) {
      const executeScript = chromeApi.scripting.executeScript;
      chromeApi.scripting.executeScript = (options, callback) => {
        if (options && options.target && options.target.tabId === silentTab.id) {
          calls.push({ name: 'scripting.executeScript', args: [options] });
          return undefined; // never answers
        }
        return executeScript(options, callback);
      };
    }
  });
  const response = await harness.sendMessage({ action: 'popupOpenDocumentPipPicker', tabId: senderTab.id });
  assert.deepStrictEqual(plain(response), { ok: true });
  await wait(700);
  const injected = harness.calls
    .filter((call) => call.name === 'scripting.executeScript')
    .map((call) => call.args[0]);
  assert.ok(!injected.some((options) => [frozenTab.id, discardedTab.id].includes(options.target.tabId)),
    'frozen and discarded tabs are not asked');
  assert.ok(injected.some((options) => options.target.tabId === silentTab.id), 'other tabs are still checked');
  assert.ok(injected.some((options) => options.target.tabId === senderTab.id &&
      injectedModules(options).includes('build/injected/pip-picker.js')),
    'the picker opens once the check gives up on a tab that never answers');
}

async function testAggregateSearchIgnoresPageSuppliedTargets() {
  const harness = boot();
  await harness.sendMessage({
    action: 'runAggregateSearchQuery',
    aggregateId: 'missing-definition',
    query: 'hello',
    disposition: 'newTab',
    provider: { template: 'https://evil.test/?q={query}' },
    providers: [{ template: 'https://evil.test/?q={query}' }],
    urls: ['https://evil.test/']
  }, { tab: senderTab }, 300);
  const opened = harness.calls
    .filter((call) => call.name === 'tabs.create' || call.name === 'tabs.update')
    .map((call) => JSON.stringify(call.args));
  assert.ok(
    !opened.some((args) => args.includes('evil.test')),
    'the page must not be allowed to supply provider definitions or arbitrary target URLs'
  );
}

async function testLocaleMessagesAreCachedAndCanBeNarrowed() {
  const fetched = [];
  const harness = loadBackground({
    fetch: async (url) => {
      fetched.push(String(url));
      return {
        json: async () => ({
          copy_page_url_success: { message: 'Copied' },
          unrelated_key: { message: 'Other' }
        })
      };
    }
  });
  const narrowed = await harness.sendMessage({
    action: 'getLocaleMessages',
    locale: 'en',
    keys: ['copy_page_url_success', 'missing_key']
  });
  // Objects built inside the background's vm realm compare by value only.
  assert.deepStrictEqual(JSON.parse(JSON.stringify(narrowed)), {
    messages: { copy_page_url_success: { message: 'Copied' } }
  }, 'a caller naming its keys should receive only those messages');
  const full = await harness.sendMessage({ action: 'getLocaleMessages', locale: 'en' });
  assert.deepStrictEqual(Object.keys(full.messages).sort(), ['copy_page_url_success', 'unrelated_key']);
  assert.strictEqual(
    fetched.filter((url) => url.endsWith('_locales/en/messages.json')).length,
    1,
    'a locale file should be read once per worker lifetime'
  );
}

(async () => {
  await testLocaleMessagesAreCachedAndCanBeNarrowed();
  await testUnreadableSettingsStillAnswer();
  await testOpenNewTabUsesBrowserNewtab();
  await testOpenOptionsPageKeepsRequestedHash();
  await testLoadingSessionUpdatesAreAsyncAndAnswered();
  await testTopFrameDocumentStartIsAnswered();
  await testColdStartPageHotkeyIsVerifiedAgainstLiveShortcut();
  await testPageHotkeyWithoutSenderTabOpensNewtab();
  await testWebClipCommandOpensPickerOnSenderTab();
  await testWebClipFollowsItsSetting();
  await testPopupWebClipIsNotBlockedByTabsThatNeverAnswer();
  await testAggregateSearchIgnoresPageSuppliedTargets();
  console.log('background message handler tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
