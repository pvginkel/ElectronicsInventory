import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';

const testEnvPath = path.resolve(process.cwd(), '.env.test');
if (fs.existsSync(testEnvPath)) {
  config({ path: testEnvPath });
}

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3100';

const playwrightManagedServices = process.env.PLAYWRIGHT_MANAGED_SERVICES !== 'false';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }]
  ],

  webServer: playwrightManagedServices ? [
    {
      command: './scripts/testing-server.sh',
      port: 3100,
      timeout: 60 * 1000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: '../backend/scripts/testing-server.sh',
      port: 5100,
      timeout: 60 * 1000,
      reuseExistingServer: !process.env.CI,
    }
  ] : undefined,

  use: {
    baseURL: frontendUrl,
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },

  expect: {
    timeout: 10000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  outputDir: 'test-results/',

  globalSetup: './tests/support/global-setup.ts',
});