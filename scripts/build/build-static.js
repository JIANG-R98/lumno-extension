'use strict';

// Starts the development extension in dist/chrome/: copies the files that
// ship as they are (extension-output.js) and writes its manifest. The React
// islands and the bundles are built into it next (npm run build).
//   node scripts/build/build-static.js [--watch]
// --watch keeps copying the files as they change.

const fs = require('fs');
const path = require('path');
const {
  BUILT_DIRECTORIES,
  EXTENSION_OUTPUT,
  EXTENSION_ROOTS,
  copyExtensionFiles,
  isExtensionFile
} = require('./extension-output');
const { chromeManifest, writeManifest } = require('./manifests');

const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(repoRoot, EXTENSION_OUTPUT);

// Earlier builds wrote their output inside the repository.
function removeInTreeOutput() {
  BUILT_DIRECTORIES.forEach((directory) => {
    const inTree = path.join(repoRoot, directory);
    if (fs.existsSync(inTree)) {
      fs.rmSync(inTree, { recursive: true, force: true });
      console.log(`Removed ${directory}/, which builds now write to ${EXTENSION_OUTPUT}/.`);
    }
  });
}

function buildStatic() {
  removeInTreeOutput();
  // The built folders are left to their own builds, which empty them.
  if (fs.existsSync(outDir)) {
    fs.readdirSync(outDir).forEach((entry) => {
      if (entry !== 'build' && entry !== 'src') {
        fs.rmSync(path.join(outDir, entry), { recursive: true, force: true });
      }
    });
    const srcDir = path.join(outDir, 'src');
    if (fs.existsSync(srcDir)) {
      fs.readdirSync(srcDir).filter((entry) => entry !== 'react')
        .forEach((entry) => fs.rmSync(path.join(srcDir, entry), { recursive: true, force: true }));
    }
  }
  fs.mkdirSync(outDir, { recursive: true });
  copyExtensionFiles(outDir);
  writeManifest(outDir, chromeManifest());
}

function watchStatic() {
  const sync = (repoPath) => {
    if (repoPath === 'manifest.json') {
      writeManifest(outDir, chromeManifest());
      return;
    }
    if (!isExtensionFile(repoPath)) {
      return;
    }
    const source = path.join(repoRoot, repoPath);
    const target = path.join(outDir, repoPath);
    if (!fs.existsSync(source)) {
      fs.rmSync(target, { recursive: true, force: true });
    } else if (fs.statSync(source).isFile()) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
  };
  [...EXTENSION_ROOTS, 'manifest.json'].forEach((root) => {
    const full = path.join(repoRoot, root);
    const isDirectory = fs.statSync(full).isDirectory();
    fs.watch(full, { recursive: isDirectory }, (_event, name) => {
      if (!name) return;
      sync(isDirectory ? path.posix.join(root, String(name).split(path.sep).join('/')) : root);
    });
  });
  console.log(`Copying extension files into ${EXTENSION_OUTPUT}/ as they change.`);
}

if (require.main === module) {
  buildStatic();
  console.log(`Copied extension files into ${EXTENSION_OUTPUT}/.`);
  if (process.argv.includes('--watch')) {
    watchStatic();
  }
}

module.exports = { buildStatic };
