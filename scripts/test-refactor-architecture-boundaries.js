const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

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
  return files;
}

function filesContaining(files, pattern) {
  return files
    .filter((file) => pattern.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(repoRoot, file).split(path.sep).join('/'))
    .sort();
}

const runtimeFiles = collectFiles('src', /\.js$/);
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
  filesContaining(runtimeFiles, /function parseFallbackShortcut\(/),
  [],
  'newtab fallback shortcuts must use the shared matcher'
);
assert.deepStrictEqual(
  filesContaining(runtimeFiles, /function shortcutMatchesEvent\(/),
  [],
  'shortcut event matching must not be copied into a page entry'
);
assert.deepStrictEqual(
  filesContaining(runtimeFiles, /function setBoundedCacheEntry\(/),
  ['src/shared/favicon-utils.js'],
  'bounded favicon cache writes belong to favicon-utils'
);
assert.deepStrictEqual(
  filesContaining(runtimeFiles, /function getFigmaFolderSvg\(/),
  ['src/newtab/bookmark-folder-icon.js'],
  'bookmark folder SVG and morph logic must stay out of the newtab entry'
);

const newtabSource = fs.readFileSync(path.join(repoRoot, 'src/newtab/newtab.js'), 'utf8');
assert.match(
  newtabSource,
  /SITE_DISPLAY_NAME\.getSiteDisplayName\([\s\S]*?SITE_DISPLAY_NAME_OPTIONS/
);
assert.doesNotMatch(newtabSource, /const brandMap = Object\.freeze\(/);

const overlaySource = fs.readFileSync(path.join(repoRoot, 'src/overlay/search-panel.js'), 'utf8');
assert.strictEqual((overlaySource.match(/storageChangeListeners\.add\(/g) || []).length, 18);
assert.strictEqual((overlaySource.match(/storageChangeListeners\.clear\(\)/g) || []).length, 1);
assert.doesNotMatch(overlaySource, /chrome\.storage\.onChanged\.(?:add|remove)Listener/);

const onboardingReactFiles = collectFiles('react-src/onboarding', /\.tsx$/);
assert.deepStrictEqual(
  filesContaining(onboardingReactFiles, /function Icon\(/),
  [],
  'onboarding React surfaces should use the shared RemixIcon component'
);
[
  'bookmark-focus-demo.tsx',
  'interactions.tsx',
  'newtab-preview.tsx',
  'site-search-demo.tsx'
].forEach((file) => {
  const source = fs.readFileSync(path.join(repoRoot, 'react-src/onboarding', file), 'utf8');
  assert.match(source, /RemixIcon as Icon/);
});

console.log('refactor architecture boundary tests passed');
