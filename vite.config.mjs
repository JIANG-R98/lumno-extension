import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import entries from './scripts/build/entries.js';
import { extensionOutputPath } from './scripts/build/extension-output.js';

// The build of every entry in scripts/build/entries.js, one Vite build per
// output: the page entries together, and the injected entries together, as
// ES modules that share chunks; each module entry on its own, as an ES
// module; each preload and classic entry on its own, as a self-contained
// classic script. scripts/build/build.js runs
// them all.

const { BUILD_DIRECTORY, ENTRIES } = entries;
const repoRoot = import.meta.dirname;
const TARGETS = ['chrome110', 'firefox140'];

// React's runtime gets a chunk of its own; Rolldown splits the rest by the
// set of pages that import each module, so a page loads only what it runs.
function pageChunkName(id) {
  return /\/node_modules\/(?:react|react-dom|scheduler)\//.test(id) ? 'react-runtime' : null;
}

function baseConfig({ outDir, store, watch }) {
  return {
    root: repoRoot,
    configFile: false,
    plugins: [react()],
    publicDir: false,
    logLevel: 'warn',
    define: {
      'process.env.NODE_ENV': JSON.stringify('production')
    },
    build: {
      target: TARGETS,
      outDir,
      emptyOutDir: false,
      copyPublicDir: false,
      reportCompressedSize: false,
      // Sizes are held by the bundle budgets (tests/repo/test-bundle-budgets.js).
      chunkSizeWarningLimit: 4096,
      minify: 'oxc',
      // The store package ships without source maps.
      sourcemap: !store,
      // A lazy chunk's imports are chunks its page has already loaded, and
      // Vite's preload helper would look for them at the extension root.
      modulePreload: false,
      watch: watch ? {} : null
    }
  };
}

function pagesConfig(options) {
  const config = baseConfig(options);
  const pages = ENTRIES.filter((entry) => entry.kind === 'page');
  config.build.rolldownOptions = {
    input: Object.fromEntries(pages.map((entry) => [entry.name, resolve(repoRoot, entry.source)])),
    output: {
      format: 'es',
      entryFileNames: '[name].js',
      chunkFileNames: 'chunks/[name].js',
      codeSplitting: {
        groups: [{ debugName: 'lumno-page-chunks', name: pageChunkName }]
      }
    }
  };
  return config;
}

// The scripts the worker injects into web pages: ES modules that share
// chunks with each other (never with the pages, which run in another origin).
function injectedConfig(options) {
  const config = baseConfig(options);
  const injected = ENTRIES.filter((entry) => entry.kind === 'injected');
  config.build.rolldownOptions = {
    input: Object.fromEntries(injected.map((entry) => [entry.name, resolve(repoRoot, entry.source)])),
    // The worker calls each one's run().
    preserveEntrySignatures: 'exports-only',
    output: {
      format: 'es',
      entryFileNames: 'injected/[name].js',
      chunkFileNames: 'injected/chunks/[name].js',
      codeSplitting: {
        groups: [{ debugName: 'lumno-injected-chunks', name: pageChunkName }]
      }
    }
  };
  return config;
}

function moduleConfig(entry, options) {
  const config = baseConfig(options);
  config.build.rolldownOptions = {
    input: { [entry.name]: resolve(repoRoot, entry.source) },
    preserveEntrySignatures: 'strict',
    output: {
      format: 'es',
      entryFileNames: '[name].js',
      codeSplitting: false
    }
  };
  return config;
}

function classicConfig(entry, options) {
  const config = baseConfig(options);
  config.build.rolldownOptions = {
    input: { [entry.name]: resolve(repoRoot, entry.source) },
    output: {
      format: 'iife',
      entryFileNames: '[name].js',
      codeSplitting: false
    }
  };
  return config;
}

// Every build, as Vite inline configs. options: outDir (the build folder;
// the development extension's by default), store (no source maps), watch.
export function createBuildConfigs(options = {}) {
  const resolved = {
    outDir: options.outDir || extensionOutputPath(BUILD_DIRECTORY),
    store: options.store === true,
    watch: options.watch === true
  };
  return [
    pagesConfig(resolved),
    injectedConfig(resolved),
    ...ENTRIES.filter((entry) => entry.kind === 'module').map((entry) => moduleConfig(entry, resolved)),
    ...ENTRIES.filter((entry) => entry.kind === 'preload' || entry.kind === 'classic')
      .map((entry) => classicConfig(entry, resolved))
  ];
}

export default pagesConfig({ outDir: extensionOutputPath(BUILD_DIRECTORY), store: false, watch: false });
