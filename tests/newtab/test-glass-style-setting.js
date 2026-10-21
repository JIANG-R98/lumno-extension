const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const postcss = require('postcss');
const settings = require('../../src/shared/settings.js');

const key = settings.NEWTAB_GLASS_STYLE_STORAGE_KEY;
const themeKey = settings.NEWTAB_GLASS_THEME_STORAGE_KEY;
assert(settings.CHROME_SYNC_STORAGE_KEYS.includes(key));
assert(settings.CHROME_SYNC_STORAGE_KEYS.includes(themeKey));
assert.deepStrictEqual(Array.from(settings.NEWTAB_GLASS_THEMES), ['follow', 'light', 'dark']);
for (const value of [undefined, null, 'system', 'Light', 1]) {
  assert.strictEqual(settings.normalizeNewtabGlassTheme(value), 'follow');
}
// Only a glass material set to light or dark holds the page's theme.
assert.strictEqual(settings.getNewtabGlassThemeOverride('none', 'dark'), '');
assert.strictEqual(settings.getNewtabGlassThemeOverride('liquid', 'follow'), '');
assert.strictEqual(settings.getNewtabGlassThemeOverride('liquid', undefined), '');
assert.strictEqual(settings.getNewtabGlassThemeOverride('frosted', 'light'), 'light');
assert.strictEqual(settings.getNewtabGlassThemeOverride('liquid', 'dark'), 'dark');
assert.deepStrictEqual(Array.from(settings.NEWTAB_GLASS_STYLES), ['none', 'frosted', 'liquid']);
for (const value of [undefined, null, false, true, 'Frosted', 'glass', 1, {}]) {
  assert.strictEqual(settings.normalizeNewtabGlassStyle(value), 'none');
}
for (const value of ['none', 'frosted', 'liquid']) {
  assert.strictEqual(settings.normalizeNewtabGlassStyle(value), value);
}

// The glass functions live in theme/glass-surfaces.js, one factory level deeper.
const source = fs.readFileSync('src/newtab/theme/glass-surfaces.js', 'utf8').replace(/^  /gm, '');
const start = source.indexOf('  // Surfaces whose rim bends the wallpaper under the liquid style;');
const end = source.indexOf('\n  return {', start);
assert(start >= 0 && end > start);
// The storage listeners live in settings-sync.js, one factory level deeper.
const syncSource = fs.readFileSync('src/newtab/settings-sync.js', 'utf8').replace(/^  /gm, '');
const handlerStart = syncSource.indexOf('  storageChanges.on(NEWTAB_GLASS_STYLE_STORAGE_KEY,');
const handlerEnd = syncSource.indexOf('  storageChanges.on(NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY,', handlerStart);
assert(handlerStart >= 0 && handlerEnd > handlerStart);

async function boot(value, hasStorage = true, themeValue) {
  const attributes = {};
  const surfaces = { created: 0, destroyed: 0, selector: '' };
  const listeners = {};
  const pageState = { newtabGlassTheme: 'follow', glassThemeOverride: '', initialThemeApplied: true };
  const themeApplies = [];
  const context = vm.createContext({
    pageState,
    applyScopedThemeMode() { themeApplies.push(pageState.glassThemeOverride); },
    NEWTAB_GLASS_THEME_STORAGE_KEY: themeKey,
    SETTINGS: settings,
    updateWallpaperAppearanceSelectionUi() {},
    scheduleWallpaperAdaptiveToneUpdate() {},
    syncBookmarkTopbarSurfaceAppearance() {},
    MutationObserver: class { observe() {} disconnect() {} },
    NEWTAB_GLASS_STYLE_STORAGE_KEY: key,
    window: {},
    document: { body: {
      getAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null; },
      hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name); },
      setAttribute(name, next) { attributes[name] = next; },
      removeAttribute(name) { delete attributes[name]; }
    } },
    globalThis: { LumnoNewtabLiquidSurfaces: { create(options) {
      surfaces.created += 1;
      surfaces.selector = options.selector;
      assert.strictEqual(options.property, '--x-nt-glass-refraction');
      return { destroy() { surfaces.destroyed += 1; }, refresh() {} };
    } } },
    storageArea: hasStorage ? {
      get(keys, callback) {
        assert.deepStrictEqual(Array.from(keys), [key, themeKey]);
        callback({ [key]: value, [themeKey]: themeValue });
      }
    } : null,
    storageChanges: { on(storageKey, callback) {
      assert([key, themeKey].includes(storageKey));
      listeners[storageKey] = callback;
    } }
  });
  vm.runInContext(source.slice(start, end) + syncSource.slice(handlerStart, handlerEnd), context);
  await vm.runInContext('loadNewtabGlassStyle()', context);
  return {
    style: () => attributes['data-glass-style'],
    attributes,
    pageState,
    themeApplies,
    surfaces,
    change(next) { listeners[key]({ [key]: { newValue: next } }); },
    changeTheme(next) { listeners[themeKey]({ [themeKey]: { newValue: next } }); }
  };
}

