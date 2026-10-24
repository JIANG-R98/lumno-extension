'use strict';

// Builds the bundles listed in scripts/build/bundles.js into build/ with
// Rolldown, the bundler Vite builds the React islands with.
//   node scripts/build/build-bundles.js [--watch]
//   node scripts/build/build-bundles.js --store --outdir <dir>
// --store builds the store package's copies, minified.

const fs = require('fs');
const path = require('path');
const { rolldown, watch } = require('rolldown');
const { BUNDLES, BUNDLE_DIRECTORY } = require('./bundles');

const repoRoot = path.resolve(__dirname, '..', '..');
const ENTRY_PREFIX = '\0lumno-bundle:';
const SHARED_PREFIX = '\0lumno-shared-module:';
const TARGETS = ['chrome110', 'firefox140'];

const SHARED_MODULES_GLOBAL = 'LumnoSharedModules';

// A shared module's key, its path without src/ and its extension, so the
// store checks do not read the keys as files the package must contain.
function sharedModuleKey(file) {
  return file.replace(/^src\//, '').replace(/\.(?:js|ts|tsx)$/, '');
}

const MODULE_EXTENSIONS = ['', '.ts', '.tsx', '.js'];

function toRepoPath(file) {
  return path.relative(repoRoot, file).split(path.sep).join('/');
}

// The repository path of the file an import names; imports of TypeScript
// modules leave out the extension.
function resolveImportedFile(base) {
  const file = MODULE_EXTENSIONS.map((extension) => base + extension)
    .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  return file ? toRepoPath(file) : null;
}

// A bundle's entry imports its files in order, for their side effects. A
// bundle that later bundles on the same page share from then publishes every
// module it runs in globalThis.LumnoSharedModules.
function bundleEntryPlugin(bundle, sharedModules) {
  const id = `${ENTRY_PREFIX}${bundle.name}`;
  return {
    name: 'lumno-bundle-entry',
    resolveId(source) {
      return source === id ? id : null;
    },
    load(loadId) {
      if (loadId !== id) return null;
      const lines = bundle.files.map((file) => `import ${JSON.stringify(path.join(repoRoot, file))};`);
      (sharedModules || []).forEach((file, index) => {
        lines.splice(index, 0, `import * as shared${index} from ${JSON.stringify(path.join(repoRoot, file))};`);
      });
      if (sharedModules && sharedModules.length) {
        lines.push(`const shared = globalThis.${SHARED_MODULES_GLOBAL} || (globalThis.${SHARED_MODULES_GLOBAL} = {});`);
        sharedModules.forEach((file, index) => lines.push(`shared[${JSON.stringify(sharedModuleKey(file))}] = shared${index};`));
      }
      return { code: lines.join('\n'), moduleType: 'js' };
    }
  };
}

// A later bundle on a page takes the modules an earlier one publishes from
// globalThis.LumnoSharedModules instead of building in copies of its own, so
// the page has one instance of each (settings' storage prefetch, the
// wallpaper effect renderer, ...).
function sharedModulesPlugin(external) {
  return {
    name: 'lumno-shared-modules',
    resolveId(source, importer) {
      let base = null;
      if (path.isAbsolute(source)) {
        base = source;
      } else if (/^\.{1,2}\//.test(source) && importer && !importer.startsWith('\0')) {
        base = path.resolve(path.dirname(importer), source);
      }
      const file = base && resolveImportedFile(base);
      return file && external.has(file) ? `${SHARED_PREFIX}${file}` : null;
    },
    load(id) {
      if (!id.startsWith(SHARED_PREFIX)) return null;
      const file = id.slice(SHARED_PREFIX.length);
      return {
        code: `module.exports = globalThis.${SHARED_MODULES_GLOBAL}[${JSON.stringify(sharedModuleKey(file))}];`,
        moduleType: 'js'
      };
    }
  };
}

function inputOptions({ bundle, sharedModules, external }) {
  const plugins = [bundleEntryPlugin(bundle, sharedModules)];
  if (external && external.size) plugins.unshift(sharedModulesPlugin(external));
  return {
    cwd: repoRoot,
    input: { [bundle.name]: `${ENTRY_PREFIX}${bundle.name}` },
    platform: 'browser',
    transform: { target: TARGETS },
    logLevel: 'warn',
    plugins
  };
}

function outputOptions({ outdir, minify }) {
  return {
    dir: outdir,
    format: 'iife',
    entryFileNames: '[name].js',
    charset: 'utf8',
    minify: Boolean(minify),
    comments: { legal: !minify },
    sourcemap: !minify
  };
}

// The source modules a bundle's output runs.
function moduleInputs(output) {
  return output.flatMap((chunk) => (chunk.type === 'chunk' ? chunk.moduleIds : []))
    .filter((id) => !id.startsWith('\0'))
    .map(toRepoPath)
    .filter((file) => /^src\/.*\.(?:js|ts|tsx)$/.test(file));
}

async function buildOne(bundle, options, extra = {}) {
  const build = await rolldown(inputOptions({ bundle, ...extra }));
  try {
    const output = options.write === false
      ? await build.generate(outputOptions(options))
      : await build.write(outputOptions(options));
    return output.output;
  } finally {
    await build.close();
  }
}

// The modules each shared bundle runs, from a first build of it.
async function collectSharedModules(bundles, options) {
  const sharedNames = new Set(bundles.flatMap((bundle) => bundle.sharedFrom || []));
  const shared = new Map();
  await Promise.all(bundles.filter((bundle) => sharedNames.has(bundle.name)).map(async (bundle) => {
    shared.set(bundle.name, moduleInputs(await buildOne(bundle, { ...options, write: false })));
  }));
  return shared;
}

function extraFor(bundle, shared) {
  const external = new Set((bundle.sharedFrom || []).flatMap((name) => shared.get(name) || []));
  return { sharedModules: shared.get(bundle.name), external };
}

async function buildBundles(options = {}) {
  const common = {
    outdir: options.outdir || path.join(repoRoot, BUNDLE_DIRECTORY),
    minify: options.store === true,
    write: options.write !== false
  };
  const shared = await collectSharedModules(BUNDLES, common);
  const outputs = await Promise.all(BUNDLES.map((bundle) => buildOne(bundle, common, extraFor(bundle, shared))));
  return outputs.flat();
}

async function watchBundles() {
  const common = { outdir: path.join(repoRoot, BUNDLE_DIRECTORY), minify: false };
  const shared = await collectSharedModules(BUNDLES, common);
  const watcher = watch(BUNDLES.map((bundle) => ({
    ...inputOptions({ bundle, ...extraFor(bundle, shared) }),
    output: outputOptions(common)
  })));
  watcher.on('event', (event) => {
    if (event.code === 'ERROR') {
      console.error(event.error && event.error.message ? event.error.message : event.error);
    }
    if (event.result && typeof event.result.close === 'function') {
      event.result.close();
    }
  });
  console.log(`Watching ${BUNDLES.length} bundles; output in ${BUNDLE_DIRECTORY}/.`);
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
      console.log(`Built ${bundles.length} bundles in ${outdir || BUNDLE_DIRECTORY}/.`);
    });
  run.catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = { buildBundles };
