const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extensionFilePath } = require('../../scripts/build/extension-output');
const { JSDOM } = require('jsdom');
const { parseCss } = require('../helpers/css-rules');
const { readPageSource } = require('../helpers/page-source');
const { getPageScripts, runsBefore } = require('../helpers/runtime-scripts');
const { createNewtabPage } = require('../helpers/newtab-page');
const { createOnboardingPage } = require('../helpers/onboarding-page');
const { createOptionsPage } = require('../helpers/options-page');
const { createOverlayPage } = require('../helpers/overlay-runtime-harness');

const repoRoot = path.resolve(__dirname, '..', '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
);
const newtabHtml = readPageSource('newtab.html');
const optionsHtml = readPageSource('src/options/options.html');
const onboardingHtml = readPageSource('src/onboarding/onboarding.html');
const overlaySuggestionsCss = fs.readFileSync(
  path.join(repoRoot, 'src/overlay/suggestions-view.css'),
  'utf8'
);
const bootstrapPath = path.join(repoRoot, 'src/shared/react-page-bootstrap.ts');
const bootstrap = fs.readFileSync(bootstrapPath, 'utf8');
const newtabBundlePath = extensionFilePath('src/react/newtab-islands.js');
const optionsBundlePath = extensionFilePath('src/react/options-islands.js');
const onboardingBundlePath = extensionFilePath('src/react/onboarding-islands.js');
const overlayBundlePath = extensionFilePath('src/react/overlay-islands.js');
const popupBundlePath = extensionFilePath('src/react/popup-islands.js');
const popupBundle = fs.readFileSync(popupBundlePath, 'utf8');
const popupHtml = readPageSource('src/popup/popup.html');
const sharedBundlePath = extensionFilePath('src/react/react-shared.js');
const tabSwitcherSharedBundlePath = extensionFilePath('src/react/tab-switcher-shared.js');
const runtimeBundlePath = extensionFilePath('src/react/react-runtime.js');
const newtabBundle = fs.readFileSync(newtabBundlePath, 'utf8');
const optionsBundle = fs.readFileSync(optionsBundlePath, 'utf8');
const onboardingBundle = fs.readFileSync(onboardingBundlePath, 'utf8');
const overlayBundle = fs.readFileSync(overlayBundlePath, 'utf8');
const sharedBundle = fs.readFileSync(sharedBundlePath, 'utf8');
const tabSwitcherSharedBundle = fs.readFileSync(
  tabSwitcherSharedBundlePath,
  'utf8'
);
const runtimeBundle = fs.readFileSync(runtimeBundlePath, 'utf8');
const bundles = [
  runtimeBundle,
  sharedBundle,
  tabSwitcherSharedBundle,
  newtabBundle,
  optionsBundle,
  onboardingBundle,
  overlayBundle
];
const bundle = bundles.join('\n');

const pageEntryRunsAfterBridge = (page, reactEntry, entry) => {
  const scripts = getPageScripts(page);
  return runsBefore(scripts, reactEntry, 'src/overlay/tab-switcher-page-bridge.ts') &&
    runsBefore(scripts, 'src/overlay/tab-switcher-page-bridge.ts', entry);
};

