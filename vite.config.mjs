import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { extensionOutputPath } from './scripts/build/extension-output.js';

// The page entries a module is reachable from, following static and dynamic
// importers up the graph.
function getReachingEntries(id, getModuleInfo, seen = new Set()) {
  const entries = new Set();
  if (seen.has(id)) {
    return entries;
  }
  seen.add(id);
  const info = getModuleInfo(id);
  if (!info) {
    return entries;
  }
  if (info.isEntry) {
    entries.add(id);
  }
  [...info.importers, ...info.dynamicImporters].forEach((importer) => {
    getReachingEntries(importer, getModuleInfo, seen).forEach((entry) => entries.add(entry));
  });
  return entries;
}

const repoRoot = import.meta.dirname;

export default defineConfig({
  root: repoRoot,
  plugins: [react()],
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  build: {
    target: 'chrome110',
    outDir: extensionOutputPath('src/react'),
    emptyOutDir: true,
    copyPublicDir: false,
    sourcemap: false,
    minify: 'oxc',
    // A lazy chunk's imports are chunks its page has already loaded, and
    // Vite's preload helper looks for them at the extension root instead of
    // src/react/; since Vite 8 it also needs import.meta.url, which the tests'
    // classic-script copies of these bundles don't have.
    modulePreload: false,
    // Minifying drops the dependencies' license comments, so their license
    // texts ship in this file instead (THIRD_PARTY_NOTICES.md points to it).
    license: { fileName: 'third-party-licenses.md' },
    rolldownOptions: {
      input: {
        'newtab-islands': resolve(
          repoRoot,
          'src/newtab/react/react-islands-entry.ts'
        ),
        'options-islands': resolve(
          repoRoot,
          'src/options/react/options-islands-entry.ts'
        ),
        'onboarding-islands': resolve(
          repoRoot,
          'src/onboarding/react/onboarding-islands-entry.ts'
        ),
        'popup-islands': resolve(
          repoRoot,
          'src/popup/react/popup-islands-entry.ts'
        )
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        codeSplitting: {
          groups: [
            {
              debugName: 'lumno-chunks',
              name(id, context) {
                if (
                  id.includes('/node_modules/react/') ||
                  id.includes('/node_modules/react-dom/') ||
                  id.includes('/node_modules/scheduler/')
                ) {
                  return 'react-runtime';
                }
                if (id.includes('/src/shared/react/tab-switcher.tsx')) {
                  return 'tab-switcher-shared';
                }
                // Only components more than one page uses belong in the shared
                // chunk; every page that loads it pays for all of it. The
                // suggestion list goes with the pages that show it.
                if (
                  id.includes('/src/shared/react/') &&
                  !id.includes('/src/shared/react/search/') &&
                  getReachingEntries(id, (moduleId) => context.getModuleInfo(moduleId)).size > 1
                ) {
                  return 'react-shared';
                }
                return null;
              }
            }
          ]
        }
      }
    }
  }
});
