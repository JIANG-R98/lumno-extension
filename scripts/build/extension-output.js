'use strict';

// Where the build puts the unpacked extension, and which of its files come
// from the repository as they are.
//
// dist/chrome/ is the development extension: load it in chrome://extensions.
// It keeps the repository's layout, so page URLs (newtab.html,
// src/options/options.html, ...) are the same as in the store package. Two
// of its folders are build output: build/ (the bundles, see bundles.js) and
// src/react/ (the React islands Vite builds); everything else is copied.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const EXTENSION_OUTPUT = 'dist/chrome';
const BUILT_DIRECTORIES = ['build', 'src/react'];

// Copied from the repository, filtered by isExtensionFile.
const EXTENSION_ROOTS = [
  'newtab.html',
  'src',
  '_locales',
  'assets',
  // The GPL and the third-party licenses travel with every copy.
  'LICENSE',
  'THIRD_PARTY_NOTICES.md'
];

// Scripts pages and content scripts load by URL; every other script in src/
// runs from a bundle.
const SOURCE_RUNTIME_SCRIPTS = new Set([
  'src/shared/search/search-han-variants.js'
]);

function toRepoPath(file) {
  return path.relative(repoRoot, file).split(path.sep).join('/');
}

// Whether a repository file (or folder) belongs in the extension.
function isExtensionFile(repoPath) {
  if (BUILT_DIRECTORIES.some((directory) => repoPath === directory || repoPath.startsWith(`${directory}/`))) {
    return false;
  }
  if (path.basename(repoPath) === '.DS_Store') {
    return false;
  }
  // src/package.json only tells Node that the sources are ES modules.
  if (repoPath === 'src/package.json') {
    return false;
  }
  if (repoPath.startsWith('src/') && /\.(?:tsx?|js|mjs)$/.test(repoPath) && !SOURCE_RUNTIME_SCRIPTS.has(repoPath)) {
    return false;
  }
  return repoPath !== 'assets/images/readme' && !repoPath.startsWith('assets/images/readme/');
}

// Removes the folders under directory that hold no files, as the source
// folders of bundled modules do once filtered.
function removeEmptyDirectories(directory) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    if (entry.isDirectory()) {
      removeEmptyDirectories(path.join(directory, entry.name));
    }
  });
  if (fs.readdirSync(directory).length === 0) {
    fs.rmdirSync(directory);
  }
}

// Copies the repository's extension files into outDir.
function copyExtensionFiles(outDir) {
  EXTENSION_ROOTS.forEach((root) => {
    const target = path.join(outDir, root);
    fs.cpSync(path.join(repoRoot, root), target, {
      recursive: true,
      filter: (source) => isExtensionFile(toRepoPath(source))
    });
    if (fs.statSync(target).isDirectory()) {
      removeEmptyDirectories(target);
    }
  });
}

// A path inside the extension, as the development build has it on disk.
function extensionOutputPath(extensionPath) {
  return path.join(repoRoot, EXTENSION_OUTPUT, extensionPath);
}

// Where to read an extension file: build output from the development build,
// a copied file from the repository it is copied from.
function extensionFilePath(extensionPath) {
  const normalized = String(extensionPath).replace(/\\/g, '/').replace(/^\/+/, '');
  return BUILT_DIRECTORIES.some((directory) => normalized.startsWith(`${directory}/`))
    ? extensionOutputPath(normalized)
    : path.join(repoRoot, normalized);
}

module.exports = {
  BUILT_DIRECTORIES,
  EXTENSION_OUTPUT,
  EXTENSION_ROOTS,
  SOURCE_RUNTIME_SCRIPTS,
  copyExtensionFiles,
  extensionFilePath,
  extensionOutputPath,
  isExtensionFile
};
