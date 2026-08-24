const assert = require('assert');
const fs = require('fs');
const shortcutFavicon = require('../src/shared/shortcut-favicon.js');

const newtabSource = fs.readFileSync('src/newtab/newtab.js', 'utf8');
const newtabHtml = fs.readFileSync('newtab.html', 'utf8');
const searchInputCss = fs.readFileSync('src/shared/search-input.css', 'utf8');
const overlaySource = fs.readFileSync('src/overlay/search-panel.js', 'utf8');

assert.match(
  newtabSource,
  /iconStyleOverrides:\s*\{[\s\S]*?'left': '7px'/,
  'the search action hit box should stay optically aligned with the original icon'
);
assert.match(
  newtabSource,
  /searchScopeIcon\.dataset\.searchScopeAction = 'true'[\s\S]*?setAttribute\('role', 'button'\)[\s\S]*?setAttribute\('tabindex', '0'\)[\s\S]*?setAttribute\('aria-label', searchScopeTooltipText\(\)\)/,
  'the search icon should expose an accessible action contract'
);
assert.match(
  newtabSource,
  /function activateSearchScopeIcon\(event\)[\s\S]*?resetModeMenuDoubleTab\(\)[\s\S]*?openSearchModeMenuFromDoubleTab\(\)/,
  'clicking the search icon should reuse the double-Tab scope-panel result and animation'
);
assert.match(
  newtabSource,
  /function openSearchModeMenuFromDoubleTab\(\)[\s\S]*?activateSiteSearch\(provider\);[\s\S]*?function activateSiteSearch\(provider, activationOptions\)[\s\S]*?animate: options\.animatePrefix !== false/,
  'icon, double-Tab, and keyword-Tab activation should share the normal tag entrance animation'
);
assert.match(
  newtabSource,
  /function openSearchModeMenuFromDoubleTab\(\) \{[\s\S]*?const expectedInputValue = String\(inputParts\.input\.value \|\| ''\);[\s\S]*?activateSiteSearch\(provider, \{[\s\S]*?preserveResults: shouldPreserveSearchModeResults\(expectedInputValue\)[\s\S]*?\}\);[\s\S]*?restoreSearchModeQuery\(expectedInputValue\);/,
  'the search action should open the scope panel without discarding an existing query or result list'
);
assert.match(
  newtabSource,
  /const attachInputModeFaviconData =[\s\S]*?SHORTCUT_FAVICON\.createSiteSearchProviderIconHydrator\(attachFaviconData\)[\s\S]*?attachFaviconData: attachInputModeFaviconData/,
  'New Tab provider icons should use the shared direct-versus-hydrated loading policy'
);
assert.strictEqual(
  shortcutFavicon.shouldHydrateSiteSearchProviderIcon(
    'chrome-extension://lumno/assets/images/site-search/tile-gg.png'
  ),
  false,
  'a bundled Google tile should remain a direct image so its layout slot never collapses'
);
assert.strictEqual(
  shortcutFavicon.shouldHydrateSiteSearchProviderIcon(
    'https://example.com/favicon.ico'
  ),
  true,
  'remote custom provider icons should retain the shared favicon-data fallback behavior'
);
assert.match(
  newtabSource,
  /searchScopeIcon\.addEventListener\('click', activateSearchScopeIcon\)[\s\S]*?event\.key !== 'Enter' && event\.key !== ' '[\s\S]*?activateSearchScopeIcon\(event\)/,
  'the search icon should support pointer and keyboard activation'
);
assert.match(
  newtabSource,
  /const activeElement = document\.activeElement;\s*if \(searchScopeIcon && activeElement === searchScopeIcon\) \{\s*return;/,
  'global type-to-search should leave Enter and Space available to the focused search action'
);
assert.match(
  newtabSource,
  /const searchInputCursorTooltipController = globalThis\.LumnoCursorTooltip[\s\S]*?id: '_x_extension_newtab_search_input_cursor_tooltip_2026_unique_'/,
  'new Tab search actions should own a cursor-following bubble controller'
);
assert.match(
  newtabSource,
  /bindSearchInputCursorTooltip\(searchScopeIcon, searchScopeTooltipText\)/,
  'the search icon should use the same cursor-following bubble as overlay'
);
assert.match(
  newtabSource,
  /const settingsTooltipText = \(\) => formatMessage\([\s\S]*?rightIcon\.setAttribute\('data-tooltip', settingsTooltipText\(\)\)[\s\S]*?bindSearchInputCursorTooltip\(rightIcon, settingsTooltipText\)/,
  'the settings icon should restore the same cursor-following bubble as overlay'
);
assert.match(
  newtabHtml,
  /:root\s*\{[\s\S]*?--x-nt-settings-action-hover-bg:\s*rgba\(148, 163, 184, 0\.16\);[\s\S]*?--x-nt-settings-action-hover-color:\s*#4b5563;/,
  'the New Tab settings action should preserve its light-theme hover colors'
);
assert.match(
  newtabHtml,
  /body\[data-theme="dark"\]\s*\{[\s\S]*?--x-nt-settings-action-hover-bg:\s*rgba\(255, 255, 255, 0\.08\);[\s\S]*?--x-nt-settings-action-hover-color:\s*#e5e7eb;/,
  'the New Tab settings action should use a restrained dark-theme hover surface with a light icon'
);
assert.match(
  newtabSource,
  /rightIconStyleOverrides:\s*\{[\s\S]*?'--x-ext-input-icon-hover-bg':\s*'var\(--x-nt-settings-action-hover-bg,[^']+\)'[\s\S]*?'--x-ext-input-icon-hover':\s*'var\(--x-nt-settings-action-hover-color,[^']+\)'/,
  'only the New Tab settings action should bridge the New Tab theme colors into the shared hover tokens'
);
assert.doesNotMatch(
  overlaySource,
  /--x-nt-settings-action-hover-(?:bg|color)/,
  'the New Tab settings-action hover tokens should not leak into Overlay'
);
assert.match(
  overlaySource,
  /target\.style\.setProperty\('--x-ext-input-icon-hover-bg', tokens\.hoverBg\);\s*target\.style\.setProperty\('--x-ext-input-icon-hover', tokens\.text\);/,
  'Overlay should keep its own hover token mapping'
);
assert.match(
  newtabSource,
  /searchInputCursorTooltipController\.bind\(button, getText, \{[\s\S]*?deferHideVisibility: true,[\s\S]*?preserveVisibleOnTargetSwitch: true,[\s\S]*?handoffRoot: inputParts && inputParts\.container/,
  'new Tab input bubbles should hand off between search and settings without disappearing'
);
assert.match(
  searchInputCss,
  /\.x-lumno-search-input__icon\[data-search-scope-action="true"\]\s*\{[\s\S]*?width:\s*30px;[\s\S]*?height:\s*30px;[\s\S]*?cursor:\s*pointer;/,
  'the search action should match the settings action hit target'
);
assert.match(
  searchInputCss,
  /\.x-lumno-search-input__icon\[data-search-scope-action="true"\]\[data-hover-active="true"\]\s*\{[\s\S]*?var\(--x-ext-input-icon-hover-bg[\s\S]*?var\(--x-ext-input-icon-hover/,
  'the search action should reuse the settings hover tokens'
);
assert.match(
  searchInputCss,
  /\.x-lumno-search-input__icon\[data-search-scope-action="true"\]\[data-hover-active="true"\] \.ri-icon\s*\{\s*transform:\s*scale\(1\.06\);/,
  'the search action should match the settings icon hover scale'
);

console.log('New Tab search scope button tests passed');
