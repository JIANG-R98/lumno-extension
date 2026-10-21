const assert = require('assert');
const { readStylesheet } = require('../helpers/css-tokens');
const fs = require('fs');
const path = require('path');
const { parseCss, parsePageCss } = require('../helpers/css-rules');
const { openSearchSurface } = require('../helpers/search-surfaces');


const newtabCss = parsePageCss('newtab.html');
const overlayCss = parseCss(readStylesheet('src/overlay/suggestions-view.css'));
const onboardingCss = parsePageCss('src/onboarding/onboarding.html');

// A rule's declarations, checked the way the old text checks read them.
function getCssRuleBlock(css, selector) {
  const rule = css.rule(selector);
  assert.ok(rule, `missing CSS rule: ${selector}`);
  return rule;
}

function assertDeclares(rule, property, expected, message) {
  const value = rule.get(property);
  assert.ok(expected instanceof RegExp ? expected.test(value || '') : value === expected,
    `${message || property}: ${property} is ${value}`);
}

const overlayScope =
  ':is(#_x_extension_overlay_2024_unique_, #_x_extension_onboarding_overlay_demo_2026_unique_)';

[
  {
    source: newtabCss,
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

  assertDeclares(rightBlock, 'gap', '0',
    `${surface.label} hidden utility slots must not leave a flex gap behind the visible action`);
  assertDeclares(utilitySlotBlock, 'width', '0',
    `${surface.label} utility slots should stay collapsed before hover`);
  assertDeclares(
    utilitySlotBlock,
    'transition',
    /width[\s\S]*margin-left[\s\S]*opacity/,
    `${surface.label} utility slots should preserve their hover reveal transition`
  );
  assertDeclares(visibleUtilitySlotBlock, 'width', '22px',
    `${surface.label} visible utility slots should use the compact action width`);
  assertDeclares(visibleUtilitySlotBlock, 'margin-left', '3px',
    `${surface.label} should keep compact spacing between visible utility actions`);
  assertDeclares(leadingUtilitySlotBlock, 'margin-left', '10px',
    `${surface.label} should leave more space between the text action and its first utility icon`);
  assertDeclares(actionTagBlock, 'border', '0');
  assertDeclares(actionTagBlock, 'height', 'auto');
  assertDeclares(actionTagBlock, 'padding', '4px 8px');
  assertDeclares(actionTagBlock, 'border-radius', '8px');
  assertDeclares(searchActionTagBlock, 'justify-content', 'center');
  assertDeclares(searchActionTagBlock, 'gap', '0');
  assertDeclares(searchActionTagBlock, 'padding', '4px 8px');
  assertDeclares(nonSimpleVisitButtonBlock, 'background', 'transparent');
  assertDeclares(nonSimpleVisitButtonBlock, 'border', '0');
  assertDeclares(nonSimpleVisitButtonBlock, 'padding', '0');
  assertDeclares(nonSimpleVisitButtonBlock, 'justify-content', 'flex-end');
  assertDeclares(nonSimpleVisitButtonBlock, 'text-align', 'right');
});

const previewRightBlock = getCssRuleBlock(
  onboardingCss,
  '.newtab-preview-viewport .x-nt-suggestion-right'
);
const previewActionTagBlock = getCssRuleBlock(
  onboardingCss,
  '.newtab-preview-viewport .x-nt-suggestion-action-tag'
);
const previewVisibleUtilitySlotBlock = getCssRuleBlock(
  onboardingCss,
  '.newtab-preview-viewport .x-nt-suggestion-utility-slot[data-visible="true"]'
);
const previewLeadingUtilitySlotBlock = getCssRuleBlock(
  onboardingCss,
  '.newtab-preview-viewport .x-nt-suggestion-utility-slot[data-visible="true"][data-leading="true"]'
);
const overlayDemoActionTagBlock = getCssRuleBlock(
  onboardingCss,
  '.site-search-demo-result .x-ov-action-tag'
);

