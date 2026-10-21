const assert = require('assert');
const { bundledSiteSearchProviders } = require('../helpers/overlay-runtime-harness');
const { SURFACES, openSearchSurface } = require('../helpers/search-surfaces');

// The provider list a search surface asks for at startup can arrive after a
// newer one: Settings may disable a provider meanwhile, and the page reloads
// its list from storage. The late startup answer must not bring the old list
// back.

const DISABLED_KEY = '_x_extension_site_search_disabled_2024_unique_';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function menuHas(surface, key) {
  return Boolean(surface.root.querySelector(`.x-lumno-search-input-mode__menu-item[data-mode-id="provider:${key}"]`));
}

async function openWithHeldProviders(name) {
  const startup = deferred();
  let asked = 0;
  const surface = await openSearchSurface(name, {
    // The overlay is opened without providers so it loads them itself.
    openContext: { siteSearchProviders: undefined },
    respond(message) {
      if (message.action === 'getSiteSearchProviders') {
        asked += 1;
        return startup.promise;
      }
      return undefined;
    }
  });
  await surface.settle(60);
  return { surface, startup, asked: () => asked };
}

function disableInSettings(surface, keys) {
  if (surface.name === 'overlay') {
    surface.page.changeSetting(DISABLED_KEY, keys);
  } else {
    surface.page.changeStorage('sync', DISABLED_KEY, keys);
    surface.page.storage.local.data[DISABLED_KEY] = keys;
  }
}

async function testLateStartupAnswerLosesToANewerReload(name) {
  const { surface, startup, asked } = await openWithHeldProviders(name);
  assert.ok(asked() > 0, `${name}: the page should ask for its providers`);
  disableInSettings(surface, ['yt']);
  await surface.settle(80);
  startup.resolve({ items: bundledSiteSearchProviders() });
  await surface.settle(80);
  await surface.openScopeMenu();
  assert.strictEqual(menuHas(surface, 'yt'), false, `${name}: a provider disabled meanwhile should stay disabled`);
  assert.strictEqual(menuHas(surface, 'gh'), true, `${name}: the newer list should be shown`);
  surface.close();
}

async function testEarlyStartupAnswerIsReplaced(name) {
  const { surface, startup } = await openWithHeldProviders(name);
  startup.resolve({ items: bundledSiteSearchProviders() });
  await surface.settle(60);
  disableInSettings(surface, ['yt']);
  await surface.settle(80);
  await surface.openScopeMenu();
  assert.strictEqual(menuHas(surface, 'yt'), false, `${name}: a later Settings change should replace the startup list`);
  surface.close();
}

(async () => {
  for (const name of SURFACES) {
    await testLateStartupAnswerLosesToANewerReload(name);
    await testEarlyStartupAnswerIsReplaced(name);
  }
  console.log('site search provider load race tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
