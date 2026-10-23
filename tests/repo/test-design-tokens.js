const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { parseCss } = require('../helpers/css-rules');
const { createNewtabPage } = require('../helpers/newtab-page');
const { createOptionsPage } = require('../helpers/options-page');
const { readLightTokens, readStylesheetSource } = require('../helpers/css-tokens');

// Stylesheets split into parts read as the joined parts.
const read = (file) => (file.endsWith('.css') ? readStylesheetSource(file) : fs.readFileSync(file, 'utf8'));
const pages = {
  'newtab.html': read('newtab.html'),
  'src/options/options.html': read('src/options/options.html'),
  'src/onboarding/onboarding.html': read('src/onboarding/onboarding.html')
};

// Tokens load before any stylesheet that reads them (only font and icon CSS may precede).
Object.entries(pages).forEach(([file, html]) => {
  const sheets = Array.from(new JSDOM(html).window.document.querySelectorAll('link[rel="stylesheet"]'), (link) => link.getAttribute('href'));
  const tokensIndex = sheets.indexOf('../shared/tokens.css');
  assert.ok(tokensIndex >= 0, `${file} should load the shared tokens`);
  sheets.slice(0, tokensIndex).forEach((href) => {
    assert.match(href, /^\.\.\/\.\.\/assets\//, `${file} should load ${href} after tokens.css`);
  });
});

// Every token a stylesheet references must exist.
const tokens = readLightTokens();
const stylesheets = [
  ...fs.readdirSync('src/shared').filter((f) => f.endsWith('.css')).map((f) => `src/shared/${f}`),
  'src/options/options.css', 'src/options/webdav-options.css', 'src/newtab/newtab.css',
  'src/newtab/shortcuts/shortcut-dialog.css', 'src/newtab/bookmarks/folder-color-picker.css',
  'src/newtab/remote-content.css', 'src/onboarding/onboarding.css', 'src/overlay/suggestions-view.css'
];
stylesheets.forEach((file) => {
  for (const match of read(file).matchAll(/var\((--lumno-[\w-]+)/g)) {
    assert.ok(tokens.has(match[1]), `${file} references unknown token ${match[1]}`);
  }
});

// Stylesheets injected into web pages have no tokens there, so each reference needs a fallback.
[
  'src/shared/ui/tooltip.css', 'src/shared/ui/menu-surface.css', 'src/shared/ui/toast.css',
  'src/shared/search/search-input.css', 'src/shared/ui/feature-hints.css', 'src/shared/ui/cursor-tooltip.css',
  'src/shared/ui/external-link-icon.css', 'src/overlay/suggestions-view.css'
].forEach((file) => {
  const bare = read(file).match(/var\(--lumno-[\w-]+\)/g) || [];
  assert.deepStrictEqual(bare, [], `${file} is injected into web pages; give every token a fallback`);
});

// Every page loads tokens.css first, so its page-wide rules reach every component:
// reduced motion drops transitions and finishes animations at once (they still end,
// so animationend fires), and keyboard focus always shows a ring.
const tokensCss = parseCss(read('src/shared/tokens.css'));
const reducedMotion = tokensCss.entries.filter((entry) => entry.conditions.some((text) => /prefers-reduced-motion:\s*reduce/.test(text)) &&
  entry.selectors.includes('*'));
assert.ok(reducedMotion.length > 0, 'tokens.css should hold the page-wide reduced-motion rule');
const declared = (name) => reducedMotion.map((entry) => [entry.style.getPropertyValue(name), entry.style.getPropertyPriority(name)]).find(([value]) => value);
assert.deepStrictEqual(declared('animation-duration'), ['0.01ms', 'important'], 'reduced motion should finish every animation at once without removing it');
assert.deepStrictEqual(declared('transition-duration'), ['0s', 'important'], 'reduced motion should drop every transition');
assert.ok(tokensCss.entries.some((entry) => entry.conditions.length === 0 && entry.selectors.some((selector) => /^:where\(button, a\[href\].*:focus-visible$/.test(selector)) &&
  entry.style.getPropertyValue('outline').trim() === '2px solid var(--lumno-color-focus-ring)'), 'tokens.css should give every control the shared focus ring');

// Shared components are defined once; pages only resize them.
const optionsCss = read('src/options/options.css');
const newtabCss = read('src/newtab/newtab.css');
[optionsCss, newtabCss].forEach((css) => {
  assert.doesNotMatch(css, /--switch-track-on-bg|--switch-knob-shadow|switch-slider[^{]*::before\s*\{/,
    'switch colors and knob rules belong to src/shared/ui/switch.css');
  assert.doesNotMatch(css, /^(?:\._x_extension_theme_check_2026_unique_|\.x-nt-appearance-check)\s*\{[^}]*linear-gradient/m,
    'theme card check badges belong to src/shared/ui/choice-card.css');
});
assert.doesNotMatch(optionsCss, /^\._x_extension_toast_2024_unique_ \{[^}]*background:/m,
  'the Options toast uses src/shared/ui/toast.css');

// One indicator implementation: each page's React entry gives its page
// modules the shared segmented indicator.
(async () => {
  for (const [name, open] of [['Options', () => createOptionsPage({})], ['New Tab', () => createNewtabPage({})]]) {
    const page = await open();
    await page.settle(200);
    const api = page.window.LumnoSegmentedIndicator;
    assert.ok(api && ['apply', 'measure', 'sync'].every((name) => typeof api[name] === 'function'),
      `${name} should expose the shared segmented indicator to the page modules`);
    page.close();
  }
  console.log('design token tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
