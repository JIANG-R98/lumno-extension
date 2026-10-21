const assert = require('assert');
const path = require('path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'https://example.com/'
});
const { document } = dom.window;

dom.window.matchMedia = () => ({ matches: false });

const host = document.createElement('div');
host.id = '_x_extension_overlay_host_2026_unique_';
document.body.appendChild(host);
const shadowRoot = host.attachShadow({ mode: 'closed' });
const overlaySibling = document.createElement('button');
const container = document.createElement('div');
const input = document.createElement('input');
const modePrefix = document.createElement('button');
const modePrefixIcon = document.createElement('img');
const modePrefixText = document.createElement('span');
const modeTabHint = document.createElement('span');
const modeTabHintKey = document.createElement('span');
const modeTabHintText = document.createElement('span');

modePrefix.appendChild(modePrefixIcon);
modePrefix.appendChild(modePrefixText);
modeTabHint.appendChild(modeTabHintKey);
modeTabHint.appendChild(modeTabHintText);
shadowRoot.appendChild(overlaySibling);
container.appendChild(input);
container.appendChild(modePrefix);
container.appendChild(modeTabHint);
shadowRoot.appendChild(container);

delete global.LumnoSearchInputMode;
delete require.cache[require.resolve('../../src/shared/search/search-input-mode.js')];
require(path.resolve(__dirname, '../../src/shared/search/search-input-mode.js'));

let selectedModeId = '';
const controller = global.LumnoSearchInputMode.createInputModeController(
  {
    container,
    input,
    modePrefix,
    modePrefixIcon,
    modePrefixText,
    modeTabHint,
    modeTabHintKey,
    modeTabHintText
  },
  {
    document,
    windowObj: dom.window,
    surface: 'overlay',
    getModeMenuItems: () => [
      {
        active: true,
        id: 'provider:example',
        kind: 'provider',
        label: 'Example'
      },
      {
        active: false,
        id: 'provider:other',
        kind: 'provider',
        label: 'Other'
      }
    ],
    onModeMenuSelect: (item) => {
      selectedModeId = String(item && item.id || '');
    }
  }
);

assert.strictEqual(controller.openModeMenu('none'), true);
assert.strictEqual(controller.isModeMenuVisible(), true);

modePrefix.dispatchEvent(new dom.window.MouseEvent('pointerdown', {
  bubbles: true,
  composed: true
}));
modePrefix.dispatchEvent(new dom.window.MouseEvent('click', {
  bubbles: true,
  composed: true
}));
assert.strictEqual(
  controller.isModeMenuVisible(),
  false,
  'clicking the active scope tag should close only the scope panel'
);
assert.strictEqual(host.isConnected, true, 'closing the scope panel must keep the Overlay mounted');

modePrefix.dispatchEvent(new dom.window.MouseEvent('pointerdown', {
  bubbles: true,
  composed: true
}));
modePrefix.dispatchEvent(new dom.window.MouseEvent('click', {
  bubbles: true,
  composed: true
}));
assert.strictEqual(
  controller.isModeMenuVisible(),
  true,
  'clicking the active scope tag again should reopen the scope panel'
);

const otherModeButton = controller.menuElement.querySelector(
  '[data-mode-id="provider:other"]'
);
assert.ok(otherModeButton, 'the alternate scope option should render');

const optionPointerDown = new dom.window.MouseEvent('pointerdown', {
  bubbles: true,
  composed: true,
  cancelable: true
});
otherModeButton.dispatchEvent(optionPointerDown);
assert.strictEqual(
  optionPointerDown.defaultPrevented,
  true,
  'scope pointer selection must prevent native focus from scrolling panel ancestors'
);
assert.strictEqual(
  controller.isModeMenuVisible(),
  true,
  'a pointerdown retargeted to the closed ShadowRoot host must not close the scope panel'
);

otherModeButton.dispatchEvent(new dom.window.MouseEvent('click', {
  bubbles: true,
  composed: true
}));
assert.strictEqual(selectedModeId, 'provider:other');
assert.strictEqual(
  shadowRoot.activeElement,
  input,
  'pointer selection should return focus to the input inside a closed ShadowRoot'
);
assert.strictEqual(
  controller.menuElement.getAttribute('data-search-active'),
  'false',
  'pointer selection should route subsequent typing to the input'
);
assert.strictEqual(
  controller.isModeMenuVisible(),
  true,
  'selecting another scope should keep the panel available for further switching'
);
assert.strictEqual(host.isConnected, true, 'scope interaction must not remove the Overlay host');

controller.menuElement.dispatchEvent(new dom.window.MouseEvent('pointerdown', {
  bubbles: true,
  composed: true
}));
assert.strictEqual(
  shadowRoot.activeElement,
  controller.menuElement,
  'manually clicking the panel should force focus into the panel'
);

controller.menuElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
  bubbles: true,
  cancelable: true,
  key: 'Tab'
}));
assert.strictEqual(
  shadowRoot.activeElement,
  input,
  'Tab from the panel should force focus back to the input'
);

overlaySibling.dispatchEvent(new dom.window.MouseEvent('pointerdown', {
  bubbles: true,
  composed: true
}));
assert.strictEqual(
  controller.isModeMenuVisible(),
  false,
  'an Overlay control outside the input container should still close the scope panel'
);

assert.strictEqual(controller.openModeMenu('none'), true);

document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown', {
  bubbles: true,
  composed: true
}));
assert.strictEqual(
  controller.isModeMenuVisible(),
  false,
  'a genuine outside pointerdown should still close only the scope panel'
);

controller.destroy();
dom.window.close();

console.log('closed ShadowRoot search scope pointer tests passed');
