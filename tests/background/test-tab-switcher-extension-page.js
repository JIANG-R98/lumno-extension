const assert = require('assert');

// The switcher's channel to extension pages that host it: their ports, a
// request answered by id, and requests that fail when no answer comes.

global.chrome = { runtime: { id: 'lumno', getURL: (path) => `chrome-extension://lumno/${path}` } };
const channel = require('../../src/background/tab-switcher-extension-page.ts');

function createEvent() {
  const listeners = [];
  return { listeners, addListener: (listener) => listeners.push(listener), dispatch: (...args) => listeners.forEach((l) => l(...args)) };
}

function createPort(tabId, name = channel.TAB_SWITCHER_EXTENSION_PAGE_PORT_NAME) {
  return {
    name,
    sender: { tab: { id: tabId }, url: 'chrome-extension://lumno/newtab.html' },
    sent: [],
    postMessage(message) { this.sent.push(message); },
    onMessage: createEvent(),
    onDisconnect: createEvent()
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const extensionTab = { id: 5, url: 'chrome-extension://lumno/newtab.html' };
const browserNewtab = { id: 6, url: 'chrome://newtab/' };

(async () => {
  assert.strictEqual(channel.isTabSwitcherExtensionPageMessageTarget(extensionTab), true, "Lumno's pages host the switcher");
  assert.strictEqual(channel.isTabSwitcherExtensionPageMessageTarget({ id: 7, url: 'https://example.com/' }), false);
  assert.strictEqual(channel.isTabSwitcherExtensionPageMessageTarget(browserNewtab), false,
    "the browser's New Tab hosts it only once its page connected");

  channel.registerTabSwitcherExtensionPagePortConnection(createPort(9, 'another-port'));
  assert.strictEqual(channel.hasTabSwitcherExtensionPagePort({ id: 9 }), false, 'other ports are not the channel');

  const port = createPort(5);
  channel.registerTabSwitcherExtensionPagePortConnection(port);
  assert.strictEqual(channel.hasTabSwitcherExtensionPagePort(extensionTab), true);

  const replies = [];
  assert.strictEqual(channel.postTabSwitcherMessageToExtensionPage(extensionTab, { action: 'getOpenTabSwitcherState' },
    (ok, reason, response) => replies.push([ok, reason, response && response.open])), true);
  assert.strictEqual(port.sent.length, 1);
  const { requestId } = port.sent[0];
  assert.strictEqual(port.sent[0].action, 'getOpenTabSwitcherState');
  port.onMessage.dispatch({ action: 'tabSwitcherExtensionPageResponse', requestId: requestId + 100, ok: true });
  assert.deepStrictEqual(replies, [], 'an answer to another request is ignored');
  port.onMessage.dispatch({ action: 'tabSwitcherExtensionPageResponse', requestId, ok: true, open: true });
  assert.deepStrictEqual(replies, [[true, '', true]], 'the answer reaches its request');

  const late = [];
  channel.postTabSwitcherMessageToExtensionPage(extensionTab, { action: 'getOpenTabSwitcherState' }, (ok, reason) => late.push([ok, reason]));
  await wait(1050);
  assert.deepStrictEqual(late, [[false, 'extension-page-timeout']], 'a request with no answer fails after a second');

  const dropped = [];
  channel.postTabSwitcherMessageToExtensionPage(extensionTab, { action: 'getOpenTabSwitcherState' }, (ok, reason) => dropped.push([ok, reason]));
  port.onDisconnect.dispatch();
  assert.deepStrictEqual(dropped, [[false, 'disconnected']], 'a page that goes away fails what it still owed');
  assert.strictEqual(channel.hasTabSwitcherExtensionPagePort(extensionTab), false);

  const missing = [];
  channel.postTabSwitcherMessageToExtensionPage({ id: 7, url: 'https://example.com/' }, { action: 'getOpenTabSwitcherState' },
    (ok, reason) => missing.push([ok, reason]));
  assert.deepStrictEqual(missing, [[false, 'not-extension-page']]);

  const waiting = [];
  channel.postTabSwitcherMessageToExtensionPage(extensionTab, { action: 'getOpenTabSwitcherState' }, (ok, reason) => waiting.push([ok, reason]));
  const reconnected = createPort(5);
  await wait(20);
  channel.registerTabSwitcherExtensionPagePortConnection(reconnected);
  await wait(80);
  assert.strictEqual(reconnected.sent.length, 1, 'a message waits a moment for the page to connect');
  reconnected.onMessage.dispatch({ action: 'tabSwitcherExtensionPageResponse', requestId: reconnected.sent[0].requestId, ok: false, reason: 'busy' });
  assert.deepStrictEqual(waiting, [[false, 'busy']]);
  console.log('tab switcher extension page tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
