const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readPageSource } = require('./helpers/page-source');

const repoRoot = path.join(__dirname, '..');
const optionsHtml = readPageSource('src/options/options.html');
const optionsJs = fs.readFileSync(path.join(repoRoot, 'src/options/options.js'), 'utf8');

const buttonId = '_x_extension_site_search_insert_query_2026_unique_';
const buttonClass = '_x_extension_site_search_insert_query_2026_unique_';
const ghostClass = '_x_extension_shortcut_ghost_2026_unique_';
const templateHeaderClass = '_x_extension_site_search_template_header_2026_unique_';
const templateLabelClass = '_x_extension_site_search_template_label_2026_unique_';
const templateInputId = '_x_extension_site_search_template_2024_unique_';

function getRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = optionsHtml.match(new RegExp(`(?:^|\\n)\\s*${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `${selector} should exist in options CSS`);
  return match[1];
}

assert.match(
  optionsHtml,
  new RegExp(`<div class="[^"]*_x_extension_shortcut_label_row_2024_unique_[^"]*${templateHeaderClass}[^"]*">[\\s\\S]*?<div class="${templateLabelClass}">[\\s\\S]*?<\\/div>[\\s\\S]*?<button[^>]+id="${buttonId}"[^>]+type="button"[^>]+class="[^"]*_x_extension_shortcut_submit_2024_unique_[^"]*${ghostClass}[^"]*${buttonClass}[^"]*"[^>]*>[\\s\\S]*?<span data-i18n="shortcuts_insert_query">插入查询变量<\\/span>[\\s\\S]*?<i class="ri-icon ri-size-14 ri-add-line"`),
  'custom site search form should place the compact ghost button on the right side of the template header'
);
const buttonMarkup = optionsHtml.match(new RegExp(`<button[^>]+id="${buttonId}"[\\s\\S]*?<\\/button>`));
assert.ok(buttonMarkup, 'query insert button should exist');
assert.doesNotMatch(buttonMarkup[0], /ri-braces-line/, 'query insert button should not show a duplicate braces icon');

assert.match(
  optionsHtml,
  new RegExp(`<input id="${templateInputId}"`),
  'the query insert button should live beside the template input it edits'
);

const templateHeaderRule = getRule(`.${templateHeaderClass}`);
assert.match(
  templateHeaderRule,
  /justify-content:\s*space-between;/,
  'site search template header should separate the label group from the right-side query button'
);
assert.match(templateHeaderRule, /width:\s*100%;/, 'site search template header should span the field width');

const ghostRule = getRule(`.${ghostClass}`);
// Layout properties need the compound selector to survive the base button's `all: unset`.
const ghostLayoutRule = getRule(`._x_extension_shortcut_submit_2024_unique_.${ghostClass}`);
const darkGhostRule = getRule(`body[data-theme="dark"] .${ghostClass}`);
[
  /--settings-button-bg:\s*transparent;/,
  /--settings-button-shadow:\s*none;/
].forEach((pattern) => {
  assert.match(ghostRule, pattern, 'shortcut ghost buttons should stay visually quiet and compact');
});
assert.match(ghostLayoutRule, /white-space:\s*nowrap;/, 'shortcut ghost buttons should not wrap their label');
assert.match(
  ghostRule,
  /--settings-button-hover-bg:\s*rgba\(15,\s*23,\s*42,\s*0\.045\);/,
  'shortcut ghost buttons should only gain a background on hover'
);
assert.match(
  darkGhostRule,
  /--settings-button-color:\s*var\(--panel-subtext\);/,
  'dark shortcut ghost buttons should use the dark-mode subtext token'
);
assert.match(
  darkGhostRule,
  /--settings-button-bg:\s*transparent;/,
  'dark shortcut ghost buttons should stay backgroundless by default'
);
assert.match(
  darkGhostRule,
  /--settings-button-shadow:\s*none;/,
  'dark shortcut ghost buttons should stay flat by default'
);
assert.doesNotMatch(
  darkGhostRule,
  /rgba\(156,\s*163,\s*175,\s*0\.88\)|#f3f4f6|rgba\(255,\s*255,\s*255,/,
  'dark shortcut ghost buttons should not hard-code the old pale dark-mode colors'
);
assert.match(
  darkGhostRule,
  /--settings-button-hover-bg:\s*color-mix\(in srgb,\s*var\(--control-hover-bg\)\s*72%,\s*transparent\);/,
  'dark shortcut ghost buttons should expose their quiet hover surface as a variant token'
);
assert.match(
  darkGhostRule,
  /--settings-button-hover-color:\s*var\(--panel-text\);/,
  'dark shortcut ghost buttons should expose their hover text lift as a variant token'
);
assert.ok(
  !new RegExp(`(?:^|\\n)\\s*body\\[data-theme="dark"\\]\\s+\\.${ghostClass}:hover\\s*\\{`).test(optionsHtml),
  'dark shortcut ghost buttons should not need a separate hover selector'
);
const buttonRule = getRule(`._x_extension_shortcut_submit_2024_unique_.${buttonClass}`);
assert.match(buttonRule, /margin-left:\s*auto;/, 'query insert button should sit on the right side of the template header');
assert.doesNotMatch(buttonRule, /text-align:\s*right;/, 'query insert button should move as a control without right-aligning its label');

assert.match(
  optionsJs,
  new RegExp(`const siteSearchInsertQueryButton = document\\.getElementById\\('${buttonId}'\\);`),
  'options should cache the query insert button'
);
assert.match(
  optionsJs,
  /function insertSiteSearchQueryToken\(\)[\s\S]*?const token = '\{query\}';[\s\S]*?setSelectionRange\(nextCursor,\s*nextCursor\)/,
  'query insertion should preserve focus and place the caret after the inserted token'
);
assert.match(
  optionsJs,
  /siteSearchInsertQueryButton\.addEventListener\('click'[\s\S]*?insertSiteSearchQueryToken\(\);/,
  'clicking the query ghost button should insert the query token'
);

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

console.log('options site search query button tests passed');
