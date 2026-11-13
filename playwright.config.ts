import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run preview -- --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: '**/offline.spec.ts' },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: '**/offline.spec.ts' },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: '**/offline.spec.ts' },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, testIgnore: '**/offline.spec.ts' },
    {
      name: 'offline-chromium',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4173' },
      testMatch: '**/offline.spec.ts',
    },
  ],
});
