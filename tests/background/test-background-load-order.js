const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadBackground } = require('../helpers/background-harness');
const { getBackgroundServiceFiles } = require('../helpers/background-source');

// background.js imports its service modules; the bundle runs them before
// background.js's own code. Chrome runs the bundle as the service worker; the
// Firefox build (scripts/build/build-firefox.js) runs it as a background script
// after the scripts the worker would import on first use. Both must boot
// without touching a top-level binding before it is initialized.

const repoRoot = path.resolve(__dirname, '..', '..');
const serviceModules = fs.readdirSync(path.join(repoRoot, 'src/background'))
  .filter((file) => /-service\.[jt]s$|^pinned-tab-recovery\.[jt]s$/.test(file))
  .map((file) => `src/background/${file}`);
const importedServices = getBackgroundServiceFiles();

serviceModules.forEach((file) => {
  assert.ok(importedServices.includes(file), `background.js should import ${file}`);
});

function bootAndCheck(firefoxOrder) {
  const harness = loadBackground({
    firefoxOrder,
    tabs: [{ id: 3, windowId: 1, index: 0, active: true, url: 'https://example.com/', title: 'Example' }],
    expose: ['backgroundMessageRouter']
  });
  const router = harness.exposed('backgroundMessageRouter');
  assert.ok(router && router.has('getSearchSuggestions'), 'the router should be ready after boot');
  return harness;
}

(async () => {
  const chromeOrder = bootAndCheck(false);
  const firefoxOrder = bootAndCheck(true);
  for (const harness of [chromeOrder, firefoxOrder]) {
    const response = await harness.sendMessage({ action: 'getShowSearchShortcut' });
    assert.ok(response && typeof response.shortcut === 'string');
  }
  console.log('background load order tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
