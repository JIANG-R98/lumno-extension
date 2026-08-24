const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const newtabHtml = fs.readFileSync(
  path.join(repoRoot, 'newtab.html'),
  'utf8'
);
const overlayCss = fs.readFileSync(
  path.join(repoRoot, 'src/overlay/suggestions-view.css'),
  'utf8'
);
const onboardingHtml = fs.readFileSync(
  path.join(repoRoot, 'src/onboarding/onboarding.html'),
  'utf8'
);
const suggestionsReact = fs.readFileSync(
  path.join(repoRoot, 'react-src/newtab/suggestions.tsx'),
  'utf8'
);
const newtabSource = fs.readFileSync(
  path.join(repoRoot, 'src/newtab/newtab.js'),
  'utf8'
);

function getCssRuleBlock(source, selector) {
  const start = source.indexOf(`${selector} {`);
  assert.notStrictEqual(start, -1, `missing CSS rule: ${selector}`);
  const end = source.indexOf('}', start);
  assert.notStrictEqual(end, -1, `unterminated CSS rule: ${selector}`);
  return source.slice(start, end + 1);
}

const overlayScope =
  ':is(#_x_extension_overlay_2024_unique_, #_x_extension_onboarding_overlay_demo_2026_unique_)';

[
  {
    source: newtabHtml,
    right: '.x-nt-suggestion-right',
    actionTag: '.x-nt-suggestion-action-tag',
    searchActionTag: '.x-nt-suggestion-action-tag[data-action="search"]',
    utilitySlot: '.x-nt-suggestion-utility-slot',
    visibleUtilitySlot: '.x-nt-suggestion-utility-slot[data-visible="true"]',
    leadingUtilitySlot: '.x-nt-suggestion-utility-slot[data-visible="true"][data-leading="true"]',
    nonSimpleVisitButton: '.x-nt-suggestion-item[data-simple-mode="false"] .x-nt-suggestion-visit-button',
    actionHeightToken: '--x-nt-suggestion-action-height',
    label: 'New Tab'
  },
  {
    source: overlayCss,
    right: `${overlayScope} .x-ov-suggestion-right`,
    actionTag: `${overlayScope} .x-ov-action-tag`,
    searchActionTag: `${overlayScope} .x-ov-action-tag[data-action="search"]`,
    utilitySlot: `${overlayScope} .x-ov-suggestion-utility-slot`,
    visibleUtilitySlot: `${overlayScope} .x-ov-suggestion-utility-slot[data-visible="true"]`,
    leadingUtilitySlot: `${overlayScope} .x-ov-suggestion-utility-slot[data-visible="true"][data-leading="true"]`,
    nonSimpleVisitButton: `${overlayScope} .x-ov-suggestion-item[data-simple-mode="false"] .x-ov-suggestion-visit-button`,
    actionHeightToken: '--x-ov-suggestion-action-height',
    label: 'Overlay'
  }
].forEach((surface) => {
  const rightBlock = getCssRuleBlock(surface.source, surface.right);
  const actionTagBlock = getCssRuleBlock(surface.source, surface.actionTag);
  const searchActionTagBlock = getCssRuleBlock(
    surface.source,
    surface.searchActionTag
  );
  const utilitySlotBlock = getCssRuleBlock(surface.source, surface.utilitySlot);
  const visibleUtilitySlotBlock = getCssRuleBlock(
    surface.source,
    surface.visibleUtilitySlot
  );
  const leadingUtilitySlotBlock = getCssRuleBlock(
    surface.source,
    surface.leadingUtilitySlot
  );
  const nonSimpleVisitButtonBlock = getCssRuleBlock(
    surface.source,
    surface.nonSimpleVisitButton
  );

  assert.match(
    rightBlock,
    /gap:\s*0;/,
    `${surface.label} hidden utility slots must not leave a flex gap behind the visible action`
  );
  assert.match(
    utilitySlotBlock,
    /width:\s*0;/,
    `${surface.label} utility slots should stay collapsed before hover`
  );
  assert.match(
    utilitySlotBlock,
    /transition:[^;]*width[^;]*margin-left[^;]*opacity[^;]*;/,
    `${surface.label} utility slots should preserve their hover reveal transition`
  );
  assert.match(
    visibleUtilitySlotBlock,
    /width:\s*22px;/,
    `${surface.label} visible utility slots should use the compact action width`
  );
  assert.match(
    visibleUtilitySlotBlock,
    /margin-left:\s*3px;/,
    `${surface.label} should keep compact spacing between visible utility actions`
  );
  assert.match(
    leadingUtilitySlotBlock,
    /margin-left:\s*10px;/,
    `${surface.label} should leave more space between the text action and its first utility icon`
  );
  assert.match(actionTagBlock, /border:\s*0;/);
  assert.match(actionTagBlock, /height:\s*auto;/);
  assert.match(actionTagBlock, /padding:\s*4px 8px;/);
  assert.match(actionTagBlock, /border-radius:\s*8px;/);
  assert.match(searchActionTagBlock, /justify-content:\s*center;/);
  assert.match(searchActionTagBlock, /gap:\s*0;/);
  assert.match(searchActionTagBlock, /padding:\s*4px 8px;/);
  assert.match(nonSimpleVisitButtonBlock, /background:\s*transparent;/);
  assert.match(nonSimpleVisitButtonBlock, /border:\s*0;/);
  assert.match(nonSimpleVisitButtonBlock, /padding:\s*0;/);
  assert.match(nonSimpleVisitButtonBlock, /justify-content:\s*flex-end;/);
  assert.match(nonSimpleVisitButtonBlock, /text-align:\s*right;/);
});

