import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // The Sky Engine examples import the package by name, as a host would (see tsconfig.json paths).
  resolve: {
    alias: {
      '@orangely/sky-engine': fileURLToPath(new URL('./packages/sky-engine/src/index.ts', import.meta.url)),
    },
  },
  test: {
    restoreMocks: true,
    clearMocks: true,
    projects: [
      {
        // The Sky Engine package's own tests (npm run sdk:test): package sources only.
        test: {
          name: 'sdk',
          environment: 'node',
          include: ['packages/sky-engine/test/**/*.test.ts'],
          setupFiles: ['packages/sky-engine/test/setup.ts'],
        },
      },
      {
        test: {
          name: 'domain',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/persistence.test.ts'],
          setupFiles: ['tests/setupRuntime.ts'],
        },
      },
      {
        test: {
          name: 'interface',
          environment: 'jsdom',
          include: ['tests/**/*.test.tsx', 'tests/persistence.test.ts'],
          setupFiles: ['tests/setupRuntime.ts', 'tests/setup.ts'],
        },
      },
    ],
  },
});
