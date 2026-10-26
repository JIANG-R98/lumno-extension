'use strict';

// Builds the bundles listed in scripts/build/bundles.js with Rolldown, the
// bundler Vite builds the React islands with, into the development
// extension's build/ folder (dist/chrome/build/).
//   node scripts/build/build-bundles.js [--watch]
//   node scripts/build/build-bundles.js --store --outdir <dir>
// --store builds the store package's copies, minified.

const fs = require('fs');
const path = require('path');
const { rolldown, watch } = require('rolldown');
const { BUNDLES, BUNDLE_DIRECTORY } = require('./bundles');
const { EXTENSION_OUTPUT, extensionOutputPath } = require('./extension-output');

const repoRoot = path.resolve(__dirname, '..', '..');
const ENTRY_PREFIX = '\0lumno-bundle:';
const TARGETS = ['chrome110', 'firefox140'];

const LICENSE_FILE_NAME = 'third-party-licenses.md';

// A bundle's entry imports its files in order: an ES module bundle
// re-exports them, a classic one runs them for their side effects.
function bundleEntryPlugin(bundle) {
  const id = `${ENTRY_PREFIX}${bundle.name}`;
  return {
    name: 'lumno-bundle-entry',
    resolveId(source) {
      return source === id ? id : null;
    },
    load(loadId) {
      if (loadId !== id) return null;
      const lines = bundle.files.map((file) => (bundle.format === 'es'
        ? `export * from ${JSON.stringify(path.join(repoRoot, file))};`
        : `import ${JSON.stringify(path.join(repoRoot, file))};`));
      return { code: lines.join('\n'), moduleType: 'js' };
    }
  };
}

function inputOptions(bundle) {
  return {
    cwd: repoRoot,
    input: { [bundle.name]: `${ENTRY_PREFIX}${bundle.name}` },
    platform: 'browser',
    transform: { target: TARGETS },
    logLevel: 'warn',
    plugins: [bundleEntryPlugin(bundle)]
  };
}

function outputOptions({ outdir, minify }, bundle) {
  return {
    dir: outdir,
    format: bundle.format || 'iife',
    entryFileNames: '[name].js',
    charset: 'utf8',
    minify: Boolean(minify),
    comments: { legal: !minify },
    sourcemap: !minify
  };
}

async function buildOne(bundle, options) {
  const build = await rolldown(inputOptions(bundle));
  try {
    const output = options.write === false
      ? await build.generate(outputOptions(options, bundle))
      : await build.write(outputOptions(options, bundle));
    return output.output;
  } finally {
    await build.close();
  }
}

// The npm packages the bundles carry, by name, with their package folders.
function bundledPackages(output) {
  const packages = new Map();
  output.flatMap((chunk) => (chunk.type === 'chunk' ? chunk.moduleIds : [])).forEach((id) => {
    const match = id.split(path.sep).join('/').match(/^(.*\/node_modules\/)((?:@[^/]+\/)?[^/]+)\//);
    if (match && !packages.has(match[2])) {
      packages.set(match[2], path.join(match[1], match[2]));
    }
  });
  return packages;
}

// The license texts of the npm packages the bundles carry, in the format Vite
// writes for the React bundles, since minifying drops their license comments.
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
  return `# Licenses\n\nThe bundles in this folder contain these dependencies, under these licenses:\n\n${sections.join('\n')}`;
}

async function buildBundles(options = {}) {
  const common = {
    outdir: options.outdir || extensionOutputPath(BUNDLE_DIRECTORY),
    minify: options.store === true,
    write: options.write !== false
  };
  const outputs = (await Promise.all(BUNDLES.map((bundle) => buildOne(bundle, common)))).flat();
  if (common.write) {
    fs.writeFileSync(path.join(common.outdir, LICENSE_FILE_NAME), licenseFileContent(bundledPackages(outputs)));
  }
  return outputs;
}

async function watchBundles() {
  const common = { outdir: extensionOutputPath(BUNDLE_DIRECTORY), minify: false };
  const watcher = watch(BUNDLES.map((bundle) => ({
    ...inputOptions(bundle),
    output: outputOptions(common, bundle)
  })));
  watcher.on('event', (event) => {
    if (event.code === 'ERROR') {
      console.error(event.error && event.error.message ? event.error.message : event.error);
    }
    if (event.result && typeof event.result.close === 'function') {
      event.result.close();
    }
  });
  console.log(`Watching ${BUNDLES.length} bundles; output in ${EXTENSION_OUTPUT}/${BUNDLE_DIRECTORY}/.`);
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (require.main === module) {
  const outdir = readOption('--outdir');
  const run = process.argv.includes('--watch')
    ? watchBundles()
    : buildBundles({
      store: process.argv.includes('--store'),
      outdir: outdir ? path.resolve(outdir) : undefined
    }).then((output) => {
      const bundles = output.filter((file) => file.type === 'chunk');
      console.log(`Built ${bundles.length} bundles in ${outdir || `${EXTENSION_OUTPUT}/${BUNDLE_DIRECTORY}`}/.`);
    });
  run.catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = { buildBundles };