assertDeclares(previewRightBlock, 'gap', '0');
assertDeclares(previewVisibleUtilitySlotBlock, 'width', '22px');
assertDeclares(previewVisibleUtilitySlotBlock, 'margin-left', '3px');
assertDeclares(previewLeadingUtilitySlotBlock, 'margin-left', '10px');
[previewActionTagBlock, overlayDemoActionTagBlock].forEach((block) => {
  assertDeclares(block, 'border', '0');
  assertDeclares(block, 'height', 'auto');
  assertDeclares(block, 'padding', '4px 8px');
  assertDeclares(block, 'border-radius', '8px');
});

// On the real New Tab page: hovering a row reveals its utility actions, a
// selected row that matches an open tab switches to it wherever it sits, and
// search-first ordering puts the search rows before local results.
const PRIORITY_KEY = '_x_extension_search_result_priority_2026_unique_';
const LOCAL = [
  { type: 'history', title: 'Cats history', url: 'https://cats.test/' },
  { type: 'history', title: 'Dev app', url: 'http://localhost:3000/app' }
];
const TABS = [{ id: 7, windowId: 1, title: 'Dev app', url: 'http://localhost:3000/app' }];

function openNewtab(priority) {
  return openSearchSurface('newtab', {
    sync: priority ? { [PRIORITY_KEY]: priority } : {},
    respond(message) {
      if (message.action === 'getSearchSuggestions') return { suggestions: LOCAL };
      if (message.action === 'getTabsForOverlay') return { tabs: TABS };
      if (message.action === 'getSearchEngineSuggestions') {
        return {
          suggestions: (message.localSuggestions || []).concat(['cats a', 'cats b'].map((title) => (
            { type: 'googleSuggest', title, url: `https://www.google.com/search?q=${encodeURIComponent(title)}` }
          ))),
          hasRemoteSuggestions: true
        };
      }
      return undefined;
    }
  });
}

async function testRows() {
  const surface = await openNewtab();
  await surface.type('cats app');
  await surface.settle(150);
  const row = surface.suggestions()[0];
  const slots = () => Array.from(row.querySelectorAll('.x-nt-suggestion-utility-slot')).map((slot) => slot.getAttribute('data-visible'));
  assert.ok(slots().length > 0 && slots().every((visible) => visible !== 'true'), 'utility actions should start hidden');
  // A pointer moving onto the row fires both.
  row.dispatchEvent(new surface.window.MouseEvent('mouseenter'));
  row.dispatchEvent(new surface.window.MouseEvent('mouseover', { bubbles: true }));
  await surface.settle(30);
  assert.ok(slots().every((visible) => visible === 'true'), 'hovering a row should reveal its utility actions');
  surface.close();

  const searchFirst = await openNewtab('search');
  await searchFirst.type('cats app');
  await searchFirst.settle(250);
  const types = searchFirst.suggestions().map((item) => item._xSuggestion.type);
  const firstLocal = types.indexOf('history');
  assert.ok(firstLocal > 0 && types.slice(0, firstLocal).every((type) => type === 'newtab' || type === 'googleSuggest'),
    `search-first ordering should lead with the search rows: ${types.join(', ')}`);
  const matched = searchFirst.suggestions().findIndex((item) => item._xSuggestion._xMatchedTabId === 7);
  assert.ok(matched > 0, 'the open-tab match should not be the first row here');
  while (searchFirst.selectedIndex() < matched) {
    searchFirst.press('ArrowDown');
    await searchFirst.settle(20);
  }
  const before = searchFirst.page.messages.length;
  searchFirst.press('Enter');
  await searchFirst.settle(100);
  assert.ok(searchFirst.page.messages.slice(before).some((message) => message.action === 'switchToTab' && message.tabId === 7),
    'a selected row matching an open tab should switch to it even when it is not first');
  searchFirst.close();
}

testRows().then(() => {
  console.log('suggestion action alignment tests passed');
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
