import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'web', 'tests/e2e/**'],
    coverage: {
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts', 'shared/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/index.ts'],
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
