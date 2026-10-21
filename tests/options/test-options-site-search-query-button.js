const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { parsePageCss } = require('../helpers/css-rules');
const { createOptionsPage } = require('../helpers/options-page');
const { readPageSource } = require('../helpers/page-source');

const repoRoot = path.join(__dirname, '..', '..');
const optionsDocument = new JSDOM(readPageSource('src/options/options.html')).window.document;
const optionsCss = parsePageCss('src/options/options.html');

const buttonId = '_x_extension_site_search_insert_query_2026_unique_';
const buttonClass = '_x_extension_site_search_insert_query_2026_unique_';
const ghostClass = '_x_extension_shortcut_ghost_2026_unique_';
const templateHeaderClass = '_x_extension_site_search_template_header_2026_unique_';
const templateLabelClass = '_x_extension_site_search_template_label_2026_unique_';
const templateInputId = '_x_extension_site_search_template_2024_unique_';

function rule(selector) {
  const found = optionsCss.rule(selector);
  assert.ok(found, `${selector} should exist in options CSS`);
  return found;
}

function testMarkupAndStyles() {
  const button = optionsDocument.getElementById(buttonId);
  const header = button && button.closest(`.${templateHeaderClass}`);
  assert.ok(header && header.classList.contains('_x_extension_shortcut_label_row_2024_unique_') &&
    header.querySelector(`.${templateLabelClass}`).compareDocumentPosition(button) & 4,
  'custom site search form should place the ghost button on the right side of the template header');
  assert.ok(button.type === 'button' && ['_x_extension_shortcut_submit_2024_unique_', ghostClass, buttonClass].every((name) => button.classList.contains(name)));
  assert.strictEqual(button.querySelector('span[data-i18n="shortcuts_insert_query"]').textContent, '插入查询变量');
  assert.ok(button.querySelector('i.ri-icon.ri-size-14.ri-add-line'));
  assert.ok(optionsDocument.getElementById(templateInputId), 'the query insert button should live beside the template input it edits');

  const headerRule = rule(`.${templateHeaderClass}`);
  assert.deepStrictEqual([headerRule.get('justify-content'), headerRule.get('width')], ['space-between', '100%'],
    'site search template header should span the field and separate the label group from the query button');
  const ghost = rule(`.${ghostClass}`);
  assert.deepStrictEqual(['--settings-button-bg', '--settings-button-shadow', '--settings-button-hover-bg'].map((name) => ghost.get(name)),
    ['transparent', 'none', 'rgba(15, 23, 42, 0.045)'], 'shortcut ghost buttons should stay quiet and only gain a background on hover');
  // Layout properties need the compound selector to survive the base button's `all: unset`.
  assert.strictEqual(rule(`._x_extension_shortcut_submit_2024_unique_.${ghostClass}`).get('white-space'), 'nowrap',
    'shortcut ghost buttons should not wrap their label');
  const dark = rule(`body[data-theme="dark"] .${ghostClass}`);
  assert.deepStrictEqual(
    ['--settings-button-color', '--settings-button-bg', '--settings-button-shadow', '--settings-button-hover-bg', '--settings-button-hover-color']
      .map((name) => dark.get(name)),
    ['var(--panel-subtext)', 'transparent', 'none', 'color-mix(in srgb, var(--control-hover-bg) 72%, transparent)', 'var(--panel-text)'],
    'dark shortcut ghost buttons should use dark tokens and expose their hover as variant tokens'
  );
  assert.strictEqual(optionsCss.rule(`body[data-theme="dark"] .${ghostClass}:hover`), null,
    'dark shortcut ghost buttons should not need a separate hover selector');
  const insert = rule(`._x_extension_shortcut_submit_2024_unique_.${buttonClass}`);
  assert.strictEqual(insert.get('margin-left'), 'auto', 'query insert button should sit on the right side of the template header');
  assert.strictEqual(insert.has('text-align'), false, 'query insert button should move as a control without right-aligning its label');
}

// The button inserts {query} at the caret and keeps editing there.
async function testInsertsTheQueryToken() {
  const page = await createOptionsPage({});
  await page.settle(200);
  const input = page.byId(templateInputId);
  const setValue = Object.getOwnPropertyDescriptor(page.window.HTMLInputElement.prototype, 'value').set;
  setValue.call(input, 'https://example.com/?q=&lang=en');
  input.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  input.focus();
  const caret = 'https://example.com/?q='.length;
  input.setSelectionRange(caret, caret);
  await page.click(page.byId(buttonId));
  assert.strictEqual(input.value, 'https://example.com/?q={query}&lang=en', 'the query token should go in at the caret');
  assert.strictEqual(page.document.activeElement, input, 'the template field should keep focus');
  assert.deepStrictEqual([input.selectionStart, input.selectionEnd], [caret + '{query}'.length, caret + '{query}'.length],
    'the caret should sit after the inserted token');
  page.close();
}

const expectedMessages = {
  en: 'Insert query variable',
  ja: '検索変数を挿入',
  zh_CN: '插入查询变量',
  zh_TW: '插入查詢變數'
};
Object.entries(expectedMessages).forEach(([locale, message]) => {
  const messages = JSON.parse(fs.readFileSync(path.join(repoRoot, '_locales', locale, 'messages.json'), 'utf8'));
  assert.strictEqual(messages.shortcuts_insert_query && messages.shortcuts_insert_query.message, message, `${locale} should localize the query insert button`);
});

(async () => {
  testMarkupAndStyles();
  await testInsertsTheQueryToken();
  console.log('options site search query button tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
