const assert = require('assert');
const settings = require('../../src/domain/settings.ts');
const { createOptionsPage } = require('../helpers/options-page');

// Editing a built-in site search under a new trigger stores a custom copy
// that remembers its origin and turns the original off. Removing, resetting
// or clearing those copies turns the original back on.

const OVERRIDE = {
  id: 'source-tube',
  key: 'tube',
  builtinKey: 'yt',
  name: 'Tube',
  template: 'https://www.youtube.com/results?search_query={query}',
  category: 'searchEngine'
};
const SEED = {
  [settings.SITE_SEARCH_STORAGE_KEY]: [OVERRIDE],
  [settings.SITE_SEARCH_DISABLED_STORAGE_KEY]: ['yt']
};

async function openPage() {
  const page = await createOptionsPage({ sync: JSON.parse(JSON.stringify(SEED)) });
  await page.settle(300);
  page.saved = () => ({
    custom: (page.storage.sync.data[settings.SITE_SEARCH_STORAGE_KEY] || []).map((item) => item.key),
    disabled: page.storage.sync.data[settings.SITE_SEARCH_DISABLED_STORAGE_KEY] || []
  });
  // Clicks the confirm button of the open confirmation, if one asks.
  page.confirm = async () => {
    const open = page.document.querySelector('._x_extension_popconfirm_2024_unique_[data-open="true"]');
    if (open) {
      const buttons = open.querySelectorAll('button');
      await page.click(buttons[buttons.length - 1]);
    }
    await page.settle(200);
  };
  return page;
}

async function testRemovingTheOverrideRestoresTheBuiltIn() {
  const page = await openPage();
  const title = Array.from(page.document.querySelectorAll('span, div')).find((node) => node.children.length === 0 && node.textContent.trim() === 'Tube');
  assert.ok(title, 'the override should be listed');
  let card = title;
  while (card && !card.querySelector('._x_extension_shortcut_remove_2024_unique_')) card = card.parentElement;
  await page.click(card.querySelector('._x_extension_shortcut_remove_2024_unique_'));
  await page.confirm();
  assert.deepStrictEqual(page.saved(), { custom: [], disabled: [] }, 'removing a renamed override should re-enable its built-in origin');
  page.close();
}

async function testResettingBuiltInsDropsOverrides() {
  const page = await openPage();
  await page.click(page.byId('_x_extension_builtin_reset_2024_unique_'));
  await page.confirm();
  assert.deepStrictEqual(page.saved(), { custom: [], disabled: [] },
    'resetting built-ins should remove renamed overrides as well as same-key overrides');
  page.close();
}

async function testClearingCustomProvidersRestoresBuiltIns() {
  const page = await openPage();
  const writes = page.storage.sync.writes.length;
  await page.click(page.byId('_x_extension_custom_clear_2024_unique_'));
  await page.confirm();
  assert.deepStrictEqual(page.saved(), { custom: [], disabled: [] }, 'clearing custom providers should restore built-ins hidden by overrides');
  const clearing = page.storage.sync.writes.slice(writes).filter((write) => Object.hasOwn(write, settings.SITE_SEARCH_STORAGE_KEY));
  assert.ok(clearing.length === 1 && Object.hasOwn(clearing[0], settings.SITE_SEARCH_DISABLED_STORAGE_KEY),
    'in the same storage write');
  page.close();
}

(async () => {
  await testRemovingTheOverrideRestoresTheBuiltIn();
  await testResettingBuiltInsDropsOverrides();
  await testClearingCustomProvidersRestoresBuiltIns();
  console.log('options built-in site-search override tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
