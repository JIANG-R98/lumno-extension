const assert = require('assert');
const fs = require('fs');
const path = require('path');
const settingsMigrations = { ...require('../../src/domain/settings/migrations.ts'), ...require('../../src/domain/settings/removed.ts'), settingsSchemaVersion: require('../../src/domain/settings/sync-state.ts').settingsSchemaVersion };
const { loadBackground, wait } = require('../helpers/background-harness');
const { siteSearchIconCacheStorage } = require('../helpers/site-search-icon-cache');
const { siteSearchIconCache } = require('../../src/domain/settings/search.ts');

// The worker warms icons for the user's own site-search providers as it
// starts: bundled providers keep their packaged tiles, cached icons are
// reused, only approved favicon sources are fetched, two at a time.

const repoRoot = path.resolve(__dirname, '..', '..');
const SITE_SEARCH_KEY = '_x_extension_site_search_custom_2024_unique_';
const bundled = JSON.parse(fs.readFileSync(path.join(repoRoot, 'assets/data/site-search.json'), 'utf8'));
const CUSTOM = ['alpha', 'beta', 'gamma', 'delta'].map((name) => ({
  key: `c${name}`,
  name,
  template: `https://${name}.example.test/search?q={query}`
}));
const ICON = 'data:image/png;base64,iVBORw0KGgo=';

async function run() {
  const fetches = [];
  // Providers with a request in flight; each provider's candidates are
  // tried one after another, so this counts parallel warm-ups.
  const inFlight = new Map();
  let maxInFlight = 0;
  const hostOf = (resource) => {
    const params = new URL(resource).searchParams;
    try {
      return new URL(params.get('pageUrl') || params.get('url') || '').hostname;
    } catch (error) {
      return resource;
    }
  };
  const local = await siteSearchIconCacheStorage([{ provider: CUSTOM[1], dataUrl: ICON }]);
  settingsMigrations.LEGACY_SITE_SEARCH_ICON_KEYS.forEach((key) => {
    local[key] = { stale: true };
  });
  const harness = loadBackground({
    extensionUrls: true,
    sync: { [SITE_SEARCH_KEY]: CUSTOM, _x_extension_favicon_enhanced_fetch_enabled_2026_unique_: true },
    local,
    fetch(url, options) {
      const resource = String(url);
      if (resource.startsWith('chrome-extension://lumno-test/') && !resource.includes('/_favicon/')) {
        const text = fs.readFileSync(path.join(repoRoot, new URL(resource).pathname), 'utf8');
        return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(text)) });
      }
      fetches.push({ url: resource, redirect: options && options.redirect });
      const host = hostOf(resource);
      inFlight.set(host, (inFlight.get(host) || 0) + 1);
      maxInFlight = Math.max(maxInFlight, inFlight.size);
      return new Promise((resolve) => setTimeout(() => {
        const left = inFlight.get(host) - 1;
        if (left > 0) inFlight.set(host, left);
        else inFlight.delete(host);
        resolve({ ok: false, status: 404 });
      }, 30));
    }
  });
  await wait(1500);

  assert.ok(fetches.length > 0, 'the custom providers should get their icons warmed');
  assert.ok(maxInFlight <= 2, `icon discovery should warm at most two providers at a time (saw ${maxInFlight})`);
  fetches.forEach((fetch) => {
    assert.ok(/^(chrome-extension:\/\/lumno-test\/_favicon\/|https:\/\/t2\.gstatic\.cn\/faviconV2|https:\/\/favicon\.is\/)/.test(fetch.url),
      `${fetch.url} should be an approved favicon source, never the provider's page or manifest`);
    assert.strictEqual(fetch.redirect, 'error');
  });
  const warmedHosts = new Set(fetches.map((fetch) => hostOf(fetch.url)));
  ['alpha', 'gamma', 'delta'].forEach((name) => {
    assert.ok(warmedHosts.has(`${name}.example.test`), `${name} should be warmed`);
  });
  assert.ok(!warmedHosts.has('beta.example.test'), 'a provider with a fresh cached icon should not be fetched again');
  bundled.items.forEach((provider) => {
    const pageHost = new URL(provider.template.replace('{query}', 'x')).hostname;
    assert.ok(!warmedHosts.has(pageHost), `the bundled ${provider.key} provider should keep its packaged tile`);
  });
  settingsMigrations.LEGACY_SITE_SEARCH_ICON_KEYS.forEach((key) => {
    assert.ok(!(key in harness.storage.local.data), `${key} from an earlier cache layout should be removed`);
  });
  const reads = harness.storage.local.reads.flatMap((keys) => (Array.isArray(keys) ? keys : [keys]));
  assert.ok(reads.includes(siteSearchIconCache.key), 'warming should start from the canonical icon cache');
}

run().then(() => {
  console.log('background site-search icon tests passed');
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
