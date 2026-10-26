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
  ['src/platform/browser-profile.ts'],
  'browser detection belongs to the shared browser profile runtime'
);
assert.deepStrictEqual(
  filesContaining(runtimeFiles, /function getClientHintBrowserName\(/),
  ['src/platform/browser-profile.ts'],
  'client-hint brand selection must not be copied into page entries'
);
assert.deepStrictEqual(
  filesContaining(runtimeFiles, /function parseShortcut\(/),
  ['src/domain/shortcut-key-matcher.ts'],
  'configured shortcut parsing belongs to the shared matcher'
);
assert.deepStrictEqual(
  filesContaining(runtimeFiles, /function setBoundedCacheEntry\s*[<(]/),
  ['src/domain/bounded-cache.ts'],
  'bounded cache writes belong to the bounded cache module'
);
assert.deepStrictEqual(
  filesContaining(runtimeFiles, /function describeFolderIcon\(/),
  ['src/newtab/bookmarks/bookmark-folder-icon.ts'],
  'bookmark folder SVG and morph logic must stay out of the newtab entry'
);

// New Tab's site names and the overlay's storage listeners are checked at
// runtime: tests/shared/test-site-display-name.js and
// tests/overlay/test-overlay-session-teardown.js.
const onboardingReactFiles = collectFiles('src/onboarding/react', /\.tsx$/);
assert.deepStrictEqual(
  filesContaining(onboardingReactFiles, /function Icon\(/),
  [],
  'onboarding React surfaces should use the shared RemixIcon component'
);
console.log('refactor architecture boundary tests passed');
