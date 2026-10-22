import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const baseURL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    baseURL: baseURL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // NFR-01: the narrowest supported phone width.
    { name: 'mobile-360', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 780 } } },
  ],
  webServer: baseURL
    ? undefined
    : { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI },
});
