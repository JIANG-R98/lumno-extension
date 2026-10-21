const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readOptionsRuntimeSource } = require('../helpers/options-source');
const { readPageSource } = require('../helpers/page-source');
const { readOverlayPanelSource } = require('../helpers/overlay-source');
const { getPageScripts, runsBefore } = require('../helpers/runtime-scripts');

const repoRoot = path.resolve(__dirname, '..', '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
);
const newtabHtml = readPageSource('newtab.html');
const optionsHtml = readPageSource('src/options/options.html');
const optionsSource = readOptionsRuntimeSource();
const onboardingHtml = readPageSource('src/onboarding/onboarding.html');
const onboardingSource = fs.readFileSync(
  path.join(repoRoot, 'src/onboarding/onboarding.js'),
  'utf8'
);
const overlaySuggestionsCss = fs.readFileSync(
  path.join(repoRoot, 'src/overlay/suggestions-view.css'),
  'utf8'
);
const overlaySource = readOverlayPanelSource();
const feedbackReactSource = fs.readFileSync(
  path.join(repoRoot, 'react-src/newtab/feedback.tsx'),
  'utf8'
);
const selectMenuReactSource = fs.readFileSync(
  path.join(repoRoot, 'react-src/newtab/select-menu.tsx'),
  'utf8'
);
const dockReactSource = fs.readFileSync(
  path.join(repoRoot, 'react-src/newtab/dock.tsx'),
  'utf8'
);
const wordmarkReactSource = fs.readFileSync(
  path.join(repoRoot, 'react-src/newtab/wordmark.tsx'),
  'utf8'
);
const searchInputReactSource = fs.readFileSync(
  path.join(repoRoot, 'react-src/shared/search-input.tsx'),
  'utf8'
);
const bootstrapPath = path.join(repoRoot, 'src/shared/react-page-bootstrap.js');
const bootstrap = fs.readFileSync(bootstrapPath, 'utf8');
const newtabBundlePath = path.join(
  repoRoot,
  'src/react/newtab-islands.js'
);
const optionsBundlePath = path.join(repoRoot, 'src/react/options-islands.js');
const onboardingBundlePath = path.join(
  repoRoot,
  'src/react/onboarding-islands.js'
);
const overlayBundlePath = path.join(repoRoot, 'src/react/overlay-islands.js');
const popupBundlePath = path.join(repoRoot, 'src/react/popup-islands.js');
const popupBundle = fs.readFileSync(popupBundlePath, 'utf8');
const popupHtml = readPageSource('src/popup/popup.html');
const sharedBundlePath = path.join(repoRoot, 'src/react/react-shared.js');
const tabSwitcherSharedBundlePath = path.join(
  repoRoot,
  'src/react/tab-switcher-shared.js'
);
const runtimeBundlePath = path.join(repoRoot, 'src/react/react-runtime.js');
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

const bootstrapScript = 'src="../../build/react-page-bootstrap.js"';
const pageEntryRunsAfterBridge = (page, reactEntry, entry) => {
  const scripts = getPageScripts(page);
  return runsBefore(scripts, reactEntry, 'src/overlay/tab-switcher-page-bridge.js') &&
    runsBefore(scripts, 'src/overlay/tab-switcher-page-bridge.js', entry);
};

