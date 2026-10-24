const assert = require('assert');
const shortcutFavicon = require('../../src/domain/favicon/shortcut-favicon.ts');
const { readStylesheet } = require('../helpers/css-tokens');
const { parseCss, parsePageCss } = require('../helpers/css-rules');
const { openSearchSurface } = require('../helpers/search-surfaces');

// The search icon at the start of the New Tab search box opens the scope
// panel, like the overlay's (test-overlay-search-scope-button.js), and shares
// a cursor-following bubble with the settings icon at the other end.

// Bundled provider tiles load directly; remote icons go through favicon data.
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

const ICON = '[data-search-scope-action="true"]';
const TOOLTIP = '#_x_extension_newtab_search_input_cursor_tooltip_2026_unique_';

async function testIcon() {
  const surface = await openSearchSurface('newtab');
  const { page } = surface;
  const icon = surface.root.querySelector(ICON);
  assert.deepStrictEqual([icon.getAttribute('role'), icon.getAttribute('tabindex'), icon.getAttribute('aria-disabled')], ['button', '0', 'false'],
    'the icon should be a focusable button');
  assert.ok(icon.getAttribute('data-tooltip'), 'it should explain itself');

  await surface.type('cats');
  icon.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await surface.waitFor(() => surface.scopeMenuOpen(), 'clicking the icon should open the scope panel');
  assert.strictEqual(surface.input().value, 'cats', 'and keep the typed query');
  assert.ok(surface.scopeLabel(), 'the default scope should become the active tag');
  assert.deepStrictEqual([icon.getAttribute('aria-disabled'), icon.getAttribute('tabindex'), icon.getAttribute('data-tooltip')], ['true', '-1', null],
    'with a scope tag active the icon should step out of pointer, keyboard and tooltip use');
  surface.press('Escape');
  await surface.settle(60);
  icon.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await surface.settle(60);
  assert.strictEqual(surface.scopeMenuOpen(), false, 'a disabled icon should not reopen the panel');
  surface.close();

  for (const key of ['Enter', ' ']) {
    const keyboard = await openSearchSurface('newtab');
    const button = keyboard.root.querySelector(ICON);
    button.focus();
    const event = keyboard.press(key, { target: button });
    await keyboard.waitFor(() => keyboard.scopeMenuOpen(), `${JSON.stringify(key)} on the focused icon should open the scope panel`);
    assert.strictEqual(keyboard.input().value, '', `${JSON.stringify(key)} should not be typed into the search box`);
    assert.strictEqual(event.defaultPrevented, true);
    assert.strictEqual(keyboard.navigation(), null, 'nor start a search');
    keyboard.close();
  }
}

async function testSharedBubble() {
  const surface = await openSearchSurface('newtab');
  const { page } = surface;
  const icon = surface.root.querySelector(ICON);
  const settings = surface.root.querySelector('.x-lumno-search-input__right-icon');
  assert.ok(settings.getAttribute('data-tooltip'), 'the settings icon should explain itself');
  await page.hover(icon, { clientX: 20, clientY: 40 });
  await page.settle(200);
  const bubble = () => page.document.querySelector(TOOLTIP);
  assert.ok(bubble() && bubble().textContent.trim() === icon.getAttribute('data-tooltip'), 'hovering the search icon should show its bubble');
  icon.dispatchEvent(new page.window.MouseEvent('pointerleave', { relatedTarget: settings, clientX: 600, clientY: 40 }));
  icon.dispatchEvent(new page.window.MouseEvent('mouseleave', { relatedTarget: settings, clientX: 600, clientY: 40 }));
  await page.hover(settings, { clientX: 600, clientY: 40 });
  await page.settle(200);
  assert.strictEqual(bubble().textContent.trim(), settings.getAttribute('data-tooltip'), 'moving to the settings icon should hand the same bubble over');
  assert.match(settings.style.getPropertyValue('--x-ext-input-icon-hover-bg'), /var\(--x-nt-settings-action-hover-bg/,
    'the settings icon should take New Tab\'s hover colours');
  surface.close();

  const overlay = await openSearchSurface('overlay');
  const overlaySettings = overlay.root.querySelector('.x-lumno-search-input__right-icon');
  assert.doesNotMatch(overlaySettings.getAttribute('style') || '', /--x-nt-settings-action-hover/, 'New Tab\'s hover colours should not reach the overlay');
  overlay.close();
}

function testStyles() {
  const page = parsePageCss('newtab.html');
  [':root', 'body[data-theme="dark"]'].forEach((theme) => {
    const declared = page.entries.filter((entry) => entry.selectors.includes(theme));
    assert.ok(declared.some((entry) => entry.style.getPropertyValue('--x-nt-settings-action-hover-bg') && entry.style.getPropertyValue('--x-nt-settings-action-hover-color')),
      `${theme} should define the settings action hover colours`);
  });
  const input = parseCss(readStylesheet('src/shared/search/search-input.css'));
  const action = input.rule('.x-lumno-search-input__icon[data-search-scope-action="true"]');
  assert.deepStrictEqual([action.get('width'), action.get('height'), action.get('cursor')], ['30px', '30px', 'pointer'],
    'the search action should have the settings action\'s hit target');
  const disabled = input.rule('.x-lumno-search-input__icon[data-search-scope-action="true"][aria-disabled="true"]');
  assert.deepStrictEqual([disabled.get('pointer-events'), disabled.get('cursor')], ['none', 'default'], 'a disabled icon should not react');
  const hover = input.rule('.x-lumno-search-input__icon[data-search-scope-action="true"][data-hover-active="true"]');
  assert.match(hover.names().map((name) => hover.get(name)).join(' '), /--x-ext-input-icon-hover-bg[\s\S]*--x-ext-input-icon-hover|--x-ext-input-icon-hover[\s\S]*--x-ext-input-icon-hover-bg/,
    'it should reuse the settings hover colours');
  assert.strictEqual(input.rule('.x-lumno-search-input__icon[data-search-scope-action="true"][data-hover-active="true"] .ri-icon').get('transform'), 'scale(1.06)');
}

(async () => {
  await testIcon();
  await testSharedBubble();
  testStyles();
  console.log('New Tab search scope button tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
