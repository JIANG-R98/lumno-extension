const assert = require('assert');
const { JSDOM } = require('jsdom');
const { bundleScript } = require('../helpers/module-script');

// The web clip picker, injected into a page with a fake Document
// Picture-in-Picture API: pick an element, open it in the floating window and
// keep the copy in sync, the way a user does with the clip command.

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPage() {
  const dom = new JSDOM(`<!doctype html><html><head><title>Article</title></head><body>
    <main><section id="card"><h2 id="headline">Live score</h2><p id="score">1 : 0</p>
      <a id="script-link" href="#">Expand</a>
      <a id="anchor-link" href="#score">Jump to score</a>
      <a id="other-link" href="https://other.example.test/story">Story</a>
    </section></main>
  </body></html>`, { url: 'https://page.example.test/live', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const events = [];
  const messages = [];
  const shadowRoots = [];
  const nativeAttachShadow = window.Element.prototype.attachShadow;
  window.Element.prototype.attachShadow = function(init) {
    const root = nativeAttachShadow.call(this, init);
    shadowRoots.push({ host: this, root, mode: init && init.mode });
    return root;
  };
  window.Element.prototype.getBoundingClientRect = function() {
    return { left: 10, top: 10, right: 410, bottom: 210, width: 400, height: 200, x: 10, y: 10 };
  };
  const card = window.document.getElementById('card');
  window.document.elementFromPoint = () => window.document.getElementById('score');
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  const pipWindows = [];
  window.documentPictureInPicture = {
    async requestWindow(options) {
      events.push('requestWindow');
      const pip = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'about:blank', pretendToBeVisual: true }).window;
      pip.requestedSize = options;
      pip.scrolledTo = [];
      pip.Element.prototype.scrollIntoView = function() {
        pip.scrolledTo.push(this.id);
      };
      pip.close = () => {
        events.push('pipClose');
      };
      pipWindows.push(pip);
      return pip;
    }
  };
  window.chrome = {
    runtime: {
      lastError: null,
      getURL: (resource) => `chrome-extension://lumno-test/${resource}`,
      onMessage: { addListener() {} },
      sendMessage(message, callback) {
        events.push(`message:${message.action}`);
        messages.push(message);
        const response = message.action === 'pipRequestOwnership'
          ? { ok: true, granted: true, token: 'owner-1' }
          : { ok: true };
        setTimeout(() => callback && callback(response), 0);
      }
    },
    i18n: { getMessage: () => '' }
  };
  // The module's run() is left on a global, for the picker below to call as
  // the worker does.
  window.eval(bundleScript('pip-picker', { 'src/content/document-pip-picker.ts': 'LumnoTestPipPicker' }));
  const picker = {
    toggle: () => window.LumnoTestPipPicker.run({ type: 'toggle' })
  };
  return { window, document: window.document, card, events, messages, pipWindows, shadowRoots, picker };
}

function press(window, key) {
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

async function testPickedElementOpensBeforeAnyRoundTrip() {
  const page = createPage();
  const picker = page.picker;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(picker.toggle())), { ok: true, state: 'started' });

  const toastShadow = page.shadowRoots.find((entry) => entry.root.querySelector('.x-lumno-toast'));
  assert.ok(toastShadow, 'the picker should show its hint through the shared Toast');
  assert.strictEqual(toastShadow.mode, 'closed', 'the Toast should live in a closed shadow root');
  assert.ok(toastShadow.root.querySelector('link[rel="stylesheet"][href="chrome-extension://lumno-test/src/shared/ui/toast.css"]'),
    'the Toast should load the shared Toast styles inside its own shadow root');

  page.document.getElementById('score').dispatchEvent(new page.window.MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 50 }));
  press(page.window, 'ArrowUp');
  press(page.window, 'Enter');
  await wait(50);
  assert.strictEqual(page.events[0], 'requestWindow',
    'the floating window should open before any message to the background spends the click activation');
  assert.ok(page.events.includes('message:pipRequestOwnership'), 'the clip should then claim picture-in-picture ownership');

  const pip = page.pipWindows[0];
  assert.ok(pip, 'a floating window should open');
  assert.ok(pip.document.body.textContent.includes('1 : 0'), 'the floating window should show a copy of the picked element');
  return page;
}

async function testCopyFollowsThePage(page) {
  const pip = page.pipWindows[0];
  page.document.getElementById('score').firstChild.data = '2 : 0';
  await wait(200);
  assert.ok(pip.document.body.textContent.includes('2 : 0'), 'text that changes on the page should update in the floating window');
  page.document.getElementById('headline').setAttribute('data-state', 'final');
  await wait(200);
  assert.ok(pip.document.querySelector('[data-state="final"]'), 'attribute changes should reach the copy too');
}

async function testLinksInTheCopy(page) {
  const pip = page.pipWindows[0];
  const click = (id) => {
    const link = pip.document.getElementById(id);
    assert.ok(link, `the copy should contain #${id}`);
    const event = new pip.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);
    return event;
  };
  const before = page.messages.length;
  assert.strictEqual(click('script-link').defaultPrevented, true, 'a link in the copy should not navigate the floating window');
  await wait(10);
  assert.strictEqual(page.messages.length, before, 'an href="#" link should not open the page again in a new tab');
  click('anchor-link');
  await wait(10);
  assert.strictEqual(page.messages.length, before, 'an in-page anchor should not open a tab');
  assert.deepStrictEqual(pip.scrolledTo, ['score'], 'an in-page anchor should scroll the copy to its target');
  click('other-link');
  await wait(10);
  const created = page.messages.slice(before).map((message) => ({ ...message }));
  assert.deepStrictEqual(created, [{ action: 'createTab', url: 'https://other.example.test/story', disposition: 'newTab' }],
    'another page should open in a tab next to the page');
}

async function testTogglingClosesTheClip(page) {
  const picker = page.picker;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(picker.toggle())), { ok: true, state: 'closed' });
  assert.ok(page.events.includes('pipClose'), 'toggling with a clip open should close its window');
  await wait(10);
  assert.ok(page.messages.some((message) => message.action === 'pipReleaseOwnership' && message.token === 'owner-1'),
    'closing should hand picture-in-picture ownership back');
}

async function testEscapeCancelsAndMediaIsRefused() {
  const page = createPage();
  const picker = page.picker;
  picker.toggle();
  press(page.window, 'Escape');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(picker.toggle())), { ok: true, state: 'started' },
    'Escape should end the selection so the next toggle starts again');
  page.document.getElementById('card').appendChild(page.document.createElement('video'));
  page.document.elementFromPoint = () => page.document.getElementById('card');
  page.card.dispatchEvent(new page.window.MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 50 }));
  press(page.window, 'Enter');
  await wait(20);
  assert.deepStrictEqual(page.pipWindows, [], 'an element with video should not be clipped');
}

(async () => {
  const page = await testPickedElementOpensBeforeAnyRoundTrip();
  await testCopyFollowsThePage(page);
  await testLinksInTheCopy(page);
  await testTogglingClosesTheClip(page);
  await testEscapeCancelsAndMediaIsRefused();
  console.log('document PiP picker tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
