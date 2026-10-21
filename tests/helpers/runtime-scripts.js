'use strict';

// The files each runtime runs, in run order. Pages, manifest content scripts
// and the background's injection lists load bundles (scripts/build/bundles.js);
// these helpers expand every bundle into the source files it is built from, so
// checks can ask "does the overlay run X before Y" without parsing load lists.

const fs = require('fs');
const path = require('path');
const { BUNDLES, BUNDLE_DIRECTORY } = require('../../scripts/build/bundles');

const repoRoot = path.resolve(__dirname, '..', '..');
const bundlesByName = new Map(BUNDLES.map((bundle) => [bundle.name, bundle]));

function toRepoPath(file) {
  return path.relative(repoRoot, path.resolve(repoRoot, file)).split(path.sep).join('/');
}

function getBundle(name) {
  const bundle = bundlesByName.get(name);
  if (!bundle) {
    throw new Error(`No bundle named ${name} in scripts/build/bundles.js`);
  }
  return bundle;
}

function getBundleFiles(name) {
  return getBundle(name).files.slice();
}

// A loaded path: a bundle expands into its files, anything else stays as is.
function expandScriptPath(repoPath) {
  const match = repoPath.match(new RegExp(`^${BUNDLE_DIRECTORY}/([\\w-]+)\\.js$`));
  return match ? getBundleFiles(match[1]) : [repoPath];
}

function readScriptTags(html) {
  return [...html.matchAll(/<script\b([^>]*)>\s*<\/script>/g)].map((match) => {
    const attributes = {};
    for (const attribute of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) {
      attributes[attribute[1]] = attribute[2];
    }
    return attributes;
  });
}

// The scripts a page runs: its script tags in document order, and for the
// React page bootstrap, the page's React islands followed by its page bundle.
function getPageScripts(page) {
  const pagePath = toRepoPath(page);
  const html = fs.readFileSync(path.join(repoRoot, pagePath), 'utf8');
  const baseMatch = html.match(/<base href="([^"]+)"/);
  const baseDir = path.posix.join(path.posix.dirname(pagePath), baseMatch ? baseMatch[1] : '');
  const resolve = (from, src) => toRepoPath(path.posix.join(from, src));
  return readScriptTags(html).flatMap((attributes) => {
    const scriptPath = resolve(baseDir, attributes.src);
    const files = expandScriptPath(scriptPath);
    if (!attributes['data-page-entry']) {
      return files;
    }
    const scriptDir = path.posix.dirname(scriptPath);
    return files
      .concat(resolve(scriptDir, attributes['data-react-entry']))
      .concat(expandScriptPath(resolve(scriptDir, attributes['data-page-entry'])));
  });
}

function getManifestContentScripts() {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
  return manifest.content_scripts.map((entry) => entry.js.flatMap(expandScriptPath));
}

// The background's script lists, by the name of the constant or call that
// holds them, expanded into source files.
const INJECTION_LISTS = {
  overlay: ['src/background/overlay-open-service.js', /const overlayInjectionFiles = \[([\s\S]*?)\n {2}\];/],
  tabSwitcher: ['src/background/tab-switcher-service.js', /const runDynamicSwitcherScript[\s\S]*?files: \[([\s\S]*?)\]/],
  shortcutObserver: ['src/background/tab-switcher-service.js', /files: \[('build\/shortcut-key-observer\.js')\]/],
  documentPipPicker: ['src/background/pip-service.js', /const injectAndInvoke[\s\S]*?files: \[([\s\S]*?)\]/],
  copyUrlListener: ['src/background/command-service.js', /const COPY_URL_LISTENER_FILES = Object\.freeze\(\[([\s\S]*?)\]\)/],
  pageShortcutToast: ['src/background/page-shortcut-menu.js', /const TOAST_FILES = Object\.freeze\(\[([\s\S]*?)\]\)/],
  selectionQuickActions: ['src/background/selection-script-registration.js', /const SCRIPT_FILES = Object\.freeze\(\[([\s\S]*?)\]\)/]
};

function getInjectedScripts(listName) {
  const [file, pattern] = INJECTION_LISTS[listName] || [];
  if (!file) {
    throw new Error(`Unknown injection list ${listName}`);
  }
  const match = fs.readFileSync(path.join(repoRoot, file), 'utf8').match(pattern);
  if (!match) {
    throw new Error(`Could not find the ${listName} injection list in ${file}`);
  }
  return [...match[1].matchAll(/'((?:build|src|assets)\/[^']+\.js)'/g)]
    .flatMap((entry) => expandScriptPath(entry[1]));
}

// Asserts that `list` runs `first` before `second` (both must be present).
function runsBefore(list, first, second) {
  const firstIndex = list.indexOf(first);
  const secondIndex = list.indexOf(second);
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

module.exports = {
  getBundleFiles,
  getInjectedScripts,
  getManifestContentScripts,
  getPageScripts,
  runsBefore
};
