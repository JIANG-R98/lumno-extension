const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readPageSource } = require('./helpers/page-source');

const repoRoot = path.resolve(__dirname, '..');
const optionsHtml = readPageSource('src/options/options.html');
const optionsJs = fs.readFileSync(
  path.join(repoRoot, 'src', 'options', 'options.js'),
  'utf8'
);

assert.match(
  optionsHtml,
  /#_x_extension_settings_panel_2024_unique_\[data-height-animating="true"\]\s*\{[\s\S]*?overflow:\s*clip;[\s\S]*?overflow-anchor:\s*none;[\s\S]*?will-change:\s*height;/,
  'the outer settings panel should clip and own the height animation'
);
assert.match(
  optionsHtml,
  /#_x_extension_settings_panel_2024_unique_\[data-height-animating="true"\]\s*>\s*\*\s*\{\s*flex-shrink:\s*0;/,
  'panel children should keep their natural height while the background stretches'
);
assert.match(
  optionsHtml,
  /#_x_extension_options_root_2024_unique_\s*\{[\s\S]*?--settings-focus-anchor-reserve:\s*0px;[\s\S]*?margin-bottom:\s*var\(--settings-focus-anchor-reserve\);/,
  'the page should expose transparent scroll reserve outside the white panel'
);
assert.match(
  optionsHtml,
  /\._x_extension_setting_row_2024_unique_\[hidden\][\s\S]*?display:\s*none\s*!important;/,
  'conditional settings should hide the complete row instead of only its control'
);

assert.match(
  optionsJs,
  /function animateOptionsPanelHeight\(mutateLayout\)[\s\S]*?beforeHeight\s*=\s*panel\.getBoundingClientRect\(\)\.height[\s\S]*?afterHeight\s*=\s*panel\.getBoundingClientRect\(\)\.height[\s\S]*?panel\.animate\([\s\S]*?height:\s*`\$\{beforeHeight\}px`[\s\S]*?height:\s*`\$\{afterHeight\}px`/,
  'conditional layout changes should animate the measured outer panel height'
);
assert.match(
  optionsJs,
  /animation\.onfinish\s*=\s*\(\)\s*=>\s*\{[\s\S]*?animation\.cancel\(\);[\s\S]*?panel\.style\.removeProperty\('height'\)/,
  'a completed height animation should release its fill effect before returning to natural height'
);
assert.match(
  optionsJs,
  /getFocusedSettingsPanelAnchor\(\)[\s\S]*?focusOffset\s*=\s*nextFocusTop\s*-\s*focusTop[\s\S]*?window\.scrollBy\(0,\s*focusOffset\)/,
  'the focused control should retain its viewport height through the layout change'
);
assert.match(
  optionsJs,
  /function primeOptionsPanelFocusAnchorReserve\(anchor,\s*beforeHeight\)[\s\S]*?function stabilizeOptionsPanelFocusAnchor\(anchor,\s*focusTop,\s*minimumHeightReduction\)[\s\S]*?baseDocumentHeight[\s\S]*?requiredReserve[\s\S]*?setOptionsPanelFocusAnchorReserve\(anchor,\s*requiredReserve\)/,
  'bottom-of-page clamping should be offset outside the panel while its trigger stays focused'
);
assert.match(
  optionsJs,
  /canAnimateHeight\s*\?\s*Math\.max\(0,\s*afterHeight\s*-\s*beforeHeight\)\s*:\s*0[\s\S]*?animation\.onfinish[\s\S]*?stabilizeOptionsPanelFocusAnchor\(focusAnchor,\s*focusTop,\s*0\)/,
  'the focus reserve should cover the full expansion tween and release at its final height'
);
assert.match(
  optionsJs,
  /window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/,
  'panel height motion should respect reduced-motion preferences'
);

assert.match(
  optionsJs,
  /function updateBookmarkColumnsSettingVisibility\(countValue\)[\s\S]*?animateOptionsPanelHeight\([\s\S]*?bookmarkColumnsSettingRow/,
  'zero bookmark rows should hide the whole bookmarks-per-row setting through the panel animator'
);
assert.match(
  optionsJs,
  /function syncNewtabTimeSecondsVisibility\(\)[\s\S]*?animateOptionsPanelHeight\([\s\S]*?newtabTimeFontWeightRow,\s*newtabTimeSecondsRow/,
  'time-only subsettings should share the panel height animator'
);
assert.match(
  optionsJs,
  /function updateRecentModeTabsVisibility\(countValue\)[\s\S]*?animateOptionsPanelHeight\([\s\S]*?recentModeTabsWrap/,
  'recent-site dependent controls should share the panel height animator'
);
assert.match(
  optionsJs,
  /function updateOverlayPageThemeAdaptationVisibility\(mode\)[\s\S]*?animateOptionsPanelHeight\([\s\S]*?overlayPageThemeAdaptationRow/,
  'system-theme dependent settings should share the panel height animator'
);

console.log('Options conditional layout motion tests passed.');
