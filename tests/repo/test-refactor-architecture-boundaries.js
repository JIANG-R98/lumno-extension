const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');

function collectFiles(directory, pattern) {
  const files = [];
  function visit(current) {
    fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        files.push(entryPath);
      }
    });
  }
  visit(path.join(repoRoot, directory));
  assert.ok(files.length > 0, `no files in ${directory} match ${pattern}`);
  return files;
}

function filesContaining(files, pattern) {
  return files
    .filter((file) => pattern.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(repoRoot, file).split(path.sep).join('/'))
    .sort();
}

const runtimeFiles = collectFiles('src', /\.(?:js|ts|tsx)$/);
assert.deepStrictEqual(
  filesContaining(runtimeFiles, /function getBrowserInternalScheme\(/),
  ['src/shared/browser-profile.js'],
  'browser detection belongs to the shared browser profile runtime'
);
assert.deepStrictEqual(
  filesContaining(runtimeFiles, /function getClientHintBrowserName\(/),
  ['src/shared/browser-profile.js'],
  'client-hint brand selection must not be copied into page entries'
);
assert.deepStrictEqual(
  filesContaining(runtimeFiles, /function parseShortcut\(/),
  ['src/shared/shortcut-key-matcher.js'],
  'configured shortcut parsing belongs to the shared matcher'
);
assert.deepStrictEqual(
  filesContaining(runtimeFiles, /function setBoundedCacheEntry\(/),
  ['src/shared/favicon/favicon-utils.js'],
  'bounded favicon cache writes belong to favicon-utils'
);
assert.deepStrictEqual(
  filesContaining(runtimeFiles, /function getFigmaFolderSvg\(/),
  ['src/newtab/bookmarks/bookmark-folder-icon.js'],
  'bookmark folder SVG and morph logic must stay out of the newtab entry'
);

// New Tab's site names and the overlay's storage listeners are checked at
// runtime: tests/shared/test-site-display-name.js and
// tests/overlay/test-overlay-session-teardown.js.
const onboardingReactFiles = collectFiles('react-src/onboarding', /\.tsx$/);
assert.deepStrictEqual(
  filesContaining(onboardingReactFiles, /function Icon\(/),
  [],
  'onboarding React surfaces should use the shared RemixIcon component'
);
console.log('refactor architecture boundary tests passed');
