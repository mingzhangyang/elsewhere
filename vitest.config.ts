import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    restoreMocks: true,
    clearMocks: true,
    projects: [
      {
        test: {
          name: 'domain',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/persistence.test.ts'],
        },
      },
      {
        test: {
          name: 'interface',
          environment: 'jsdom',
          include: ['tests/**/*.test.tsx', 'tests/persistence.test.ts'],
          setupFiles: ['tests/setup.ts'],
        },
      },
    ],
  },
});
