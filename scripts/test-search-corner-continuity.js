const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readPageSource } = require('./helpers/page-source');

const repoRoot = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const newtabSource = readPageSource('newtab.html');
const onboardingSource = readPageSource('src/onboarding/onboarding.html');
const overlayShellSource = read('react-src/overlay/shell.tsx');
const overlaySearchPanelSource = read('src/overlay/search-panel.js');
const overlaySuggestionsSource = read('src/overlay/suggestions-view.css');
const sharedSearchInputSource = read('src/shared/search-input.css');
const sharedSearchInputReactSource = read('react-src/shared/search-input.tsx');

// Maps each selector to the corner-shape its last rule declares.
function readCornerShapes(source) {
  const shapes = new Map();
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, selectorText, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const shape = body.match(/corner-shape:\s*([^;]+);/);
    if (!shape) {
      continue;
    }
    selectorText.split(/,(?![^(]*\))/).forEach((selector) => {
      shapes.set(selector.trim().replace(/\s+/g, ' '), shape[1].trim());
    });
  }
  return shapes;
}

function readPxToken(source, token) {
  const match = source.match(new RegExp(`${token}:\\s*(\\d+)px;`));
  assert.ok(match, `missing ${token}`);
  return Number(match[1]);
}

const newtabOuterRadius = readPxToken(newtabSource, '--x-nt-search-shell-radius');
const newtabRestingRadius = readPxToken(newtabSource, '--x-nt-search-resting-radius');
const newtabBorderWidth = readPxToken(newtabSource, '--x-nt-search-shell-border-width');
const newtabShellPadding = readPxToken(newtabSource, '--x-nt-search-shell-padding');
const newtabResultInset = readPxToken(newtabSource, '--x-nt-search-results-padding-inline');

