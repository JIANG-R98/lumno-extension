'use strict';

// The files each runtime runs, in run order. Pages, manifest content scripts
// and the background's injection lists load built entries
// (scripts/build/entries.js); these helpers expand every entry into the
// modules it runs, so checks can ask "does the overlay run X before Y"
// without parsing load lists.

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { BUNDLE_TSCONFIG_RAW } = require('./bundle-tsconfig');
const { execFileSync } = require('child_process');
const { BUILD_DIRECTORY, getEntry } = require('../../scripts/build/entries');

const repoRoot = path.resolve(__dirname, '..', '..');

function toRepoPath(file) {
  return path.relative(repoRoot, path.resolve(repoRoot, file)).split(path.sep).join('/');
}

// The modules an entry runs, in the order they run: each module after what
// it imports, in import order, as modules evaluate.
const bundleModules = new Map();
function getBundleFiles(name) {
  if (!bundleModules.has(name)) {
    const result = esbuild.buildSync({
      absWorkingDir: repoRoot,
      tsconfigRaw: BUNDLE_TSCONFIG_RAW,
      stdin: {
        contents: `import './${getEntry(name).source}';`,
        resolveDir: repoRoot,
        sourcefile: 'bundle-entry.js'
      },
      bundle: true,
      format: 'iife',
      metafile: true,
      outfile: 'bundle.js',
      write: false,
      logLevel: 'silent'
    });
    const { inputs } = result.metafile;
    const order = [];
    const seen = new Set();
    const visit = (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      inputs[file].imports.forEach((imported) => visit(imported.path));
      order.push(file);
    };
    visit('bundle-entry.js');
    bundleModules.set(name, order.filter((file) => file !== 'bundle-entry.js'));
  }
  return bundleModules.get(name).slice();
}

// A loaded path: a built entry expands into its modules, anything else stays
// as is.
function expandScriptPath(repoPath) {
  const match = repoPath.match(new RegExp(`^${BUILD_DIRECTORY}/([\\w-]+)\\.js$`));
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

// The scripts a page runs: its classic script tags in document order, then
// its module script, which runs once the markup is parsed.
function getPageScripts(page) {
  const pagePath = toRepoPath(page);
  const html = fs.readFileSync(path.join(repoRoot, pagePath), 'utf8');
  const baseMatch = html.match(/<base href="([^"]+)"/);
  const baseDir = path.posix.join(path.posix.dirname(pagePath), baseMatch ? baseMatch[1] : '');
  const resolve = (from, src) => toRepoPath(path.posix.join(from, src));
  const tags = readScriptTags(html);
  const ordered = tags.filter((attributes) => attributes.type !== 'module')
    .concat(tags.filter((attributes) => attributes.type === 'module'));
  return ordered.flatMap((attributes) => expandScriptPath(resolve(baseDir, attributes.src)));
}

function getManifestContentScripts() {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
  return manifest.content_scripts.map((entry) => entry.js.flatMap(expandScriptPath));
}

// The scripts the background injects into a web page, by list: overlay,
// tabSwitcher, shortcutObserver, copyUrlListener, documentPipPicker. They
// are recorded from the real worker (injection-lists-record.js boots it in a
// child process and runs each command against a fresh tab), then expanded
// into source files.
let injectionLists = null;
// The files as the background passes them (bundles not expanded).
function getInjectedFiles(listName) {
  if (!injectionLists) {
    injectionLists = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'injection-lists-record.js')], {
      cwd: repoRoot,
      encoding: 'utf8'
    }));
  }
  const files = injectionLists[listName];
  if (!Array.isArray(files)) {
    throw new Error(`The background injected no ${listName} scripts`);
  }
  return files.slice();
}

function getInjectedScripts(listName) {
  return getInjectedFiles(listName).flatMap(expandScriptPath);
}

// Asserts that `list` runs `first` before `second` (both must be present).
function runsBefore(list, first, second) {
  const firstIndex = list.indexOf(first);
  const secondIndex = list.indexOf(second);
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

module.exports = {
  getBundleFiles,
  getInjectedFiles,
  getInjectedScripts,
  getManifestContentScripts,
  getPageScripts,
  runsBefore
};
