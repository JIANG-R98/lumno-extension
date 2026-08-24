const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const newtabSource = read('newtab.html');
const onboardingSource = read('src/onboarding/onboarding.html');
const overlayShellSource = read('react-src/overlay/shell.tsx');
const overlaySearchPanelSource = read('src/overlay/search-panel.js');
const overlaySuggestionsSource = read('src/overlay/suggestions-view.css');
const sharedSearchInputSource = read('src/shared/search-input.css');
const sharedSearchInputReactSource = read('react-src/shared/search-input.tsx');

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
assert.match(
  newtabSource,
  /@supports \(corner-shape: superellipse\(1\.25\)\)\s*\{[\s\S]*?#_x_extension_newtab_root_2024_unique_[\s\S]*?#_x_extension_newtab_search_layer_2024_unique_[\s\S]*?#_x_extension_newtab_suggestions_container_2024_unique_[\s\S]*?\.x-nt-suggestion-item[\s\S]*?corner-shape:\s*superellipse\(1\.25\);/
);

const overlayOuterRadius = readPxToken(overlayShellSource, '--x-ov-panel-radius');
const overlayBorderWidth = readPxToken(overlaySuggestionsSource, '--x-ov-panel-border-width');
const overlayResultInset = readPxToken(overlaySuggestionsSource, '--x-ov-results-inset');

assert.equal(overlayOuterRadius - overlayBorderWidth, 27);
assert.equal(overlayOuterRadius - overlayBorderWidth - overlayResultInset, 15);
assert.match(
  overlaySuggestionsSource,
  /--x-ov-content-radius:\s*calc\(var\(--x-ov-panel-radius, 28px\) - var\(--x-ov-panel-border-width\)\);/
);
assert.match(
  overlaySuggestionsSource,
  /--x-ov-result-radius:\s*calc\(var\(--x-ov-content-radius\) - var\(--x-ov-results-inset\)\);/
);
assert.match(
  overlaySearchPanelSource,
  /var\(--x-ov-content-radius, 27px\) var\(--x-ov-content-radius, 27px\) 0 0/
);
assert.match(
  overlaySuggestionsSource,
  /\.x-ov-suggestion-item\s*\{[\s\S]*?border-radius:\s*var\(--x-ov-result-radius,\s*15px\);/
);
assert.match(
  overlaySuggestionsSource,
  /@supports \(corner-shape: superellipse\(1\.25\)\)\s*\{[\s\S]*?\.x-ov-suggestions-container[\s\S]*?\.x-ov-suggestion-item[\s\S]*?corner-shape:\s*superellipse\(1\.25\);/
);
assert.match(
  overlayShellSource,
  /supports\('corner-shape', 'superellipse\(1\.25\)'\)[\s\S]*?'corner-shape',[\s\S]*?'superellipse\(1\.25\)'/
);

assert.match(
  sharedSearchInputSource,
  /border-radius:\s*var\(--x-ext-search-input-corners, 28px 28px 0 0\);/
);
assert.match(
  sharedSearchInputReactSource,
  /'border-radius':\s*'var\(--x-ext-search-input-corners,28px 28px 0 0\)'/
);
assert.match(
  sharedSearchInputSource,
  /@supports \(corner-shape: superellipse\(1\.25\)\)\s*\{[\s\S]*?\.x-lumno-search-input,[\s\S]*?\.x-lumno-search-input__container[\s\S]*?corner-shape:\s*superellipse\(1\.25\);/
);

assert.match(
  onboardingSource,
  /\.newtab-preview-viewport\s*\{[\s\S]*?--x-nt-search-shell-radius:\s*28px;[\s\S]*?--x-nt-search-content-radius:\s*calc\([\s\S]*?--x-nt-search-result-radius:\s*calc\(/
);
assert.match(
  onboardingSource,
  /@supports \(corner-shape: superellipse\(1\.25\)\)\s*\{[\s\S]*?\.site-search-demo-card,[\s\S]*?\.site-search-demo-result,[\s\S]*?\.lumno-overlay-panel\s*\{\s*corner-shape:\s*superellipse\(1\.25\);/
);

console.log('Search corner continuity checks passed.');
