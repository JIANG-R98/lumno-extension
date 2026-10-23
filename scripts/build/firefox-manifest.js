'use strict';

// The Firefox manifest, made from the Chrome store package's manifest.
// `lazyBackgroundDeps` are the scripts the service worker imports on first
// use (const *_SCRIPT_PATH in background.js); `importShim` replaces
// importScripts, which Firefox event pages lack.

// Chrome's defaults collide in Firefox-based browsers: Cmd/Ctrl+Shift+K and
// +C open DevTools, and Zen binds Cmd+Shift+K/L/C (K closes unpinned tabs).
// MacCtrl+Shift and Alt (as with the tab switcher) are free in both.
const FIREFOX_COMMAND_KEYS = {
  'show-search': { default: 'Alt+K', mac: 'MacCtrl+Shift+K' },
  'show-search-prefill': { default: 'Alt+L', mac: 'MacCtrl+Shift+L' },
  'show-search-prefill-v': { default: 'Alt+C', mac: 'MacCtrl+Shift+C' }
};

// Auto picture-in-picture needs requestPictureInPicture on web pages, which
// Firefox does not offer; its per-site content scripts would only add work.
const AUTO_PIP_SCRIPTS = ['build/site-auto-pip.js', 'build/youtube-auto-pip.js'];

function toFirefoxManifest(chromeManifest, options) {
  const { lazyBackgroundDeps, importShim } = options;
  const ffManifest = JSON.parse(JSON.stringify(chromeManifest));

  // Firefox MV3 has no service-worker background and no importScripts in
  // event pages: the background bundle runs as a background script, after
  // the scripts the service worker imports on first use.
  const backgroundEntry = ffManifest.background.service_worker;
  ffManifest.background = { scripts: [importShim, ...lazyBackgroundDeps, backgroundEntry] };

  ffManifest.browser_specific_settings = {
    gecko: {
      id: 'lumno@kubai087',
      strict_min_version: '140.0',
      data_collection_permissions: { required: ['none'] }
    }
  };

  Object.entries(FIREFOX_COMMAND_KEYS).forEach(([name, suggestedKey]) => {
    if (!ffManifest.commands[name]) {
      throw new Error(`Manifest command ${name} is missing.`);
    }
    ffManifest.commands[name].suggested_key = suggestedKey;
  });

  const contentScriptCount = ffManifest.content_scripts.length;
  ffManifest.content_scripts = ffManifest.content_scripts.filter((entry) =>
    !entry.js.some((script) => AUTO_PIP_SCRIPTS.includes(script)));
  if (contentScriptCount - ffManifest.content_scripts.length !== AUTO_PIP_SCRIPTS.length) {
    throw new Error('Expected one content_scripts entry per auto picture-in-picture script.');
  }

  // Chrome-only: the _favicon service permission and the font list the
  // overlay font picker reads. Firefox lists neither.
  ffManifest.permissions = ffManifest.permissions.filter(
    (permission) => permission !== 'favicon' && permission !== 'fontSettings');
  // Lets the New Tab focus swap drop the replaced tab from recently closed.
  ffManifest.permissions.push('sessions');
  // Lets the /appearance command switch Firefox's website appearance setting.
  ffManifest.permissions.push('browserSettings');

  return ffManifest;
}

module.exports = { toFirefoxManifest };
