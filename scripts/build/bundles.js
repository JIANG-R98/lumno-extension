'use strict';

// Every script the extension runs is one of these bundles, built by esbuild
// (scripts/build/build-bundles.js) into build/<name>.js. A bundle runs the
// modules in its files list, in order, with everything they import; pages,
// the manifest and the background's injection lists load the bundle instead.
//
// A page loads its preload bundle from <head> before first paint, and the
// React page bootstrap loads its page bundle once the page's React islands
// are ready. Injected and content scripts load one bundle each, after
// src/react/overlay-islands.js where they draw React views.
//
// sharedFrom names bundles the page loads before this one: this bundle uses
// their instances of the modules they run instead of copies of its own.

const BUNDLES = [
  // The service worker
  { name: 'background', files: ['src/background/background.js'] },

  // New Tab
  {
    name: 'newtab-preload',
    files: [
      'src/shared/scrollbar-mode.js',
      'src/shared/browser-profile.js',
      'src/newtab/newtab-focus-entry.js',
      'src/newtab/newtab-storage-prefetch.js',
      'src/shared/motion-preload.js',
      'src/newtab/wallpaper/wallpaper-preload.js'
    ]
  },
  {
    name: 'wallpaper-effect-preload',
    files: ['src/newtab/wallpaper/wallpaper-effect-preload.js'],
    sharedFrom: ['newtab-preload']
  },
  {
    name: 'newtab',
    sharedFrom: ['newtab-preload'],
    files: ['src/overlay/tab-switcher.js', 'src/overlay/tab-switcher-page-bridge.js', 'src/newtab/newtab.js']
  },
  { name: 'newtab-route-redirect', files: ['src/newtab/newtab-route-redirect.js'] },
  { name: 'lumno-newtab', files: ['src/newtab/lumno-newtab.js'] },

  // Settings
  {
    name: 'options-preload',
    files: ['src/shared/icon-font-preload.js', 'src/shared/scrollbar-mode.js', 'src/options/theme-preload.js']
  },
  {
    name: 'options',
    sharedFrom: ['options-preload'],
    files: ['src/overlay/tab-switcher.js', 'src/overlay/tab-switcher-page-bridge.js', 'src/options/options.js']
  },

  // Onboarding: its demo overlay runs the overlay's search panel.
  { name: 'onboarding-preload', files: ['src/shared/scrollbar-mode.js'] },
  {
    name: 'onboarding',
    sharedFrom: ['onboarding-preload', 'cjk-font-faces'],
    files: [
      'src/overlay/search-panel.js',
      'src/overlay/tab-switcher.js',
      'src/overlay/tab-switcher-page-bridge.js',
      'src/onboarding/onboarding.js'
    ]
  },

  // Toolbar popup
  { name: 'popup-preload', files: ['src/popup/popup-theme-preload.js'] },
  { name: 'popup', sharedFrom: ['popup-preload'], files: ['src/popup/popup-page.js'] },

  // Shared by the pages
  { name: 'cjk-font-faces', files: ['src/shared/cjk-font-faces.js'] },
  { name: 'react-page-bootstrap', files: ['src/shared/react-page-bootstrap.js'] },
  { name: 'codex-debug-surface', files: ['src/shared/codex-debug-surface-start.js'], developmentOnly: true },

  // Injected into web pages
  { name: 'icon-font-preload', files: ['src/shared/icon-font-preload.js'] },
  { name: 'overlay', files: ['src/shared/cjk-font-faces.js', 'src/overlay/search-panel.js'] },
  { name: 'tab-switcher', files: ['src/overlay/tab-switcher.js'] },
  { name: 'document-pip-picker', files: ['src/content/document-pip-picker.js'] },
  { name: 'hotkey-listener', files: ['src/content/hotkey-listener.js'] },
  { name: 'page-shortcut-toast', files: ['src/content/page-shortcut-toast.js'] },
  { name: 'selection-quick-actions', files: ['src/content/selection-quick-actions.js'] },

  // Manifest content scripts
  { name: 'shortcut-key-observer', files: ['src/content/shortcut-key-observer.js'] },
  { name: 'site-auto-pip', files: ['src/content/auto-pip-blacklist.js', 'src/content/site-auto-pip.js'] },
  { name: 'youtube-auto-pip', files: ['src/content/youtube-auto-pip.js'] }
];

// Modules the store package's bundles leave out (stand-ins export only names),
// and the module whose DEVELOPMENT_BUILD flag the store build turns off.
const DEVELOPMENT_ONLY_MODULES = [
  'src/background/codex-debug-bridge.js',
  'src/shared/codex-debug-surface.js'
];
const BUILD_FLAGS_MODULE = 'src/shared/build-flags.js';

module.exports = {
  BUNDLES,
  BUNDLE_DIRECTORY: 'build',
  BUILD_FLAGS_MODULE,
  DEVELOPMENT_ONLY_MODULES
};
