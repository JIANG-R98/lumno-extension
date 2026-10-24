const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const postcss = require('postcss');
const settings = require('../../src/domain/settings.ts');
const { createNewtabPage } = require('../helpers/newtab-page');

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

// New Tab with the given material and material theme stored. The liquid
// material's rim refraction is drawn by LumnoNewtabLiquidSurfaces, which needs
// a real canvas; the test counts the surfaces New Tab asks it for.
async function boot(value, themeValue) {
  const surfaces = { created: 0, destroyed: 0, selector: '' };
  const sync = {};
  if (value !== undefined) sync[key] = value;
  if (themeValue !== undefined) sync[themeKey] = themeValue;
  const page = await createNewtabPage({
    sync,
    darkSystem: true,
    setup(window) {
      let runtime;
      Object.defineProperty(window, 'LumnoNewtabLiquidSurfaces', {
        configurable: true,
        get: () => runtime,
        set(next) {
          runtime = Object.assign({}, next, {
            create(options) {
              surfaces.created += 1;
              surfaces.selector = options.selector;
              assert.strictEqual(options.property, '--x-nt-glass-refraction');
              const created = next.create(options);
              return Object.assign({}, created, {
                destroy() {
                  surfaces.destroyed += 1;
                  return created && created.destroy && created.destroy();
                }
              });
            }
          });
        }
      });
    }
  });
  await page.settle(250);
  const body = page.document.body;
  return {
    page,
    surfaces,
    style: () => body.getAttribute('data-glass-style'),
    glassTheme: () => body.getAttribute('data-glass-theme'),
    inkHint: () => body.getAttribute('data-glass-ink-hint'),
    theme: () => body.getAttribute('data-theme'),
    async change(next) {
      page.changeStorage('sync', key, next);
      await page.settle(80);
    },
    async changeTheme(next) {
      page.changeStorage('sync', themeKey, next);
      await page.settle(80);
    }
  };
}

async function main() {
  const fresh = await boot(undefined);
  assert.strictEqual(fresh.style(), null, 'new installations keep the original surfaces');
  assert.strictEqual(fresh.surfaces.created, 0);
  fresh.page.close();
  const frosted = await boot('frosted');
  assert.strictEqual(frosted.style(), 'frosted', 'a saved choice applies during startup');
  assert.strictEqual(frosted.surfaces.created, 0, 'frosted glass needs no refraction maps');
  await frosted.change('liquid');
  assert.strictEqual(frosted.style(), 'liquid', 'a synchronized choice applies live');
  assert.strictEqual(frosted.surfaces.created, 1, 'liquid glass starts the rim refraction');
  // The search stack and the dock's cards bend; menus and the panel, on layers of their own,
  // sometimes show their lens's map in Chrome 155. The bookmarks bar keeps its own glass.
  assert(frosted.surfaces.selector.includes('#_x_extension_newtab_suggestions_surface_2026_unique_'));
  assert(frosted.surfaces.selector.includes('.x-nt-recent-card-visual'));
  assert(frosted.surfaces.selector.includes(':not(.x-nt-bookmarks-topbar .x-nt-bookmark-card)'));
  assert(!frosted.surfaces.selector.includes('_x_extension_menu_surface_2024_unique_'));
  await frosted.change('liquid');
  assert.strictEqual(frosted.surfaces.created, 1, 'staying on liquid keeps the same maps');
  await frosted.change('none');
  assert.strictEqual(frosted.style(), null, 'switching back restores the original surfaces');
  assert.strictEqual(frosted.surfaces.destroyed, 1, 'leaving liquid drops its maps');
  await frosted.change('glass');
  assert.strictEqual(frosted.style(), null, 'unknown values fall back to the default');
  frosted.page.close();

  // The material's light/dark holds the page's theme only while a material is on
  // (the system theme here is dark).
  const held = await boot('liquid', 'light');
  assert.deepStrictEqual([held.glassTheme(), held.theme()], ['light', 'light'], 'a saved light material holds the page light');
  assert.strictEqual(held.inkHint(), 'dark', 'held light glass opens in dark ink');
  await held.changeTheme('dark');
  assert.deepStrictEqual([held.glassTheme(), held.theme()], ['dark', 'dark']);
  await held.changeTheme('light');
  await held.change('none');
  assert.deepStrictEqual([held.glassTheme(), held.theme()], [null, 'dark'], 'the default surfaces give the theme back');
  await held.change('frosted');
  assert.deepStrictEqual([held.glassTheme(), held.theme()], ['light', 'light'], 'turning a material back on holds the choice again');
  await held.changeTheme('follow');
  assert.deepStrictEqual([held.glassTheme(), held.theme()], [null, 'dark']);
  held.page.close();
  const unthemed = await boot('frosted', undefined);
  assert.deepStrictEqual([unthemed.glassTheme(), unthemed.theme()], [null, 'dark'], 'new installations follow the New Tab theme');
  unthemed.page.close();

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
  const links = Array.from(new JSDOM(fs.readFileSync('newtab.html', 'utf8')).window.document.querySelectorAll('link[rel="stylesheet"]'))
    .map((link) => link.getAttribute('href'));
  const glass = links.indexOf('glass-style.css');
  assert(glass > 0 && links.slice(0, glass).some((href) => href.startsWith('styles/')) && !links.slice(glass + 1).some((href) => href.startsWith('styles/')),
    'the glass styles load after the page styles they override');
  console.log('glass style setting tests passed');
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
