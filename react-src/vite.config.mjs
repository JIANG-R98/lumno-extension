import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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

const repoRoot = resolve(import.meta.dirname, '..');

export default defineConfig({
  root: repoRoot,
  plugins: [react()],
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  build: {
    target: 'chrome110',
    outDir: resolve(repoRoot, 'src/react'),
    emptyOutDir: true,
    copyPublicDir: false,
    sourcemap: false,
    minify: 'esbuild',
    // Minifying drops the dependencies' license comments, so their license
    // texts ship in this file instead (THIRD_PARTY_NOTICES.md points to it).
    license: { fileName: 'third-party-licenses.md' },
    rollupOptions: {
      input: {
        'newtab-islands': resolve(
          repoRoot,
          'react-src/newtab/react-islands-entry.ts'
        ),
        'options-islands': resolve(
          repoRoot,
          'react-src/options/options-islands-entry.ts'
        ),
        'onboarding-islands': resolve(
          repoRoot,
          'react-src/onboarding/onboarding-islands-entry.ts'
        ),
        'popup-islands': resolve(
          repoRoot,
          'react-src/popup/popup-islands-entry.ts'
        )
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        manualChunks(id, { getModuleInfo }) {
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'react-runtime';
          }
          // Only components more than one page uses belong in the shared
          // chunk; every page that loads it pays for all of it.
          if (
            id.includes('/react-src/shared/') &&
            getReachingEntries(id, getModuleInfo).size > 1
          ) {
            return 'react-shared';
          }
          if (id.includes('/react-src/overlay/tab-switcher.tsx')) {
            return 'tab-switcher-shared';
          }
          return undefined;
        }
      }
    }
  }
});