assert(
  newtabHtml.includes(bootstrapScript),
  'New Tab should load its React entry through the shared bootstrap'
);
assert(
  newtabHtml.includes('data-react-entry="../src/react/newtab-islands.js"') &&
    newtabHtml.includes('data-page-entry="newtab.js"') &&
    newtabHtml.includes('data-react-state="LumnoNewtabReactBootstrap"') &&
    pageEntryRunsAfterBridge('newtab.html', 'src/react/newtab-islands.js', 'src/newtab/newtab.js') &&
    bootstrap.includes('import(reactEntryUrl)') &&
    bootstrap.includes('if (!bootstrapState.reactReady)') &&
    bootstrap.includes('startPage();'),
  'the bootstrap should require React readiness before connecting bridges and injecting the browser adapter'
);
assert(
  optionsHtml.includes(bootstrapScript) &&
    optionsHtml.includes('data-react-entry="../src/react/options-islands.js"') &&
    optionsHtml.includes('data-page-entry="options.js"') &&
    optionsHtml.includes('data-react-state="LumnoOptionsReactBootstrap"') &&
    pageEntryRunsAfterBridge('src/options/options.html', 'src/react/options-islands.js', 'src/options/options.js'),
  'Options should use the shared React-aware bootstrap and retain classic page semantics'
);
assert(
  onboardingHtml.includes(bootstrapScript) &&
    onboardingHtml.includes('data-react-entry="../src/react/onboarding-islands.js"') &&
    onboardingHtml.includes('data-page-entry="onboarding.js"') &&
    onboardingHtml.includes('data-react-state="LumnoOnboardingReactBootstrap"') &&
    pageEntryRunsAfterBridge('src/onboarding/onboarding.html', 'src/react/onboarding-islands.js', 'src/onboarding/onboarding.js'),
  'Onboarding should use the shared React-aware bootstrap and retain classic page semantics'
);
assert(
  /id="_x_extension_blacklist_form_2026_unique_"[^>]*><\/div>/.test(optionsHtml) &&
    /id="_x_extension_favicon_blacklist_form_2026_unique_"[^>]*><\/div>/.test(optionsHtml) &&
    optionsSource.includes('searchBlacklistFormController?.reset()') &&
    optionsSource.includes('faviconBlacklistFormController?.reset()'),
  'React-owned blacklist forms should not retain legacy DOM state or event-handler fallbacks'
);
assert(
    bootstrap.includes("root.dataset.lumnoReactRuntime = 'error'") &&
    bootstrap.includes('React page failed to start'),
  'the bootstrap should fail explicitly instead of reviving a legacy UI path'
);
assert.strictEqual(
  packageJson.scripts['build:react'],
  'vite build --config vite.react.config.mjs && vite build --config vite.overlay-react.config.mjs',
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
assert(
  popupHtml.includes(bootstrapScript) &&
    popupHtml.includes('data-react-entry="../src/react/popup-islands.js"') &&
    popupHtml.includes('data-page-entry="popup.js"') &&
    popupHtml.includes('data-react-state="LumnoPopupReactBootstrap"') &&
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
assert(
  /\.x-ov-suggestion-mark\s*\{[^}]*background:\s*var\(--x-ext-mark-bg,\s*#CFE8FF\)[^}]*color:\s*var\(--x-ext-mark-text,\s*#1E3A8A\)/s.test(
    overlaySuggestionsCss
  ),
  'the Overlay query mark should retain its themed background and text colors'
);
assert(
  /const overlayMountParent = document\.fullscreenElement \|\|\s+document\.documentElement \|\|\s+document\.body;/.test(overlaySource) &&
    overlaySource.includes('overlayMountParent.appendChild(overlayHost);') &&
    overlaySource.includes("typeof overlayHost.showPopover === 'function'") &&
    overlaySource.includes('overlayHost.showPopover();') &&
    overlaySource.includes("overlayHost.removeAttribute('popover');") &&
    overlaySource.includes('function focusOverlayInputForReveal()') &&
    overlaySource.includes('searchInput.focus({ preventScroll: true });') &&
    overlaySource.includes('focusOverlayInputForReveal();') &&
    !overlaySource.includes(
      'setTimeout(() => searchInput.focus({ preventScroll: true }), 100);'
    ),
  'the Overlay panel should avoid hidden body containers, stay inside the fullscreen subtree, enter the browser top layer, and focus as part of the reveal transaction'
);
assert(
  newtabBundle.includes('LumnoNewtabShortcutDialogReact') &&
    newtabBundle.includes('LumnoNewtabRecentSitesViewReact') &&
    newtabBundle.includes('LumnoNewtabBookmarksViewReact') &&
    newtabBundle.includes('LumnoNewtabSuggestionsViewReact') &&
    newtabBundle.includes('LumnoNewtabShortcutsViewReact') &&
    newtabBundle.includes('LumnoNewtabToastReact') &&
    newtabBundle.includes('LumnoNewtabFeedbackControlReact') &&
    newtabBundle.includes('LumnoNewtabSelectMenuReact') &&
    newtabBundle.includes('LumnoNewtabDockReact') &&
    newtabBundle.includes('LumnoNewtabWordmarkReact') &&
    newtabBundle.includes('LumnoSearchInputUIReact') &&
    newtabBundle.includes('LumnoNewtabReactIslands') &&
    newtabBundle.includes('newtab-feedback-control') &&
    newtabBundle.includes('newtab-select-menu') &&
    newtabBundle.includes('newtab-bottom-dock') &&
    newtabBundle.includes('newtab-wordmark') &&
    feedbackReactSource.includes('createFeedbackControlController') &&
    feedbackReactSource.includes("host.dataset.reactIsland = 'newtab-feedback-control'") &&
    selectMenuReactSource.includes('createSelectMenuController') &&
    selectMenuReactSource.includes("host.dataset.reactIsland = 'newtab-select-menu'") &&
    dockReactSource.includes("bottomDock.dataset.reactIsland = 'newtab-bottom-dock'") &&
    wordmarkReactSource.includes("host.dataset.reactIsland = 'newtab-wordmark'") &&
    sharedBundle.includes('data-react-island'),
  'the compiled islands should expose diagnostic APIs and host markers'
);
// The search input is New Tab's (the overlay builds its own copy), so it ships
// in the New Tab bundle rather than the chunk every page loads.
assert(
  newtabBundle.includes('shared-search-input') &&
    !sharedBundle.includes('shared-search-input') &&
    sharedBundle.includes('_x_lumnoTooltipRenderReact_2026_unique_') &&
    overlayBundle.includes('_x_lumnoTooltipRenderReact_2026_unique_') &&
    searchInputReactSource.includes('createSearchInput') &&
    searchInputReactSource.includes(
      "container.dataset.reactIsland = 'shared-search-input'"
    ),
  'the shared React search input should keep a diagnostic host marker'
);
assert(
  [
    'LumnoOptionsToastReact',
    'LumnoOptionsBlacklistListReact',
    'LumnoOptionsPopconfirmReact',
    'LumnoOptionsSegmentedControlReact',
    'LumnoOptionsSelectControlReact',
    'LumnoOptionsSettingsNavigationReact',
    'LumnoOptionsSettingsControlsReact',
    'LumnoOptionsSettingsFormsReact',
    'LumnoOptionsShortcutReferenceReact',
    'LumnoOptionsShortcutHotkeyReact',
    'LumnoOptionsSiteSearchListReact',
    'LumnoOptionsThemePickerReact',
    'LumnoOptionsReactIslands'
  ].every((name) => optionsBundle.includes(name)) &&
    [
      'optionsBlacklistListApi.createBlacklistListController',
      'optionsPopconfirmApi',
      'optionsSegmentedControlApi.createSegmentedControlController',
      'optionsSelectControlApi.createSelectControlController',
      'optionsSettingsControlsApi.createToggleControlController',
      'optionsSettingsControlsApi.createRequiredCheckboxGroupController',
      'optionsSettingsFormsApi.createSiteSearchFormController',
      'optionsSettingsFormsApi.createBlacklistFormController',
      'optionsSettingsNavigationApi.createSettingsNavigationController',
      'optionsShortcutReferenceApi.createShortcutReferenceController',
      'optionsShortcutHotkeyApi.createShortcutHotkeyController',
      'optionsSiteSearchListApi.createSiteSearchListController',
      'optionsThemePickerApi.createThemePickerController',
      'optionsToastApi.createToastController'
    ].every((contract) => optionsSource.includes(contract)),
  'Options should install and consume every migrated React controller'
);
assert(
  [
    'LumnoOnboardingPageStripReact',
    'LumnoOnboardingActionsReact',
    'LumnoOnboardingBodyCopyReact',
    'LumnoOnboardingCopyHeadingReact',
    'LumnoOnboardingCursorLayerReact',
    'LumnoOnboardingInteractionsReact',
    'LumnoOnboardingVisualSurfaceReact',
    'LumnoOnboardingReactIslands'
  ].every((name) => onboardingBundle.includes(name)) &&
    sharedBundle.includes('renderBrowserAvatarTooltip') &&
    [
      'onboardingPageStripApi.createPageStripController',
      'onboardingActionsApi.createActionButtonsController',
      'onboardingBodyCopyApi.createBodyCopyController',
      'onboardingCopyHeadingApi.createCopyHeadingController',
      'onboardingCursorLayerApi.createCursorLayerController',
      'onboardingInteractionsApi.createInteractionsController',
      'onboardingVisualSurfaceApi.createVisualSurfaceController',
      'tooltipView.renderBrowserAvatarTooltip('
    ].every((contract) => onboardingSource.includes(contract)),
  'Onboarding should install and consume every migrated React controller'
);
assert(
  !bundle.includes('process.env.NODE_ENV') &&
    !bundle.includes('sourceMappingURL=') &&
    !bootstrap.includes('sourceMappingURL=') &&
    !/\beval\(|new Function/.test(`${bundle}\n${bootstrap}`),
  'the extension bundle should be production-only, CSP-safe, and omit source maps'
);
assert(
  !/<script[^>]+src=["']https?:\/\//i.test(newtabHtml) &&
    !/<script[^>]+src=["']https?:\/\//i.test(optionsHtml) &&
    !/<script[^>]+src=["']https?:\/\//i.test(onboardingHtml),
  'MV3 pages should not load React or any script from a CDN'
);

console.log('React migration contract tests passed');
