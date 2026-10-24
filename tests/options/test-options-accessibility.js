const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const settings = require('../../src/domain/settings.ts');
const { parseCss, parsePageCss } = require('../helpers/css-rules');
const { createOptionsPage } = require('../helpers/options-page');
const { readPageSource } = require('../helpers/page-source');

const TOAST_ID = '_x_extension_toast_2024_unique_';
const optionsCss = parsePageCss('src/options/options.html');
const optionsDocument = new JSDOM(readPageSource('src/options/options.html')).window.document;

function expectRule(css, selector, expected, message) {
  const rule = css.rule(selector);
  assert.ok(rule, `${message} (no rule for ${selector})`);
  Object.entries(expected).forEach(([name, value]) => {
    if (value instanceof RegExp) {
      assert.match(String(rule.get(name)), value, `${message} (${selector} ${name})`);
    } else {
      assert.strictEqual(rule.get(name), value, `${message} (${selector} ${name})`);
    }
  });
}

function testMarkupAndStyles() {
  const toast = optionsDocument.getElementById(TOAST_ID);
  assert.deepStrictEqual(['role', 'aria-live', 'aria-atomic'].map((name) => toast.getAttribute(name)), ['status', 'polite', 'true'],
    'the Options toast should expose a polite atomic live region before React mounts');
  assert.ok(new JSDOM(fs.readFileSync('src/options/options.html', 'utf8')).window.document.querySelector('link[href="../shared/ui/switch.css"]'),
    'Options should load the shared switch');
  const switchCss = parseCss(fs.readFileSync('src/shared/ui/switch.css', 'utf8'));
  const focusRing = switchCss.rule(':is(._x_extension_switch_2024_unique_, .x-nt-wallpaper-switch) input:focus-visible + ' +
    ':is(._x_extension_switch_slider_2024_unique_, .x-nt-wallpaper-switch-slider)');
  assert.deepStrictEqual(focusRing && [focusRing.get('outline'), focusRing.get('outline-offset')], ['2px solid var(--switch-focus-ring)', '2px'],
    'the visual switch should expose the hidden checkbox focus state');
  assert.ok(switchCss.entries.some((entry) => entry.style.getPropertyValue('--switch-focus-ring').trim() === 'var(--lumno-color-focus-ring)'),
    'the switch focus ring should follow the shared focus token');
  [
    '._x_extension_shortcut_group_action_2024_unique_:focus-visible',
    '._x_extension_shortcut_edit_2024_unique_:focus-visible',
    '._x_extension_shortcut_remove_2024_unique_:focus-visible'
  ].forEach((selector) => {
    expectRule(optionsCss, selector, { outline: '2px solid var(--input-focus-color)' },
      'clear, edit, and remove icon buttons should have a visible keyboard focus ring');
  });
  expectRule(optionsCss, '._x_extension_popconfirm_2024_unique_', { visibility: 'hidden', right: '0', transform: /^translateY\(-6px\)/ },
    'closed confirmations should stay hidden, growing leftward from their right-edge trigger');
  expectRule(optionsCss, '._x_extension_popconfirm_2024_unique_[data-open="true"]', { visibility: 'visible' },
    'open confirmations should show');
  assert.strictEqual(optionsDocument.querySelector('[class*="_x_extension_inline_tabs_2024_unique_"][role="tablist"]'), null,
    'value pickers are toggle-button groups, not tab lists without panels');
  expectRule(optionsCss, '._x_extension_theme_option_2024_unique_:focus-visible', { outline: '2px solid var(--input-focus-color)' },
    'segmented options should keep a keyboard focus ring despite all: unset');
  expectRule(optionsCss, '._x_extension_theme_gallery_2026_unique_ ._x_extension_theme_option_2024_unique_:focus-visible ._x_extension_theme_preview_2026_unique_',
    { outline: '2px solid var(--input-focus-color)' }, 'theme cards should ring their preview on keyboard focus');
  expectRule(optionsCss, '._x_extension_shortcut_group_action_2024_unique_:disabled', { cursor: 'not-allowed' },
    'disabled header actions should look unavailable');
  expectRule(optionsCss, '._x_extension_shortcut_editor_2024_unique_', { 'margin-top': '-12px', 'padding-top': '0', 'border-top': '1px dashed transparent' },
    'a collapsed item editor should not leave extra space under the card header');
}

async function testOnThePage() {
  const page = await createOptionsPage({
    sync: { [settings.SEARCH_BLACKLIST_STORAGE_KEY]: [{ pattern: 'a.com', matchModes: ['suffix'] }] },
    respond: (message) => (message.action === 'openExtensionShortcutsPage' ? { ok: false } : undefined)
  });
  await page.settle(200);
  const toast = page.byId(TOAST_ID);
  const announcement = () => ['role', 'aria-live', 'aria-atomic'].map((name) => toast.getAttribute(name));

  // Errors are announced assertively, status updates politely.
  await page.click(page.byId('_x_extension_open_shortcuts_page_2026_unique_'));
  await page.settle(60);
  assert.deepStrictEqual(announcement(), ['alert', 'assertive', 'true'], 'Options should announce errors assertively');

  // Clear-all buttons are unavailable while their lists are empty.
  [
    '_x_extension_custom_clear_2024_unique_',
    '_x_extension_aggregate_search_clear_2026_unique_',
    '_x_extension_favicon_blacklist_clear_2026_unique_'
  ].forEach((id) => {
    assert.strictEqual(page.byId(id).disabled, true, `clear-all should be disabled while its list is empty: ${id}`);
  });

  // A header confirmation closes on Escape and gives focus back.
  const reset = page.byId('_x_extension_builtin_reset_2024_unique_');
  const confirm = page.byId('_x_extension_builtin_reset_2024_unique__popconfirm');
  reset.focus();
  await page.click(reset);
  await page.settle(60);
  assert.strictEqual(confirm.getAttribute('data-open'), 'true', 'the reset button should ask for confirmation');
  page.document.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await page.settle(60);
  assert.strictEqual(confirm.getAttribute('data-open'), 'false', 'Escape should close the confirmation');
  assert.strictEqual(page.document.activeElement, reset, 'and return focus to its trigger');

  // Removing a rule shows a normal status toast.
  const rule = Array.from(page.document.querySelectorAll('span')).find((span) => span.textContent === 'a.com');
  let card = rule;
  while (card && !card.querySelector('._x_extension_shortcut_remove_2024_unique_')) card = card.parentElement;
  assert.strictEqual(page.byId('_x_extension_blacklist_clear_2026_unique_').disabled, false, 'clear-all is available once its list has a rule');
  await page.click(card.querySelector('._x_extension_shortcut_remove_2024_unique_'));
  await page.settle(60);
  const open = page.document.querySelector('._x_extension_popconfirm_2024_unique_[data-open="true"]');
  if (open) {
    const buttons = open.querySelectorAll('button');
    await page.click(buttons[buttons.length - 1]);
  }
  await page.settle(120);
  assert.deepStrictEqual(page.storage.sync.data[settings.SEARCH_BLACKLIST_STORAGE_KEY], [], 'the rule should be removed');
  assert.deepStrictEqual(announcement(), ['status', 'polite', 'true'], 'status updates should be announced politely');
  page.close();
}

(async () => {
  testMarkupAndStyles();
  await testOnThePage();
  console.log('options accessibility tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
