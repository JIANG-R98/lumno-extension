const assert = require('assert');
const shortcutDisplay = require('../../src/shared/shortcut-display');
const { createShortcutReference } = require('../../src/options/options-shortcut-reference');

const MESSAGES = {
  settings_tab_switcher_ctrl_tab_link: 'Use {shortcut} instead',
  settings_tab_switcher_ctrl_tab_guide: 'About {shortcut}'
};

function createLink() {
  const label = { textContent: '' };
  return {
    hidden: true,
    href: '',
    attributes: {},
    label,
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelector(selector) { return selector === '.x-lumno-link-button__label' ? label : null; }
  };
}

// Renders the shortcut list from a chrome.commands snapshot and returns the
// rows the React island would receive plus the tab switcher row's link.
function render(shortcut, isMacPlatform) {
  let rendered = null;
  const link = createLink();
  global.chrome = {
    commands: {
      getAll(callback) {
        callback([
          { name: 'show-search', shortcut: '⇧⌘K' },
          { name: 'show-tab-switcher', shortcut }
        ]);
      }
    },
    runtime: {}
  };
  const reference = createShortcutReference({
    shortcutDisplay,
    shortcutReferenceList: {},
    shortcutReferenceController: { render(model) { rendered = model; } },
    getMessage: (key, fallback) => MESSAGES[key] || fallback,
    formatTemplate: (template, values) => template.replace(/\{(\w+)\}/g, (_, name) => values[name]),
    getHelpUrl: (slug, anchor) => `https://lumno.kubai.design/en/help/${slug}/#${anchor}`,
    tabSwitcherCtrlTabLink: link,
    optionsState: { isMacPlatform }
  });
  reference.renderShortcutReferenceList();
  delete global.chrome;
  const items = rendered.groups.flatMap((group) => group.items);
  const label = (id) => items.find((item) => item.id === id).shortcutLabel;
  return { link, label };
}

const unbound = render('⌥Q', true);
assert.strictEqual(unbound.link.hidden, false, 'the tab switcher row should show its link once commands load');
assert.strictEqual(unbound.link.href, 'https://lumno.kubai.design/en/help/tab-switcher/#ctrl-tab');
assert.strictEqual(unbound.link.label.textContent, 'Use ⌃Tab instead');
assert.strictEqual(unbound.link.attributes['data-bound'], 'false');
assert.strictEqual(unbound.label('tab-switcher-cycle'), 'Q / ⇥ / ↑↓←→');
assert.strictEqual(unbound.label('tab-switcher-confirm'), '↩ / ⌥↑');

assert.strictEqual(render('Alt+Q', false).link.label.textContent, 'Use Ctrl+Tab instead',
  'Windows and Linux should name the keys as they are printed');

const boundMac = render('⌃⇥', true);
assert.strictEqual(boundMac.link.label.textContent, 'About ⌃Tab',
  'once Ctrl+Tab is bound the link becomes the guide, which also says how to change it back');
assert.strictEqual(boundMac.link.attributes['data-bound'], 'true');
assert.strictEqual(boundMac.link.href, 'https://lumno.kubai.design/en/help/tab-switcher/#ctrl-tab');
assert.strictEqual(boundMac.label('tab-switcher-cycle'), '⇥ / ↑↓←→',
  'with Ctrl+Tab the switcher cycles with Tab alone');
assert.strictEqual(boundMac.label('tab-switcher-confirm'), '↩ / ⌃↑',
  'with Ctrl+Tab the switcher commits when Control is released');

const boundWindows = render('Ctrl+Tab', false);
assert.strictEqual(boundWindows.link.label.textContent, 'About Ctrl+Tab');
assert.strictEqual(boundWindows.label('tab-switcher-confirm'), 'Enter / Ctrl↑');

const slash = render('Ctrl+Shift+/', false);
assert.strictEqual(slash.label('show-tab-switcher'), 'Ctrl+Shift+/',
  'a shortcut ending in a slash should not be split as a list');
assert.strictEqual(slash.label('tab-switcher-cycle'), '/ / Tab / ↑↓←→');
assert.strictEqual(slash.label('tab-switcher-confirm'), 'Enter / Ctrl↑',
  'Shift is held along, so releasing Control commits');

const unset = render('', true);
assert.strictEqual(unset.label('tab-switcher-cycle'), 'Q / ⇥ / ↑↓←→',
  'without a shortcut the rows fall back to the default Alt+Q');
assert.strictEqual(unset.label('tab-switcher-confirm'), '↩ / ⌥↑');

console.log('options shortcut reference tests passed');
