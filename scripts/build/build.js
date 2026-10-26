'use strict';

// Builds every entry in scripts/build/entries.js with Vite (vite.config.mjs)
// into the development extension's build/ folder (dist/chrome/build/), and
// writes the license texts of the npm packages the output carries.
//   node scripts/build/build.js [--watch]
//   node scripts/build/build.js --store --outdir <dir>
// --store leaves out source maps, for the store package.

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { BUILD_DIRECTORY, ENTRIES } = require('./entries');
const { EXTENSION_OUTPUT, extensionOutputPath } = require('./extension-output');

const repoRoot = path.resolve(__dirname, '..', '..');
const LICENSE_FILE_NAME = 'third-party-licenses.md';

// The npm packages the output carries, by name, with their package folders.
function bundledPackages(chunks) {
  const packages = new Map();
  chunks.flatMap((chunk) => chunk.moduleIds || []).forEach((id) => {
    const match = id.split(path.sep).join('/').match(/^(.*\/node_modules\/)((?:@[^/]+\/)?[^/]+)\//);
    if (match && !packages.has(match[2])) {
      packages.set(match[2], path.join(match[1], match[2]));
    }
  });
  return packages;
}

// The license texts of the npm packages the output carries; minifying drops
// their license comments, so their texts ship in this file instead.
function licenseFileContent(packages) {
  const sections = Array.from(packages.keys()).sort().map((name) => {
    const directory = packages.get(name);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
    const licenseFile = fs.readdirSync(directory).find((file) => /^licen[cs]e(?:\.|$)/i.test(file));
    if (!licenseFile) {
      throw new Error(`${name} ships no license file to copy.`);
    }
    const text = fs.readFileSync(path.join(directory, licenseFile), 'utf8').trim();
    return `## ${name} - ${manifest.version} (${manifest.license})\n\n${text}\n`;
  });
  return `# Licenses\n\nThe scripts in this folder contain these dependencies, under these licenses:\n\n${sections.join('\n')}`;
}

function outputChunks(result) {
  return (Array.isArray(result) ? result : [result])
    .flatMap((output) => output.output || [])
    .filter((file) => file.type === 'chunk');
}

async function loadBuildConfigs(options) {
  const { createBuildConfigs } = await import(pathToFileURL(path.join(repoRoot, 'vite.config.mjs')).href);
  return createBuildConfigs(options);
}

async function buildExtension(options = {}) {
  const outDir = options.outdir || extensionOutputPath(BUILD_DIRECTORY);
  const { build } = await import('vite');
  fs.rmSync(outDir, { recursive: true, force: true });
  const configs = await loadBuildConfigs({ outDir, store: options.store === true });
  const results = await Promise.all(configs.map((config) => build(config)));
  const chunks = results.flatMap(outputChunks);
  fs.writeFileSync(path.join(outDir, LICENSE_FILE_NAME), licenseFileContent(bundledPackages(chunks)));
  return chunks;
}

async function watchExtension() {
  const outDir = extensionOutputPath(BUILD_DIRECTORY);
  const { build } = await import('vite');
  const configs = await loadBuildConfigs({ outDir, watch: true });
  await Promise.all(configs.map((config) => build(config)));
  console.log(`Watching ${ENTRIES.length} entries; output in ${EXTENSION_OUTPUT}/${BUILD_DIRECTORY}/.`);
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (require.main === module) {
  const outdir = readOption('--outdir');
  const run = process.argv.includes('--watch')
    ? watchExtension()
    : buildExtension({
      store: process.argv.includes('--store'),
      outdir: outdir ? path.resolve(outdir) : undefined
    }).then((chunks) => {
      const entryCount = chunks.filter((chunk) => chunk.isEntry).length;
      console.log(`Built ${entryCount} entries in ${outdir || `${EXTENSION_OUTPUT}/${BUILD_DIRECTORY}`}/.`);
    });
  run.catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = { buildExtension, LICENSE_FILE_NAME };
