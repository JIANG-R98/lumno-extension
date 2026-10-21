import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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
    emptyOutDir: false,
    copyPublicDir: false,
    sourcemap: false,
    minify: 'esbuild',
    lib: {
      entry: resolve(
        repoRoot,
        'react-src/overlay/react-islands-entry.ts'
      ),
      formats: ['iife'],
      name: 'LumnoOverlayReactBundle',
      fileName: () => 'overlay-islands.js'
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
