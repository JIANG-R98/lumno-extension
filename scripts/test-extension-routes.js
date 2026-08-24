const assert = require('assert');
const fs = require('fs');
const path = require('path');
const routes = require('../src/shared/extension-routes.js');

const chromeApi = {
  runtime: {
    getURL: (value) => `chrome-extension://abc/${value}`
  }
};

assert.strictEqual(
  routes.buildNewtabUrl(chromeApi, { focus: true }),
  'chrome-extension://abc/newtab.html?focus=1',
  'focused newtab URL should use the extension route'
);

assert.strictEqual(
  routes.buildNewtabUrl(chromeApi, { focus: true, notice: 'file-access' }),
  'chrome-extension://abc/newtab.html?focus=1&notice=file-access',
  'newtab URL should preserve focus and notice params'
);

assert.strictEqual(
  routes.buildLumnoNewtabUrl(chromeApi, { focus: true }),
  'chrome-extension://abc/src/newtab/lumno-newtab.html?focus=1',
  'forced Lumno newtab URL should use the standalone extension route'
);

assert.strictEqual(
  routes.buildOptionsUrl(chromeApi, 'appearance'),
  'chrome-extension://abc/src/options/options.html#appearance',
  'options hash URL should use the extension route'
);

assert.strictEqual(
  routes.buildExtensionUrl(chromeApi, routes.ROUTE_PATHS.onboarding),
  'chrome-extension://abc/src/onboarding/onboarding.html',
  'onboarding URL should use the extension route'
);

assert.strictEqual(
  routes.classifyExtensionUrl('chrome-extension://abc/newtab.html?focus=1'),
  'newtab',
  'newtab URLs should be classified'
);

assert.strictEqual(
  routes.classifyExtensionUrl('chrome-extension://abc/src/newtab/newtab.html?focus=1'),
  'newtab',
  'the previous newtab URL should remain classified during compatibility redirects'
);

assert.strictEqual(
  routes.classifyExtensionUrl('chrome-extension://abc/src/newtab/lumno-newtab.html?focus=1'),
  'newtab',
  'standalone Lumno newtab URLs should be classified as newtab'
);

assert.strictEqual(
  routes.classifyExtensionUrl('chrome-extension://abc/src/options/options.html#appearance'),
  'options',
  'options URLs should be classified'
);

assert.strictEqual(
  routes.classifyExtensionUrl('chrome-extension://abc/src/onboarding/onboarding.html?entry=ext'),
  'onboarding',
  'onboarding URLs should be classified'
);

assert.strictEqual(
  routes.classifyExtensionUrl('chrome-extension://abc/src/other/page.html'),
  'other',
  'unknown extension URLs should be classified as other'
);

const repoRoot = path.resolve(__dirname, '..');
const manifest = require('../manifest.json');
assert.ok(
  fs.existsSync(path.join(repoRoot, routes.ROUTE_PATHS.newtab)),
  'the short maintained New Tab HTML should exist'
);
assert.strictEqual(
  manifest.chrome_url_overrides.newtab,
  routes.ROUTE_PATHS.newtab,
  'manifest should load the maintained page directly so disabled auto-focus stays on chrome://newtab'
);
assert.notStrictEqual(
  routes.ROUTE_PATHS.lumnoNewtab,
  manifest.chrome_url_overrides.newtab,
  'the explicit focused fallback should remain distinct from the browser override route'
);
assert.ok(
  fs.existsSync(path.join(repoRoot, routes.ROUTE_PATHS.lumnoNewtab)),
  'forced Lumno newtab standalone HTML should exist'
);

console.log('extension route tests passed');
