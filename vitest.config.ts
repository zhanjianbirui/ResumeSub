import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/entrypoints/background.ts', 'src/extract/pdf-browser.ts', 'src/entrypoints/**/main.tsx', 'src/entrypoints/*.content.ts', 'src/**/*.css', 'src/**/*.html'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
