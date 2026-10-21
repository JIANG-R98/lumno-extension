const assert = require('assert');
const { readStylesheet } = require('../helpers/css-tokens');
const { parseCss } = require('../helpers/css-rules');
const { createOverlayPage } = require('../helpers/overlay-runtime-harness');
const { createNewtabPage } = require('../helpers/newtab-page');

// The search shell's border colors are defined once, in the shared search
// input stylesheet, and every surface that frames a search box or a menu
// reads them from there in light and dark themes.

const LIGHT = '--x-lumno-search-shell-border-light';
const DARK = '--x-lumno-search-shell-border-dark';

// Every declaration of `property` in a stylesheet: [{ selectors, value }].
function declarations(css, property) {
  return css.entries
    .filter((entry) => entry.style.getPropertyValue(property))
    .map((entry) => ({
      selectors: entry.selectors,
      value: entry.style.getPropertyValue(property).replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim()
    }));
}

function declaredFor(css, property, selectorPattern) {
  const found = declarations(css, property).find((declaration) => declaration.selectors.some((selector) => selectorPattern.test(selector)));
  return found ? found.value : null;
}

function testSharedTokens() {
  const shared = parseCss(readStylesheet('src/shared/search/search-input.css'));
  assert.ok(declarations(shared, LIGHT).length && declarations(shared, DARK).length,
    'the shared search input stylesheet should define the light and dark shell borders');
}

function testNewTabReadsTheSharedTokens() {
  const page = parseCss(readStylesheet('src/newtab/styles/page.css'));
  const light = /^:root$/;
  const dark = /^body\[data-theme="dark"\]/;
  assert.match(declaredFor(page, '--x-nt-search-shell-border', light), new RegExp(`var\\(${LIGHT}`), 'light New Tab search shell');
  assert.match(declaredFor(page, '--x-nt-search-shell-border', dark), new RegExp(`var\\(${DARK}`), 'dark New Tab search shell');
  assert.match(declaredFor(page, '--x-nt-surface-border', light), new RegExp(`var\\(${LIGHT}`), 'light New Tab surfaces');
  assert.match(declaredFor(page, '--x-nt-surface-border', dark), new RegExp(`var\\(${DARK}`), 'dark New Tab surfaces');
  [light, dark].forEach((theme) => {
    assert.strictEqual(declaredFor(page, '--x-extension-select-menu-border', theme), 'var(--x-nt-surface-border)',
      'New Tab select menus should share the surface border');
  });
  assert.match(page.rule('#_x_extension_newtab_root_2024_unique_').get('border'), /var\(--x-nt-search-shell-border\)/,
    'the resting search shell should use the shell border');

  const suggestions = parseCss(readStylesheet('src/newtab/styles/notices-and-suggestions.css'));
  assert.match(suggestions.rule('#_x_extension_newtab_suggestions_outline_2026_unique_').get('border'), /var\(--x-nt-search-shell-border\)/,
    'the expanded search outline should keep the shell border');
  [
    ['src/newtab/styles/bookmark-cascade.css', '.x-nt-bookmark-cascade-level'],
    ['src/newtab/styles/corner-controls.css', '.x-nt-feedback-popover']
  ].forEach(([file, selector]) => {
    assert.match(parseCss(readStylesheet(file)).rule(selector).get('border'), /var\(--x-nt-surface-border\)/,
      `${selector} should use the surface border`);
  });
  const select = parseCss(readStylesheet('src/shared/ui/custom-select.css'));
  assert.ok(select.entries.some((entry) => /var\(\s*--x-extension-select-menu-border\s*,/.test(entry.style.getPropertyValue('border'))),
    'custom select menus should take a page-provided border');
}

function testOnboardingPreview() {
  const preview = parseCss(readStylesheet('src/onboarding/styles/newtab-preview-sections.css'));
  assert.ok(declarations(preview, '--x-ov-border').some((declaration) => declaration.value.startsWith(`var(${LIGHT}`)),
    'the onboarding overlay preview should read the shared light border');
}

async function testOverlayThemesReadTheSharedTokens() {
  for (const [darkSystem, token] of [[false, LIGHT], [true, DARK]]) {
    const page = await createOverlayPage({ darkSystem });
    const root = await page.open();
    const overlay = root.getElementById('_x_extension_overlay_2024_unique_');
    assert.ok(overlay.style.getPropertyValue('--x-ov-border').startsWith(`var(${token}`),
      `the ${darkSystem ? 'dark' : 'light'} overlay should border its shell with the shared token`);
    page.close();
  }
}

async function testNewTabScopeMenuUsesTheSurfaceBorder() {
  const page = await createNewtabPage();
  page.input().focus();
  page.document.querySelector('[data-search-scope-action="true"]')
    .dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await page.settle(80);
  const menu = page.document.querySelector('.x-lumno-search-input-mode__menu');
  assert.match(menu.style.getPropertyValue('border'), /var\(--x-nt-surface-border/, 'the New Tab scope panel should use the surface border');
  page.close();
}

(async () => {
  testSharedTokens();
  testNewTabReadsTheSharedTokens();
  testOnboardingPreview();
  await testOverlayThemesReadTheSharedTokens();
  await testNewTabScopeMenuUsesTheSurfaceBorder();
  console.log('search shell border token tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