// Each page's bootstrap tag and the bootstrap itself are covered by
// test-react-page-bootstrap.js; the React entry runs before the tab-switcher
// bridge, which runs before the page entry.
[
  ['newtab.html', 'src/react/newtab-islands.js', 'src/newtab/newtab.ts'],
  ['src/options/options.html', 'src/react/options-islands.js', 'src/options/options.ts'],
  ['src/onboarding/onboarding.html', 'src/react/onboarding-islands.js', 'src/onboarding/onboarding.ts']
].forEach(([page, reactEntry, entry]) => {
  assert(pageEntryRunsAfterBridge(page, reactEntry, entry), `${page} should connect its bridge between the React entry and the page entry`);
});
assert(
  ['account', 'shortcuts', 'blacklist', 'labs'].every((tab) => {
    const host = new JSDOM(optionsHtml).window.document.querySelector(`[data-content="${tab}"]`);
    return host && host.children.length === 0;
  }),
  'Options tabs drawn by React should not retain legacy DOM in the markup'
);
assert.strictEqual(
  packageJson.scripts['build:react'],
  'vite build --config vite.config.mjs && vite build --config vite.overlay.config.mjs',
  'the React output should have a reproducible local build command'
);
assert(
  packageJson.scripts.test.includes('test:legacy') &&
    packageJson.scripts.test.includes('test:react'),
  'the default test command should cover both runtimes'
);
assert(
  packageJson.scripts.build.includes('build:react') &&
    packageJson.scripts.build.includes('build:bundles') &&
    packageJson.scripts.check.includes('npm run build') &&
    packageJson.scripts.check.includes('check:static') &&
    packageJson.scripts.verify.includes('npm test') &&
    packageJson.scripts.verify.includes('check:static'),
  'the local verification command should run the tests and the same static checks as npm run check, building React once'
);
assert(
  packageJson.dependencies.react && packageJson.dependencies['react-dom'],
  'React runtime dependencies should be explicit'
);
const popupBootstrap = new JSDOM(popupHtml).window.document.querySelector('script[src="../../build/react-page-bootstrap.js"]');
assert(
  popupBootstrap &&
    popupBootstrap.getAttribute('data-react-entry') === '../src/react/popup-islands.js' &&
    popupBootstrap.getAttribute('data-page-entry') === 'popup.js' &&
    popupBootstrap.getAttribute('data-react-state') === 'LumnoPopupReactBootstrap' &&
    popupBundle.includes('from"./react-runtime.js"') &&
    !popupBundle.includes('from"./tab-switcher-shared.js"'),
  'the toolbar popup should start through the shared bootstrap without the tab-switcher chunk'
);
assert(
  newtabBundle.includes('from"./react-runtime.js"') &&
    newtabBundle.includes('from"./react-shared.js"') &&
    newtabBundle.includes('from"./tab-switcher-shared.js"') &&
    optionsBundle.includes('from"./react-shared.js"') &&
    optionsBundle.includes('from"./tab-switcher-shared.js"') &&
    onboardingBundle.includes('from"./react-runtime.js"') &&
    sharedBundle.includes('from"./react-runtime.js"') &&
    tabSwitcherSharedBundle.includes('from"./react-runtime.js"'),
  'New Tab and Options should reuse the shared tab-switcher implementation and React runtime'
);
assert(
  newtabBundle.includes('LumnoOverlayTabSwitcherViewReact') &&
    optionsBundle.includes('LumnoOverlayTabSwitcherViewReact') &&
    tabSwitcherSharedBundle.includes('overlay-tab-switcher'),
  'extension-page React entries should install the tab-switcher API before their bridge connects'
);
assert(
  overlayBundle.includes('LumnoOverlayReactBootstrap') &&
    overlayBundle.includes('LumnoOverlayShellReact') &&
    overlayBundle.includes('LumnoOverlaySuggestionsViewReact') &&
    overlayBundle.includes('LumnoOverlayTabSwitcherViewReact') &&
    overlayBundle.includes('LumnoSearchInputUIReact') &&
    overlayBundle.includes('overlay-shell') &&
    overlayBundle.includes('overlay-tab-switcher') &&
    overlayBundle.includes('suggestions') &&
    overlayBundle.includes('shared-search-input'),
  'the injected Overlay IIFE should install React shell, suggestions, and search-input APIs'
);
{
  const mark = parseCss(overlaySuggestionsCss).entries.find((entry) => entry.selectors.some((selector) => selector.endsWith('.x-ov-suggestion-mark')) &&
    entry.style.getPropertyValue('background'));
  assert.deepStrictEqual(mark && [mark.style.getPropertyValue('background').trim(), mark.style.getPropertyValue('color').trim()],
    ['var(--x-ext-mark-bg, #CFE8FF)', 'var(--x-ext-mark-text, #1E3A8A)'],
    'the Overlay query mark should retain its themed background and text colors');
}
// The search input is New Tab's (the overlay builds its own copy), so it ships
// in the New Tab bundle rather than the chunk every page loads.
assert(
  newtabBundle.includes('shared-search-input') &&
    !sharedBundle.includes('shared-search-input') &&
    sharedBundle.includes('_x_lumnoTooltipRenderReact_2026_unique_') &&
    overlayBundle.includes('_x_lumnoTooltipRenderReact_2026_unique_'),
  'the shared React search input should ship with New Tab only'
);
assert(
  !bundle.includes('process.env.NODE_ENV') &&
    !bundle.includes('sourceMappingURL=') &&
    !bootstrap.includes('sourceMappingURL=') &&
    !/\beval\(|new Function/.test(`${bundle}\n${bootstrap}`),
  'the extension bundle should be production-only, CSP-safe, and omit source maps'
);
assert(
  [newtabHtml, optionsHtml, onboardingHtml].every((html) => !Array.from(new JSDOM(html).window.document.scripts)
    .some((script) => /^https?:\/\//i.test(script.getAttribute('src') || ''))),
  'MV3 pages should not load React or any script from a CDN'
);

// The running pages install every migrated React API and mark their islands.
async function testPages() {
  const missing = (window, names) => names.filter((name) => !window[name]);
  const newtab = await createNewtabPage({});
  await newtab.settle(300);
  assert.deepStrictEqual(missing(newtab.window, [
    'LumnoNewtabShortcutDialogReact', 'LumnoNewtabRecentSitesViewReact', 'LumnoNewtabBookmarksViewReact',
    'LumnoNewtabSuggestionsViewReact', 'LumnoNewtabShortcutsViewReact', 'LumnoNewtabToastReact',
    'LumnoNewtabFeedbackControlReact', 'LumnoNewtabSelectMenuReact', 'LumnoNewtabDockReact',
    'LumnoNewtabWordmarkReact', 'LumnoSearchInputUIReact', 'LumnoNewtabReactIslands', 'LumnoOverlayTabSwitcherViewReact'
  ]), [], 'New Tab should install its React APIs, the tab switcher included, before its bridge connects');
  const islands = new Set(Array.from(newtab.document.querySelectorAll('[data-react-island]')).map((node) => node.getAttribute('data-react-island')));
  ['newtab-feedback-control', 'newtab-bottom-dock', 'newtab-wordmark', 'shared-search-input'].forEach((island) => {
    assert.ok(islands.has(island), `New Tab should mark its ${island} island`);
  });
  newtab.close();

  const options = await createOptionsPage({});
  await options.settle(300);
  assert.deepStrictEqual(missing(options.window, [
    'LumnoOptionsToastReact', 'LumnoOptionsAccountTab', 'LumnoOptionsBlacklistTabReact', 'LumnoOptionsShortcutsTab',
    'LumnoOptionsSettingsNavigationReact',
    'LumnoOptionsSettingsControlsReact',
    'LumnoOptionsReactIslands', 'LumnoOverlayTabSwitcherViewReact'
  ]), [], 'Options should install every migrated React API');
  assert.ok(options.document.querySelectorAll('[data-react-island]').length > 5, 'and render through them');
  options.close();

  const onboarding = await createOnboardingPage({});
  await onboarding.settle(200);
  assert.deepStrictEqual(missing(onboarding.window, [
    'LumnoOnboardingCopyPanelReact', 'LumnoOnboardingVisualPanelReact', 'LumnoOnboardingReactIslands'
  ]), [], 'Onboarding should install every migrated React API');
  assert.strictEqual(onboarding.document.getElementById('onboarding-copy-panel').getAttribute('data-react-island'), 'onboarding-copy-panel');
  assert.ok(onboarding.document.getElementById('onboarding-page-strip'), 'and draw the copy column through it');
  onboarding.close();
}

// The overlay mounts inside the fullscreen element when there is one, enters
// the browser top layer and focuses its input as part of the reveal.
async function testOverlayMount() {
  let fullscreen = null;
  let popovers = 0;
  const page = await createOverlayPage({
    stylesheetsLoad: true,
    setup(window) {
      fullscreen = window.document.createElement('div');
      window.document.body.appendChild(fullscreen);
      Object.defineProperty(window.document, 'fullscreenElement', { configurable: true, get: () => fullscreen });
      window.HTMLElement.prototype.showPopover = function() { popovers += 1; };
    }
  });
  const root = await page.open({});
  await page.settle(200);
  assert.strictEqual(root.host.parentNode, fullscreen, 'the Overlay panel should stay inside the fullscreen subtree');
  assert.strictEqual(popovers, 1, 'and enter the browser top layer');
  assert.strictEqual(root.activeElement && root.activeElement.tagName, 'INPUT', 'and focus its input as part of the reveal');
  page.close();
}

(async () => {
  await testPages();
  await testOverlayMount();
  console.log('React migration contract tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
