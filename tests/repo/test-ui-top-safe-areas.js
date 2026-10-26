const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { parseCss, parsePageCss } = require('../helpers/css-rules');
const { bundleScript } = require('../helpers/module-script');
const { createNewtabPage } = require('../helpers/newtab-page');
const { openSearchSurface } = require('../helpers/search-surfaces');
const { createTabSwitcherPage, switcherTabs } = require('../helpers/tab-switcher-page');

// Every surface keeps clear of the device's safe areas and, where it can
// move, of the visual viewport's top inset. (Tab switcher centering on a
// shifted visual viewport is in tests/overlay/test-tab-switcher-runtime.js.)

const newtabCss = parsePageCss('newtab.html');
const optionsCss = parsePageCss('src/options/options.html');
const onboardingCss = parsePageCss('src/onboarding/onboarding.html');
const shortcutDialogCss = parseCss(fs.readFileSync('src/newtab/shortcuts/shortcut-dialog.css', 'utf8'));
const flat = (value) => String(value || '').replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();

function rule(css, selector, condition) {
  const found = css.rule(selector, condition);
  assert.ok(found, `missing ${selector}`);
  return found;
}

function testStyles() {
  const root = newtabCss.entries.find((entry) => entry.style.getPropertyValue('--x-nt-top-safe-inset'));
  assert.ok(root, 'newtab should define the shared top inset token');
  assert.strictEqual(flat(root.style.getPropertyValue('--x-nt-visual-viewport-top-inset')), '0px');
  assert.match(flat(root.style.getPropertyValue('--x-nt-top-safe-inset')), /^max\(env\(safe-area-inset-top\), var\(--x-nt-visual-viewport-top-inset, 0px\)\)$/,
    'newtab should combine device and visual viewport top insets in one shared token');
  assert.strictEqual(flat(root.style.getPropertyValue('--x-nt-top-occupied-inset')), 'var(--x-nt-top-safe-inset)');
  assert.ok(newtabCss.entries.some((entry) => entry.selectors.includes('body[data-nt-top-occupied="true"]') &&
    /36px \+ var\(--x-nt-top-safe-inset\)/.test(entry.style.cssText)), 'newtab should reserve both the top bookmark bar and the viewport safe area');
  assert.strictEqual(rule(newtabCss, 'body:not([data-nt-ready="1"]) #_x_extension_newtab_bottom_dock_2024_unique_').get('visibility'), 'hidden',
    'newtab should not flash the bottom dock before the stored layout mode is restored');
  const topbar = rule(newtabCss, '.x-nt-bookmarks-topbar');
  assert.deepStrictEqual([topbar.get('position'), topbar.get('top')], ['absolute', 'env(safe-area-inset-top)'],
    'the top bookmark bar should stay in page coordinates while clearing the device safe area');
  assert.ok(!topbar.names().some((name) => /--x-nt-visual-viewport-top-inset|--x-nt-top-safe-inset/.test(topbar.get(name)) ||
    name === 'zoom' || (name === 'transform' && /scale/.test(topbar.get(name)))),
  'the top bookmark bar should not independently follow or scale with the visual viewport');
  const panel = rule(newtabCss, '.x-nt-wallpaper-panel');
  assert.deepStrictEqual([panel.get('max-height'), panel.get('overflow')], ['calc(100dvh - 76px - var(--x-nt-top-bar-max-inset))', 'hidden'],
    'the appearance panel should stay below the top bar however it shows');
  const scroll = rule(newtabCss, '.x-nt-wallpaper-panel-scroll');
  assert.deepStrictEqual([scroll.get('overflow'), scroll.get('overscroll-behavior')], ['hidden auto', 'contain'],
    'and contain scrolling inside its body');
  const header = rule(newtabCss, '.x-nt-appearance-header');
  assert.deepStrictEqual(['flex', 'position', 'z-index', 'background'].map((name) => header.get(name)), ['0 0 auto', 'relative', '6', 'var(--x-nt-panel-surface)'],
    'the appearance heading should remain outside the panel scroll body');
  assert.match(rule(newtabCss, '.x-nt-feedback-control[data-detail-open="true"] .x-nt-feedback-popover').get('height'),
    /calc\(100dvh - 84px - var\(--x-nt-top-occupied-inset, 0px\)\)/, 'feedback details should not grow underneath occupied top UI');
  assert.ok(rule(shortcutDialogCss, '.x-nt-shortcut-dialog-backdrop').names().some((name) =>
    /var\(--x-nt-top-occupied-inset, 0px\)/.test(rule(shortcutDialogCss, '.x-nt-shortcut-dialog-backdrop').get(name))));
  const dialog = rule(shortcutDialogCss, '.x-nt-shortcut-dialog');
  assert.ok(/var\(--x-nt-top-occupied-inset, 0px\)/.test(dialog.get('max-height')) && dialog.get('overflow') === 'hidden auto' &&
    dialog.get('overscroll-behavior') === 'contain', 'shortcut dialogs should remain scrollable inside the unobscured viewport');

  const optionsRoot = optionsCss.entries.find((entry) => /env\(safe-area-inset-top\)/.test(entry.style.getPropertyValue('padding-top')) &&
    entry.style.getPropertyValue('padding-bottom'));
  assert.ok(optionsRoot && flat(optionsRoot.style.getPropertyValue('padding-right')) === 'max(20px, env(safe-area-inset-right))' &&
    flat(optionsRoot.style.getPropertyValue('padding-bottom')) === 'max(40px, env(safe-area-inset-bottom))', 'options content should clear device safe areas');
  assert.strictEqual(rule(optionsCss, '._x_extension_toast_2024_unique_').get('--x-lumno-toast-top'), 'max(24px, calc(env(safe-area-inset-top) + 12px))',
    'options toasts should stay below the top safe area');
  const mask = rule(optionsCss, '._x_extension_confirm_mask_2024_unique_');
  assert.ok(mask.names().some((name) => /env\(safe-area-inset-top\)/.test(mask.get(name))) && mask.get('overflow') === 'auto' &&
    mask.get('overscroll-behavior') === 'contain', 'options dialogs should scroll inside safe-area-aware masks');
  assert.match(rule(optionsCss, '._x_extension_confirm_dialog_2024_unique_').get('max-height'), /^calc\(100dvh/);

  // Every responsive tier keeps the safe padding.
  const copyPanels = onboardingCss.entries.filter((entry) => entry.selectors.includes('.copy-panel') && entry.style.getPropertyValue('padding'));
  assert.ok(copyPanels.length > 0, 'onboarding should pad its copy panel');
  copyPanels.forEach((entry) => {
    const padding = flat(entry.style.getPropertyValue('padding'));
    assert.ok(padding.includes('max(var(--onboarding-copy-padding-y), calc(env(safe-area-inset-top) + 12px))') &&
      padding.includes('max(var(--onboarding-copy-padding-y), calc(env(safe-area-inset-bottom) + 12px))'),
    `onboarding copy and actions should keep safe padding in every responsive tier: ${padding}`);
  });
}

// A visual viewport that counts the listeners on it.
function createVisualViewport(window, values) {
  const viewport = Object.assign(new window.EventTarget(), { offsetLeft: 0, offsetTop: 0, width: 1024, height: 640, scale: 1 }, values || {});
  const listening = { resize: 0, scroll: 0 };
  const add = viewport.addEventListener.bind(viewport);
  const remove = viewport.removeEventListener.bind(viewport);
  viewport.addEventListener = (type, ...rest) => { listening[type] = (listening[type] || 0) + 1; return add(type, ...rest); };
  viewport.removeEventListener = (type, ...rest) => { listening[type] = (listening[type] || 0) - 1; return remove(type, ...rest); };
  viewport.listening = listening;
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  return viewport;
}

// New Tab follows the visual viewport's top inset when it resizes or
// scrolls (but not a pinch zoom's), and keeps the appearance heading above one shared scroller.
async function testNewTab() {
  let viewport = null;
  const page = await createNewtabPage({ setup(window) { viewport = createVisualViewport(window, { offsetTop: 0 }); } });
  await page.settle(300);
  const inset = () => page.document.documentElement.style.getPropertyValue('--x-nt-visual-viewport-top-inset');
  viewport.offsetTop = 30;
  viewport.dispatchEvent(new page.window.Event('resize'));
  await page.settle(50);
  assert.strictEqual(inset(), '30px', 'newtab should resync the safe-area token when the visual viewport resizes');
  viewport.offsetTop = 12;
  viewport.dispatchEvent(new page.window.Event('scroll'));
  await page.settle(50);
  assert.strictEqual(inset(), '12px', 'and when it scrolls');
  viewport.scale = 2;
  viewport.offsetTop = 200;
  viewport.dispatchEvent(new page.window.Event('resize'));
  await page.settle(50);
  assert.strictEqual(inset(), '0px', 'a pinch zoom should zoom the page as is, not re-fit layers to the zoomed-in view');
  viewport.scale = 1;

  page.click(page.document.querySelector('.x-nt-wallpaper-button'));
  await page.settle(400);
  const panel = page.document.querySelector('.x-nt-wallpaper-panel');
  const children = Array.from(panel.children).map((child) => child.className.split(' ')[0]);
  assert.ok(children.indexOf('x-nt-appearance-header') >= 0 && children.indexOf('x-nt-appearance-header') < children.indexOf('x-nt-wallpaper-panel-scroll'),
    `the appearance heading should sit above the panel's content scroller: ${children}`);
  const scroller = panel.querySelector(':scope > .x-nt-wallpaper-panel-scroll');
  assert.ok(scroller.querySelector('.x-nt-appearance-section') === scroller.querySelector('section, [class*="-section"]'),
    'the first section inside the scroller should be the appearance (theme) section');
  page.close();
}

// The overlay tracks visual viewport resizes and scrolls while it is open.
async function testOverlayTracksTheVisualViewport() {
  let viewport = null;
  const surface = await openSearchSurface('overlay', { setup(window) { viewport = createVisualViewport(window); } });
  await surface.settle(100);
  assert.ok(viewport.listening.resize > 0 && viewport.listening.scroll > 0, 'overlay placement should track both visual viewport events');
  surface.press('Escape');
  await surface.settle(400);
  assert.deepStrictEqual(viewport.listening, { resize: 0, scroll: 0 }, 'overlay placement should clean up both visual viewport events');
  surface.close();
}

async function testTabSwitcherCleansUp() {
  const page = createTabSwitcherPage();
  const viewport = page.window.visualViewport;
  const listening = { resize: 0, scroll: 0 };
  ['addEventListener', 'removeEventListener'].forEach((method) => {
    const original = viewport[method].bind(viewport);
    viewport[method] = (type, ...rest) => {
      listening[type] = (listening[type] || 0) + (method === 'addEventListener' ? 1 : -1);
      return original(type, ...rest);
    };
  });
  page.open({ tabs: switcherTabs(4) });
  await page.settle(50);
  assert.ok(listening.resize > 0 && listening.scroll > 0, 'the tab switcher should track visual viewport events');
  page.press('Escape');
  await page.settle(300);
  assert.deepStrictEqual(listening, { resize: 0, scroll: 0 }, 'the tab switcher should clean up visual viewport events');
  page.close();
}

// The toast the content script draws on web pages clears the page's safe area.
async function testPageToast() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://page.example/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const shadows = [];
  const attach = window.Element.prototype.attachShadow;
  window.Element.prototype.attachShadow = function(init) {
    const shadow = attach.call(this, init);
    shadows.push(shadow);
    return shadow;
  };
  const listeners = [];
  const area = { get(keys, callback) { setTimeout(() => callback({}), 0); } };
  window.chrome = {
    runtime: {
      lastError: null,
      getURL: (resource) => `chrome-extension://lumno/${resource}`,
      sendMessage(message, callback) { if (typeof callback === 'function') setTimeout(() => callback(undefined), 0); },
      onMessage: { addListener(listener) { listeners.push(listener); }, removeListener() {} }
    },
    storage: { sync: area, local: area, onChanged: { addListener() {} } },
    i18n: { getMessage: () => '', getUILanguage: () => 'en' }
  };
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } });
  window.eval(bundleScript('copy-url-listener'));
  await new Promise((resolve) => setTimeout(resolve, 10));
  await new Promise((resolve) => listeners.forEach((listener) => listener({ action: 'copyCurrentPageUrlFromCommand' }, {}, resolve)));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const styles = shadows.flatMap((shadow) => Array.from(shadow.querySelectorAll('style'))).map((style) => style.textContent).join('\n');
  const toast = parseCss(styles).rule('.toast');
  assert.deepStrictEqual(toast && [toast.get('position'), toast.get('top')], ['fixed', 'max(24px, calc(env(safe-area-inset-top) + 12px))'],
    'page-injected toasts should clear the host page safe area');
  window.close();
}

(async () => {
  testStyles();
  await testNewTab();
  await testOverlayTracksTheVisualViewport();
  await testTabSwitcherCleansUp();
  await testPageToast();
  console.log('UI top safe-area tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
