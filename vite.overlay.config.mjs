import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { extensionOutputPath } from './scripts/build/extension-output.js';

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
    emptyOutDir: false,
    copyPublicDir: false,
    sourcemap: false,
    minify: 'oxc',
    // The overlay bundle carries its own copy of React, so it lists the
    // licenses of what it bundles separately from the page chunks.
    license: { fileName: 'overlay-third-party-licenses.md' },
    lib: {
      entry: resolve(
        repoRoot,
        'src/overlay/react/react-islands-entry.ts'
      ),
      formats: ['iife'],
      name: 'LumnoOverlayReactBundle',
      fileName: () => 'overlay-islands.js'
    }
  }
});
