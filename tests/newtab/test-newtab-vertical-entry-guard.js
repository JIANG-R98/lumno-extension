const assert = require('assert');
const fs = require('fs');
const path = require('path');
const settings = require('../../src/domain/settings.ts');
const { parseCss, parsePageCss } = require('../helpers/css-rules');
const { openSearchSurface } = require('../helpers/search-surfaces');

const repoRoot = path.resolve(__dirname, '..', '..');
const newtabCss = parsePageCss('newtab.html');
const read = (file) => parseCss(fs.readFileSync(path.join(repoRoot, file), 'utf8'));

// Each top-level rule as { selector, declarations } (the declarations as CSS
// text), read through the CSSOM.
function collectRuleBlocks(css) {
  return css.entries.map((entry) => ({ selector: entry.selectors.join(', '), declarations: entry.style.cssText }));
}

const ruleBlocks = collectRuleBlocks(newtabCss);
const featureHintRuleBlocks = collectRuleBlocks(read('src/shared/ui/feature-hints.css'));
const shortcutDialogRuleBlocks = collectRuleBlocks(read('src/newtab/shortcuts/shortcut-dialog.css'));
const verticalTranslationPattern = /\btranslate(?:Y|3d)?\s*\(|\btranslate\s*:/;

[
  '.x-nt-feedback-popover',
  '.x-nt-feedback-menu',
  '.x-nt-feedback-detail',
  '.x-nt-shortcut-context-menu-portal',
  '.x-nt-section-mode-portal',
  '.x-nt-wallpaper-panel',
  '.x-nt-wallpaper-body',
  '.x-nt-panel-collapsible',
  '.x-nt-wallpaper-grid[data-motion="enter"]',
  '.x-nt-search-width-control',
  '.x-nt-effect-slider-control',
  '.x-nt-folder-preview',
  '.x-nt-bookmark-cascade-debug-label',
  '.x-nt-bookmark-cascade-level',
  '.x-nt-recent-action',
  '.x-nt-recent-pin'
].forEach((selectorFragment) => {
  const matchingBlocks = ruleBlocks.filter(({ selector }) => selector.includes(selectorFragment));
  assert.ok(matchingBlocks.length > 0, `missing guarded New Tab selector: ${selectorFragment}`);
  matchingBlocks.forEach(({ selector, declarations }) => {
    assert.doesNotMatch(
      declarations,
      verticalTranslationPattern,
      `${selector} should reveal in place without vertical translation`
    );
  });
});

[
  '.x-lumno-feature-hint--newtab-ai-quick-jump',
  '.x-lumno-feature-hint--newtab-tab-switcher',
  '.x-lumno-feature-hint--newtab-webdav-sync',
  '.x-lumno-feature-hint--newtab-help-center-ask',
  '.x-lumno-feature-hint--update-notice-newtab'
].forEach((selectorFragment) => {
  const matchingBlocks = featureHintRuleBlocks.filter(({ selector }) => (
    selector.includes(selectorFragment)
  ));
  assert.ok(matchingBlocks.length > 0, `missing guarded feature hint: ${selectorFragment}`);
  matchingBlocks.forEach(({ selector, declarations }) => {
    assert.doesNotMatch(
      declarations,
      verticalTranslationPattern,
      `${selector} should reveal in place without vertical translation`
    );
  });
});

const wallpaperHintBlocks = featureHintRuleBlocks.filter(({ selector }) => (
  selector.includes('.x-lumno-feature-hint--newtab-wallpaper')
));
assert.ok(wallpaperHintBlocks.length > 0, 'missing guarded New Tab wallpaper feature hint');
wallpaperHintBlocks.forEach(({ selector, declarations }) => {
  const verticalTranslations = declarations.match(/translateY\([^)]*\)/g) || [];
  verticalTranslations.forEach((translation) => {
    assert.strictEqual(
      translation,
      'translateY(-50%)',
      `${selector} should use vertical translation only for fixed anchor centering`
    );
  });
});

const shortcutDialogBlocks = shortcutDialogRuleBlocks.filter(({ selector }) => (
  selector.includes('.x-nt-shortcut-dialog') &&
  !selector.includes('.x-lumno-action-button')
));
assert.ok(shortcutDialogBlocks.length > 0, 'missing guarded New Tab shortcut dialog');
shortcutDialogBlocks.forEach(({ selector, declarations }) => {
  assert.doesNotMatch(
    declarations,
    verticalTranslationPattern,
    `${selector} should open in place without vertical translation`
  );
});

const tooltipRest = newtabCss.entries.find((entry) => entry.selectors.some((selector) => (
  selector.startsWith('body ._x_extension_tooltip_2026_unique_._x_extension_cursor_tooltip_tag_2026_unique_[data-tooltip-kind][data-visible="true"]')
)));
assert.strictEqual(tooltipRest && tooltipRest.style.getPropertyValue('transform'), 'none',
  'New Tab tooltips should override the shared vertical reveal motion');

[
  '_x_nt_time_seconds_soft_swap_2026_unique_',
  '_x_nt_wordmark_enter_2026_unique_',
  '_x_nt_shortcut_entry_2026_unique_',
  '_x_nt_content_section_entry_2026_unique_',
  '_x_nt_corner_control_entry_2026_unique_',
  '_x_nt_topbar_entry_2026_unique_',
  '_x_nt_topbar_floating_entry_2026_unique_',
  '_x_nt_topbar_content_entry_2026_unique_'
].forEach((keyframesName) => {
  const frames = newtabCss.keyframes(keyframesName);
  assert.ok(frames, `missing @keyframes ${keyframesName}`);
  assert.doesNotMatch(
    Object.values(frames).map((frame) => frame.cssText).join(' '),
    verticalTranslationPattern,
    `${keyframesName} should keep every element at its final vertical coordinate`
  );
});

const gridMotion = (motion) => newtabCss.rule(`.x-nt-wallpaper-grid[data-motion="${motion}"]`).get('transform');
assert.strictEqual(gridMotion('enter-next'), 'translateX(8px)', 'wallpaper source tabs should keep their horizontal direction cue');
assert.strictEqual(gridMotion('enter-prev'), 'translateX(-8px)');

// On the page: the scope panel opens at the coordinate it closes at, and
// hiding the top content does not slide it.
async function testNewTab() {
  const surface = await openSearchSurface('newtab');
  const menu = surface.root.querySelector('.x-lumno-search-input-mode__menu');
  const vertical = (name) => (menu.style.getPropertyValue(name).match(/^translateY\(.*\)(?= scale)/) || [''])[0];
  const closed = vertical('--x-extension-menu-surface-closed-transform');
  assert.ok(closed, 'the scope panel should have a closed transform');
  assert.strictEqual(vertical('--x-extension-menu-surface-open-transform'), closed,
    'the New Tab scope panel should open without moving vertically');
  const topContent = surface.page.document.getElementById('_x_extension_newtab_wordmark_2026_unique_');
  surface.page.changeStorage('sync', settings.NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY, settings.NEWTAB_TOP_CONTENT_OFF);
  await surface.settle(200);
  surface.page.changeStorage('sync', settings.NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY, settings.NEWTAB_TOP_CONTENT_TIME);
  await surface.settle(200);
  assert.doesNotMatch(topContent.getAttribute('style') || '', verticalTranslationPattern, 'top content should show and hide in place');
  surface.close();
}

testNewTab().then(() => {
    process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
console.log('newtab vertical entry guard tests passed');
