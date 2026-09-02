import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  build: {
    target: 'chrome110',
    outDir: resolve(import.meta.dirname, 'src/react'),
    emptyOutDir: true,
    copyPublicDir: false,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      input: {
        'newtab-islands': resolve(
          import.meta.dirname,
          'react-src/newtab/react-islands-entry.ts'
        ),
        'options-islands': resolve(
          import.meta.dirname,
          'react-src/options/options-islands-entry.ts'
        ),
        'onboarding-islands': resolve(
          import.meta.dirname,
          'react-src/onboarding/onboarding-islands-entry.ts'
        ),
        'popup-islands': resolve(
          import.meta.dirname,
          'react-src/popup/popup-islands-entry.ts'
        )
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        manualChunks(id) {
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'react-runtime';
          }
          if (id.includes('/react-src/shared/')) {
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
