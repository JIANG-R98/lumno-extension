const assert = require('assert');
const settings = require('../../src/domain/settings/index.ts');
const { openSearchSurface } = require('../helpers/search-surfaces');

// /mode on New Tab switches the theme the page is showing: the global theme
// while New Tab follows it, or New Tab's own override when it has one. The
// appearance panel's Global / New Tab scope picker is covered by
// src/newtab/react/wallpaper-view.test.tsx and test-newtab-wallpaper-panel.js.

const THEME = settings.themeMode.key;
const NEWTAB_THEME = settings.newtabThemeMode.key;

async function run(sync, activate) {
  const surface = await openSearchSurface('newtab', { sync });
  await surface.type('/mode');
  await surface.settle(100);
  const [row] = surface.suggestions();
  assert.deepStrictEqual(row && [row._xSuggestion.type, row._xSuggestion.nextMode], ['modeSwitch', 'dark'], '/mode should offer the next theme');
  const before = surface.page.storage.sync.writes.length;
  await activate(surface, row);
  await surface.settle(100);
  const result = {
    theme: surface.page.document.body.getAttribute('data-theme'),
    writes: surface.page.storage.sync.writes.slice(before).filter((write) => Object.hasOwn(write, THEME) || Object.hasOwn(write, NEWTAB_THEME))
  };
  surface.close();
  return result;
}

const pressEnter = (surface) => surface.press('Enter');
const clickRow = (surface, row) => row.dispatchEvent(new surface.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

(async () => {
  for (const [how, activate] of [['Enter', pressEnter], ['a click', clickRow]]) {
    const following = await run({ [THEME]: 'light' }, activate);
    assert.strictEqual(following.theme, 'dark', `${how} on /mode should switch the visible theme`);
    assert.deepStrictEqual(following.writes, [{ [THEME]: 'dark' }], `${how}: while New Tab follows the global theme, it should change the global theme`);

    const overridden = await run({ [THEME]: 'light', [NEWTAB_THEME]: 'light' }, activate);
    assert.strictEqual(overridden.theme, 'dark');
    assert.deepStrictEqual(overridden.writes, [{ [NEWTAB_THEME]: 'dark' }], `${how}: with its own theme, New Tab should change only that`);
  }
  console.log('newtab mode command tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
