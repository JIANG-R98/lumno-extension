'use strict';

// Builds the bundles listed in scripts/build/bundles.js into build/.
//   node scripts/build/build-bundles.js [--watch]
//   node scripts/build/build-bundles.js --store --outdir <dir>
// --store builds the store package's copies: minified, without the
// development-only bundles.

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { BUNDLES, BUNDLE_DIRECTORY } = require('./bundles');

const repoRoot = path.resolve(__dirname, '..', '..');
const ENTRY_NAMESPACE = 'lumno-bundle';

// Each bundle's entry imports its files in order, for their side effects.
function bundleEntryPlugin(bundles) {
  const byName = new Map(bundles.map((bundle) => [bundle.name, bundle]));
  return {
    name: 'lumno-bundle-entries',
    setup(build) {
      build.onResolve({ filter: /^lumno-bundle:/ }, (args) => ({
        path: args.path.slice('lumno-bundle:'.length),
        namespace: ENTRY_NAMESPACE
      }));
      build.onLoad({ filter: /.*/, namespace: ENTRY_NAMESPACE }, (args) => ({
        contents: byName.get(args.path).files
          .map((file) => `import ${JSON.stringify(`./${file}`)};`)
          .join('\n'),
        resolveDir: repoRoot,
        loader: 'js'
      }));
    }
  };
}

// The classic scripts tell Node (module.exports) from a page by checking
// typeof module. Bundled, each runs with module and exports undefined, as it
// would from a script tag.
function classicScriptPlugin() {
  return {
    name: 'lumno-classic-scripts',
    setup(build) {
      build.onLoad({ filter: /\.js$/ }, async (args) => {
        if (!args.path.startsWith(path.join(repoRoot, 'src') + path.sep)) return undefined;
        const source = await fs.promises.readFile(args.path, 'utf8');
        return { contents: `(function(module, exports) {\n${source}\n})();\n`, loader: 'js' };
      });
    }
  };
}

function bundleOptions({ bundles, outdir, minify, write }) {
  return {
    absWorkingDir: repoRoot,
    entryPoints: Object.fromEntries(bundles.map((bundle) => [bundle.name, `lumno-bundle:${bundle.name}`])),
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
    plugins: [bundleEntryPlugin(bundles), classicScriptPlugin()]
  };
}

async function buildBundles(options = {}) {
  const store = options.store === true;
  const bundles = BUNDLES.filter((bundle) => !(store && bundle.developmentOnly));
  return esbuild.build(bundleOptions({
    bundles,
    outdir: options.outdir || path.join(repoRoot, BUNDLE_DIRECTORY),
    minify: store,
    write: options.write !== false
  }));
}

async function watchBundles() {
  const context = await esbuild.context(bundleOptions({
    bundles: BUNDLES,
    outdir: path.join(repoRoot, BUNDLE_DIRECTORY),
    minify: false,
    write: true
  }));
  await context.watch();
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
