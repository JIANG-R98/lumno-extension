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
  { name: 'background', files: ['src/background/background.ts'] },

  // New Tab
  {
    name: 'newtab-preload',
    files: [
      'src/shared/scrollbar-mode.ts',
      'src/platform/browser-profile.ts',
      'src/newtab/newtab-focus-entry.ts',
      'src/newtab/newtab-storage-prefetch.ts',
      'src/shared/motion-preload.ts',
      'src/newtab/wallpaper/wallpaper-preload.ts'
    ]
  },
  {
    name: 'wallpaper-effect-preload',
    files: ['src/newtab/wallpaper/wallpaper-effect-preload.ts'],
    sharedFrom: ['newtab-preload']
  },
  {
    name: 'newtab',
    sharedFrom: ['newtab-preload'],
    files: ['src/overlay/tab-switcher.ts', 'src/overlay/tab-switcher-page-bridge.ts', 'src/newtab/newtab.ts']
  },
  { name: 'newtab-route-redirect', files: ['src/newtab/newtab-route-redirect.ts'] },
  { name: 'lumno-newtab', files: ['src/newtab/lumno-newtab.ts'] },

  // Settings
  {
    name: 'options-preload',
    files: ['src/shared/icon-font-preload.ts', 'src/shared/scrollbar-mode.ts', 'src/options/theme-preload.ts']
  },
  {
    name: 'options',
    sharedFrom: ['options-preload'],
    files: ['src/overlay/tab-switcher.ts', 'src/overlay/tab-switcher-page-bridge.ts', 'src/options/options.ts']
  },

  // Onboarding: its demo overlay runs the overlay's search panel.
  { name: 'onboarding-preload', files: ['src/shared/scrollbar-mode.ts'] },
  {
    name: 'onboarding',
    sharedFrom: ['onboarding-preload', 'cjk-font-faces'],
    files: [
      'src/overlay/search-panel.ts',
      'src/overlay/tab-switcher.ts',
      'src/overlay/tab-switcher-page-bridge.ts',
      'src/onboarding/onboarding.ts'
    ]
  },

  // Toolbar popup
  { name: 'popup-preload', files: ['src/popup/popup-theme-preload.ts'] },
  { name: 'popup', sharedFrom: ['popup-preload'], files: ['src/popup/popup-page.ts'] },

  // Shared by the pages
  { name: 'cjk-font-faces', files: ['src/shared/cjk-font-faces.ts'] },
  { name: 'react-page-bootstrap', files: ['src/shared/react-page-bootstrap.ts'] },

  // Injected into web pages
  { name: 'icon-font-preload', files: ['src/shared/icon-font-preload.ts'] },
  { name: 'overlay', files: ['src/shared/cjk-font-faces.ts', 'src/overlay/search-panel.ts'] },
  { name: 'tab-switcher', files: ['src/overlay/tab-switcher.ts'] },
  { name: 'document-pip-picker', files: ['src/content/document-pip-picker.ts'] },
  { name: 'hotkey-listener', files: ['src/content/hotkey-listener.ts'] },
  { name: 'page-shortcut-toast', files: ['src/content/page-shortcut-toast.ts'] },
  { name: 'selection-quick-actions', files: ['src/content/selection-quick-actions.ts'] },
  { name: 'link-preview', files: ['src/content/link-preview.ts'] },

  // Manifest content scripts
  // The link preview's Shift+click trigger rides along: it needs the same
  // every-frame, document-start entry, and one script per frame costs less.
  {
    name: 'shortcut-key-observer',
    files: ['src/content/shortcut-key-observer.ts', 'src/content/link-preview-trigger.ts']
  },
  { name: 'site-auto-pip', files: ['src/content/auto-pip-blacklist.ts', 'src/content/site-auto-pip.ts'] },
  { name: 'youtube-auto-pip', files: ['src/content/youtube-auto-pip.ts'] }
];

module.exports = {
  BUNDLES,
  BUNDLE_DIRECTORY: 'build'
};