const previewRightBlock = getCssRuleBlock(
  onboardingHtml,
  '.newtab-preview-viewport .x-nt-suggestion-right'
);
const previewActionTagBlock = getCssRuleBlock(
  onboardingHtml,
  '.newtab-preview-viewport .x-nt-suggestion-action-tag'
);
const previewVisibleUtilitySlotBlock = getCssRuleBlock(
  onboardingHtml,
  '.newtab-preview-viewport .x-nt-suggestion-utility-slot[data-visible="true"]'
);
const previewLeadingUtilitySlotBlock = getCssRuleBlock(
  onboardingHtml,
  '.newtab-preview-viewport .x-nt-suggestion-utility-slot[data-visible="true"][data-leading="true"]'
);
const overlayDemoActionTagBlock = getCssRuleBlock(
  onboardingHtml,
  '.site-search-demo-result .x-ov-action-tag'
);

assert.match(previewRightBlock, /gap:\s*0;/);
assert.match(previewVisibleUtilitySlotBlock, /width:\s*22px;/);
assert.match(previewVisibleUtilitySlotBlock, /margin-left:\s*3px;/);
assert.match(previewLeadingUtilitySlotBlock, /margin-left:\s*10px;/);
[previewActionTagBlock, overlayDemoActionTagBlock].forEach((block) => {
  assert.match(block, /border:\s*0;/);
  assert.match(block, /height:\s*auto;/);
  assert.match(block, /padding:\s*4px 8px;/);
  assert.match(block, /border-radius:\s*8px;/);
});

assert.match(
  suggestionsReact,
  /const visible = Boolean\(item\._xIsHovering\);[\s\S]*?slot\.setAttribute\('data-visible', visible \? 'true' : 'false'\);[\s\S]*?button\.setAttribute\('data-visible', visible \? 'true' : 'false'\);/,
  'shared React rows should continue revealing utility slots and buttons together on hover'
);
assert.match(
  newtabSource,
  /function shouldSwitchMatchedTabSuggestion\(suggestion\)[\s\S]*?typeof suggestion\._xMatchedTabId !== 'number'[\s\S]*?openTabQuickSwitchEnabled[\s\S]*?return true;/,
  'a selected matching open-tab result should switch even when it is not the first row'
);
assert.match(
  newtabSource,
  /searchResultPriorityMode === 'search'[\s\S]*?composeSearchFirstSuggestionSlate\(allSuggestions, \{\s*limit: searchResultDisplayLimit\s*\}\)/,
  'search-first rendering should use the shared quota slate instead of interleaving local and keyword-search rows'
);

console.log('suggestion action alignment tests passed');