async function main() {
  const fresh = await boot(undefined);
  assert.strictEqual(fresh.style(), undefined, 'new installations keep the original surfaces');
  assert.strictEqual(fresh.surfaces.created, 0);
  const frosted = await boot('frosted');
  assert.strictEqual(frosted.style(), 'frosted', 'a saved choice applies during startup');
  assert.strictEqual(frosted.surfaces.created, 0, 'frosted glass needs no refraction maps');
  frosted.change('liquid');
  assert.strictEqual(frosted.style(), 'liquid', 'a synchronized choice applies live');
  assert.strictEqual(frosted.surfaces.created, 1, 'liquid glass starts the rim refraction');
  // The search stack and the dock's cards bend; menus and the panel, on layers of their own,
  // sometimes show their lens's map in Chrome 155. The bookmarks bar keeps its own glass.
  assert(frosted.surfaces.selector.includes('#_x_extension_newtab_suggestions_surface_2026_unique_'));
  assert(frosted.surfaces.selector.includes('.x-nt-recent-card-visual'));
  assert(frosted.surfaces.selector.includes(':not(.x-nt-bookmarks-topbar .x-nt-bookmark-card)'));
  assert(!frosted.surfaces.selector.includes('_x_extension_menu_surface_2024_unique_'));
  frosted.change('liquid');
  assert.strictEqual(frosted.surfaces.created, 1, 'staying on liquid keeps the same maps');
  frosted.change('none');
  assert.strictEqual(frosted.style(), undefined, 'switching back restores the original surfaces');
  assert.strictEqual(frosted.surfaces.destroyed, 1, 'leaving liquid drops its maps');
  frosted.change('glass');
  assert.strictEqual(frosted.style(), undefined, 'unknown values fall back to the default');
  assert.strictEqual((await boot('liquid', false)).style(), undefined, 'missing storage keeps the default');

  // The material's light/dark holds the page's theme only while a material is on.
  const held = await boot('liquid', true, 'light');
  assert.strictEqual(held.pageState.glassThemeOverride, 'light', 'a saved light material holds the page light');
  assert.strictEqual(held.attributes['data-glass-theme'], 'light');
  assert.strictEqual(held.attributes['data-glass-ink-hint'], 'dark', 'held light glass opens in dark ink');
  held.changeTheme('dark');
  assert.strictEqual(held.pageState.glassThemeOverride, 'dark');
  assert.strictEqual(held.attributes['data-glass-theme'], 'dark');
  held.change('none');
  assert.strictEqual(held.pageState.glassThemeOverride, '', 'the default surfaces give the theme back');
  assert.strictEqual(held.attributes['data-glass-theme'], undefined);
  held.change('frosted');
  assert.strictEqual(held.pageState.glassThemeOverride, 'dark', 'turning a material back on holds the choice again');
  held.changeTheme('follow');
  assert.strictEqual(held.pageState.glassThemeOverride, '');
  assert.deepStrictEqual(Array.from(held.themeApplies), ['light', 'dark', '', 'dark', ''],
    'each change of the held theme reapplies the page theme once');
  held.changeTheme('follow');
  assert.strictEqual(held.themeApplies.length, 5, 'an unchanged hold leaves the theme alone');
  const unthemed = await boot('frosted', true, undefined);
  assert.strictEqual(unthemed.pageState.glassThemeOverride, '', 'new installations follow the New Tab theme');
  assert.strictEqual(unthemed.themeApplies.length, 0);

  const css = postcss.parse(fs.readFileSync('src/newtab/glass-style.css', 'utf8'));
  css.walkRules((rule) => {
    for (const selector of rule.selectors) {
      assert(selector.startsWith('body[data-glass-style'),
        `the default style must stay untouched: ${selector}`);
    }
  });
  // A light-theme dialog flipped to dark glass must take every color the dark theme gives it, or its
  // text stays dark on the dark plate.
  const darkDialogProps = new Set();
  postcss.parse(fs.readFileSync('src/newtab/shortcuts/shortcut-dialog.css', 'utf8')).walkRules((rule) => {
    if (rule.selectors.includes('body[data-theme="dark"] .x-nt-shortcut-dialog')) {
      rule.walkDecls(/^--/, (decl) => darkDialogProps.add(decl.prop));
    }
  });
  const glassDialogProps = new Set();
  css.walkRules((rule) => {
    if (rule.selectors.some((selector) => /^body\[data-glass-style\] (\.x-nt-shortcut-dialog|:is\(\.x-nt-shortcut-dialog, \.x-nt-shortcut-dialog \*\)|\[data-glass-ink-theme="dark"\] \.x-nt-shortcut-dialog)$/.test(selector))) {
      rule.walkDecls(/^--/, (decl) => glassDialogProps.add(decl.prop));
    }
  });
  assert(darkDialogProps.has('--panel-text'), 'the dark shortcut dialog sets its text color');
  assert.deepStrictEqual([...darkDialogProps].filter((prop) => !glassDialogProps.has(prop)), [],
    'a shortcut dialog flipped to light ink takes the dark theme\'s colors');
  const html = fs.readFileSync('newtab.html', 'utf8');
  assert(html.indexOf('href="glass-style.css"') > html.indexOf('href="newtab.css"'),
    'the glass styles load after the page styles they override');
  console.log('glass style setting tests passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