assert.equal(newtabRestingRadius, 28);
assert.equal(newtabOuterRadius - newtabBorderWidth - newtabShellPadding, 27);
assert.equal(newtabRestingRadius - newtabBorderWidth - newtabShellPadding, 23);
assert.equal(newtabOuterRadius - newtabBorderWidth - newtabShellPadding - newtabResultInset, 19);
assert.match(
  newtabSource,
  /--x-nt-search-content-radius:\s*calc\(\s*var\(--x-nt-search-shell-radius\) - var\(--x-nt-search-content-inset\)\s*\);/
);
assert.match(
  newtabSource,
  /--x-nt-search-result-radius:\s*calc\(\s*var\(--x-nt-search-content-radius\) - var\(--x-nt-search-results-padding-inline\)\s*\);/
);
assert.match(
  newtabSource,
  /--x-nt-search-resting-content-radius:\s*calc\(\s*var\(--x-nt-search-resting-radius\) - var\(--x-nt-search-content-inset\)\s*\);/
);
assert.match(
  newtabSource,
  /body\[data-nt-suggestions-open="true"\]\s+#_x_extension_newtab_search_layer_2024_unique_\s*\{[\s\S]*?border-radius:\s*var\(--x-nt-search-resting-content-radius,\s*23px\)\s*var\(--x-nt-search-resting-content-radius,\s*23px\)\s*0\s*0;/
);
assert.match(
  newtabSource,
  /#_x_extension_newtab_suggestions_surface_2026_unique_\s*\{[\s\S]*?border-radius:\s*var\(--x-nt-search-resting-radius,\s*28px\)\s*var\(--x-nt-search-resting-radius,\s*28px\)\s*var\(--x-nt-search-shell-radius,\s*32px\)\s*var\(--x-nt-search-shell-radius,\s*32px\);/
);
assert.match(
  newtabSource,
  /#_x_extension_newtab_suggestions_outline_2026_unique_\s*\{[\s\S]*?border-radius:\s*var\(--x-nt-search-resting-radius,\s*28px\)\s*var\(--x-nt-search-resting-radius,\s*28px\)\s*var\(--x-nt-search-shell-radius,\s*32px\)\s*var\(--x-nt-search-shell-radius,\s*32px\);/
);
assert.match(
  newtabSource,
  /\.x-nt-suggestion-item\s*\{[\s\S]*?border-radius:\s*var\(--x-nt-search-result-radius,\s*19px\);/
);
// Capsules keep round ends: the resting shell and its layer get no continuous shape, and the
// open panel's top corners stay round where they wrap that capsule.
const newtabShapes = readCornerShapes(newtabSource);
assert.equal(newtabShapes.get('#_x_extension_newtab_root_2024_unique_'), undefined);
assert.equal(newtabShapes.get('#_x_extension_newtab_search_layer_2024_unique_'), undefined);
assert.equal(
  newtabShapes.get('#_x_extension_newtab_suggestions_surface_2026_unique_'),
  'round round superellipse(1.25) superellipse(1.25)'
);
assert.equal(
  newtabShapes.get('#_x_extension_newtab_suggestions_outline_2026_unique_'),
  'round round superellipse(1.25) superellipse(1.25)'
);
assert.equal(newtabShapes.get('#_x_extension_newtab_suggestions_container_2024_unique_'), 'superellipse(1.25)');
assert.equal(newtabShapes.get('.x-nt-suggestion-item'), 'superellipse(1.25)');
assert.equal(newtabShapes.get('.x-nt-suggestion-visit-button'), 'round');

const overlayOuterRadius = readPxToken(overlayShellSource, '--x-ov-panel-radius');
const overlayBorderWidth = readPxToken(overlaySuggestionsSource, '--x-ov-panel-border-width');
const overlayResultInset = readPxToken(overlaySuggestionsSource, '--x-ov-results-inset');

// The single-row overlay (56px input inside a 1px border) must read as a rounded rectangle,
// not a capsule, so its continuous corners stay clearly below half its height.
assert.ok(overlayOuterRadius < (56 + overlayBorderWidth * 2) / 2 - 4);
assert.equal(overlayOuterRadius - overlayBorderWidth, 23);
assert.equal(overlayOuterRadius - overlayBorderWidth - overlayResultInset, 11);
assert.match(
  overlaySuggestionsSource,
  /--x-ov-content-radius:\s*calc\(var\(--x-ov-panel-radius, 24px\) - var\(--x-ov-panel-border-width\)\);/
);
assert.match(
  overlaySuggestionsSource,
  /--x-ov-result-radius:\s*calc\(var\(--x-ov-content-radius\) - var\(--x-ov-results-inset\)\);/
);
assert.match(
  overlaySearchPanelSource,
  /var\(--x-ov-content-radius, 23px\) var\(--x-ov-content-radius, 23px\) 0 0/
);
assert.match(
  overlaySuggestionsSource,
  /\.x-ov-suggestion-item\s*\{[\s\S]*?border-radius:\s*var\(--x-ov-result-radius,\s*11px\);/
);
// The panel, its input and its results container are continuous; circles and capsule buttons are not.
const overlayScope = ':is(#_x_extension_overlay_2024_unique_, #_x_extension_onboarding_overlay_demo_2026_unique_)';
const overlayShapes = readCornerShapes(overlaySuggestionsSource);
assert.equal(overlayShapes.get(`${overlayScope} .x-ov-suggestions-container`), 'superellipse(1.25)');
assert.equal(overlayShapes.get(`${overlayScope} .x-ov-close-other-tabs`), undefined);
assert.equal(overlayShapes.get(`${overlayScope} .x-ov-suggestion-item`), 'superellipse(1.25)');
assert.equal(overlayShapes.get(`${overlayScope} .x-ov-action-tag`), 'superellipse(1.25)');
assert.equal(overlayShapes.get(`${overlayScope} .x-ov-suggestion-visit-button`), 'round');
assert.match(
  overlayShellSource,
  /supports\('corner-shape', 'superellipse\(1\.25\)'\)[\s\S]*?'corner-shape',[\s\S]*?'superellipse\(1\.25\)'/
);
// Inline base styles reset the input with `all: unset`, so its shape travels with its overrides.
assert.match(
  overlaySearchPanelSource,
  /containerStyleOverrides:\s*\{[\s\S]*?'border-radius':[^\n]*\n\s*'corner-shape':\s*'superellipse\(1\.25\)'/
);

assert.match(
  sharedSearchInputSource,
  /border-radius:\s*var\(--x-ext-search-input-corners, 28px 28px 0 0\);/
);
assert.match(
  sharedSearchInputReactSource,
  /'border-radius':\s*'var\(--x-ext-search-input-corners,28px 28px 0 0\)'/
);
// The input capsule and its circular icon buttons keep round ends; the mode menu panel does not.
const searchInputShapes = readCornerShapes(sharedSearchInputSource);
assert.equal(searchInputShapes.get('.x-lumno-search-input'), undefined);
assert.equal(searchInputShapes.get('.x-lumno-search-input__container'), undefined);
assert.equal(searchInputShapes.get('.x-lumno-search-input__right-icon'), undefined);
assert.equal(searchInputShapes.get('.x-lumno-search-input__icon[data-search-scope-action="true"]'), undefined);
assert.equal(searchInputShapes.get('.x-lumno-search-input-mode__menu'), 'superellipse(1.25)');
assert.doesNotMatch(sharedSearchInputReactSource, /'corner-shape'/);
// Mode menu parts reset with `all: unset !important`, so their shape must come last and match that priority.
assert.match(
  sharedSearchInputSource,
  /@supports \(corner-shape: superellipse\(1\.25\)\)\s*\{\s*\.x-lumno-search-input-mode__menu-item,\s*\.x-lumno-search-input-mode__menu-footer-key\s*\{\s*corner-shape:\s*superellipse\(1\.25\) !important;\s*\}\s*\}\s*$/
);

assert.match(
  onboardingSource,
  /\.newtab-preview-viewport\s*\{[\s\S]*?--x-nt-search-shell-radius:\s*28px;[\s\S]*?--x-nt-search-content-radius:\s*calc\([\s\S]*?--x-nt-search-result-radius:\s*calc\(/
);
// The demos mirror the real surfaces: overlay panels are continuous, the New Tab capsule is not.
const onboardingShapes = readCornerShapes(onboardingSource);
assert.equal(onboardingShapes.get('.lumno-overlay-panel'), 'superellipse(1.25)');
assert.equal(onboardingShapes.get('.site-search-demo-card'), 'superellipse(1.25)');
assert.equal(onboardingShapes.get('.newtab-preview-viewport #_x_extension_newtab_root_2024_unique_'), undefined);
assert.equal(onboardingShapes.get('.site-search-demo-result'), 'superellipse(1.25)');
assert.equal(
  onboardingShapes.get('.newtab-preview-viewport #_x_extension_newtab_suggestions_surface_2026_unique_'),
  'round round superellipse(1.25) superellipse(1.25)'
);

console.log('Search corner continuity checks passed.');
