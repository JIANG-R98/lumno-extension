const assert = require('assert');
const fs = require('fs');
const { parseCss } = require('../helpers/css-rules');
const { createOverlayPage, bundledSiteSearchProviders } = require('../helpers/overlay-runtime-harness');

// The search icon at the start of the real overlay's input opens the search
// scope menu, by pointer or keyboard, and steps aside while a scope tag is
// active. The current-label slot itself is covered by
// src/shared/react/search-input-mode.test.ts.

async function openOverlay() {
  const page = await createOverlayPage({ stylesheetsLoad: true });
  const root = await page.open({ siteSearchProviders: bundledSiteSearchProviders() });
  const icon = root.querySelector('[data-search-scope-action="true"]');
  const menuOpen = () => root.querySelector('[data-search-input-mode-prefix]').getAttribute('data-menu-open') === 'true';
  return { page, root, icon, menuOpen };
}

async function testIconOpensTheScopeMenu() {
  const { page, icon, menuOpen } = await openOverlay();
  assert.ok(icon, 'the overlay input should start with a search scope action');
  assert.deepStrictEqual(
    [icon.getAttribute('role'), icon.getAttribute('tabindex'), icon.getAttribute('aria-disabled'), icon.style.left],
    ['button', '0', 'false', '13px'],
    'the action should be a focusable button aligned with the settings action'
  );
  assert.ok(icon.getAttribute('data-tooltip'), 'the action should explain itself in a Tooltip');

  await page.type('cats');
  icon.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await page.waitFor(menuOpen, 'clicking the icon should open the scope menu');
  assert.strictEqual(page.input().value, 'cats', 'a typed query should be kept');
  assert.deepStrictEqual([icon.getAttribute('aria-disabled'), icon.getAttribute('tabindex'), icon.getAttribute('data-tooltip')], ['true', '-1', null],
    'with a scope tag active the icon should leave pointer, keyboard and Tooltip interaction');

  page.press('Escape');
  await page.settle(50);
  icon.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await page.settle(50);
  assert.strictEqual(menuOpen(), false, 'a disabled icon should not reopen the menu');
  page.close();
}

async function testKeyboardActivation() {
  const { page, icon, menuOpen } = await openOverlay();
  icon.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
  await page.settle(50);
  assert.strictEqual(menuOpen(), false, 'other keys should not activate the icon');
  icon.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await page.waitFor(menuOpen, 'Enter on the icon should open the scope menu');
  page.close();

  const space = await openOverlay();
  space.icon.dispatchEvent(new space.page.window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
  await space.page.waitFor(space.menuOpen, 'Space on the icon should open the scope menu');
  space.page.close();
}

function testHoverUsesTheSharedTokens() {
  const css = parseCss(fs.readFileSync('src/shared/search/search-input.css', 'utf8'));
  const hover = css.entries.find((entry) => entry.selectors.some((selector) =>
    selector.includes('.x-lumno-search-input__icon[data-search-scope-action="true"][data-hover-active="true"]')));
  assert.ok(hover, 'the scope action should have a hover state');
  assert.match(hover.style.getPropertyValue('background') || hover.style.getPropertyValue('background-color'), /var\(--x-ext-input-icon-hover-bg/,
    'both search surfaces should share the settings action hover tokens');
}

(async () => {
  await testIconOpensTheScopeMenu();
  await testKeyboardActivation();
  testHoverUsesTheSharedTokens();
  console.log('overlay search scope button tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
