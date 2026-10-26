import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['tests/react/setup.ts'],
    restoreMocks: true,
    // Whole-page tests such as the options page take several seconds each on
    // a hosted CI runner, past Vitest's 5 s default.
    testTimeout: 20000
  }
});
