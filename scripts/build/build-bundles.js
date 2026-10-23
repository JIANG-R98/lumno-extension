'use strict';

// Builds the bundles listed in scripts/build/bundles.js into build/.
//   node scripts/build/build-bundles.js [--watch]
//   node scripts/build/build-bundles.js --store --outdir <dir>
// --store builds the store package's copies, minified.

const path = require('path');
const esbuild = require('esbuild');
const { BUNDLES, BUNDLE_DIRECTORY } = require('./bundles');

const repoRoot = path.resolve(__dirname, '..', '..');
const ENTRY_NAMESPACE = 'lumno-bundle';

const SHARED_MODULES_GLOBAL = 'LumnoSharedModules';
const SHARED_NAMESPACE = 'lumno-shared-module';

// A shared module's key, its path without src/ and .js, so the store checks do
// not read the keys as files the package must contain.
function sharedModuleKey(file) {
  return file.replace(/^src\//, '').replace(/\.js$/, '');
}

// A bundle's entry imports its files in order, for their side effects. A
// bundle that later bundles on the same page share from then publishes every
// module it runs in globalThis.LumnoSharedModules.
function bundleEntryPlugin(bundle, sharedModules) {
  return {
    name: 'lumno-bundle-entry',
    setup(build) {
      build.onResolve({ filter: /^lumno-bundle:/ }, (args) => ({
        path: args.path.slice('lumno-bundle:'.length),
        namespace: ENTRY_NAMESPACE
      }));
      build.onLoad({ filter: /.*/, namespace: ENTRY_NAMESPACE }, () => {
        const lines = bundle.files.map((file) => `import ${JSON.stringify(`./${file}`)};`);
        (sharedModules || []).forEach((file, index) => {
          lines.splice(index, 0, `import * as shared${index} from ${JSON.stringify(`./${file}`)};`);
        });
        if (sharedModules && sharedModules.length) {
          lines.push(`const shared = globalThis.${SHARED_MODULES_GLOBAL} || (globalThis.${SHARED_MODULES_GLOBAL} = {});`);
          sharedModules.forEach((file, index) => lines.push(`shared[${JSON.stringify(sharedModuleKey(file))}] = shared${index};`));
        }
        return { contents: lines.join('\n'), resolveDir: repoRoot, loader: 'js' };
      });
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
    setup(build) {
      build.onResolve({ filter: /^\.{1,2}\// }, (args) => {
        if (args.namespace !== 'file' && args.namespace !== ENTRY_NAMESPACE) return undefined;
        const file = path.relative(repoRoot, path.resolve(args.resolveDir, args.path)).split(path.sep).join('/');
        return external.has(file) ? { path: file, namespace: SHARED_NAMESPACE } : undefined;
      });
      build.onLoad({ filter: /.*/, namespace: SHARED_NAMESPACE }, (args) => ({
        contents: `module.exports = globalThis.${SHARED_MODULES_GLOBAL}[${JSON.stringify(sharedModuleKey(args.path))}];`,
        loader: 'js'
      }));
    }
  };
}

function bundleOptions({ bundle, outdir, minify, write, sharedModules, external }) {
  const plugins = [bundleEntryPlugin(bundle, sharedModules)];
  if (external && external.size) plugins.push(sharedModulesPlugin(external));
  return {
    absWorkingDir: repoRoot,
    entryPoints: { [bundle.name]: `lumno-bundle:${bundle.name}` },
    outdir,
    bundle: true,
    format: 'iife',
    target: ['chrome110', 'firefox140'],
    charset: 'utf8',
    minify: Boolean(minify),
    legalComments: minify ? 'none' : 'inline',
    sourcemap: minify ? false : 'linked',
    metafile: true,
    write,
    logLevel: 'warning',
    plugins
  };
}

const moduleInputs = (metafile) => Object.keys(metafile.inputs).filter((file) => /^src\/.*\.js$/.test(file));

// The modules each shared bundle runs, from a first build of it.
async function collectSharedModules(bundles, options) {
  const sharedNames = new Set(bundles.flatMap((bundle) => bundle.sharedFrom || []));
  const shared = new Map();
  await Promise.all(bundles.filter((bundle) => sharedNames.has(bundle.name)).map(async (bundle) => {
    const result = await esbuild.build(bundleOptions({ ...options, bundle, write: false }));
    shared.set(bundle.name, moduleInputs(result.metafile));
  }));
  return shared;
}

function optionsFor(bundle, shared, options) {
  const external = new Set((bundle.sharedFrom || []).flatMap((name) => shared.get(name) || []));
  return bundleOptions({ ...options, bundle, sharedModules: shared.get(bundle.name), external });
}

async function buildBundles(options = {}) {
  const common = {
    outdir: options.outdir || path.join(repoRoot, BUNDLE_DIRECTORY),
    minify: options.store === true,
    write: options.write !== false
  };
  const shared = await collectSharedModules(BUNDLES, common);
  const results = await Promise.all(BUNDLES.map((bundle) => esbuild.build(optionsFor(bundle, shared, common))));
  // One metafile for all of them, as a single build would give.
  const metafile = { inputs: {}, outputs: {} };
  const outputFiles = [];
  results.forEach((result) => {
    Object.assign(metafile.inputs, result.metafile.inputs);
    Object.assign(metafile.outputs, result.metafile.outputs);
    outputFiles.push(...(result.outputFiles || []));
  });
  return { metafile, outputFiles };
}

async function watchBundles() {
  const common = { outdir: path.join(repoRoot, BUNDLE_DIRECTORY), minify: false, write: true };
  const shared = await collectSharedModules(BUNDLES, common);
  const contexts = await Promise.all(BUNDLES.map((bundle) => esbuild.context(optionsFor(bundle, shared, common))));
  await Promise.all(contexts.map((context) => context.watch()));
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
    }).then((result) => {
      const outputs = Object.keys(result.metafile.outputs).filter((file) => file.endsWith('.js'));
      console.log(`Built ${outputs.length} bundles in ${outdir || BUNDLE_DIRECTORY}/.`);
    });
  run.catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = { buildBundles };
