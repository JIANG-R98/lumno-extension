'use strict';

// The manifest each build ships, made from manifest.json in the repository
// (the development manifest for Chrome). The store package drops the
// development key; the Firefox build starts from the store manifest (see
// firefox-manifest.js and build-firefox.js).

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

function readSourceManifest() {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
}

function chromeManifest({ store = false } = {}) {
  const manifest = readSourceManifest();
  if (store) {
    delete manifest.key;
  }
  return manifest;
}

function writeManifest(outDir, manifest) {
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

module.exports = { chromeManifest, readSourceManifest, writeManifest };
