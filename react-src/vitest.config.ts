import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: resolve(import.meta.dirname, '..'),
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['react-src/**/*.test.ts', 'react-src/**/*.test.tsx'],
    setupFiles: ['react-src/test/setup.ts'],
    restoreMocks: true
  }
});
