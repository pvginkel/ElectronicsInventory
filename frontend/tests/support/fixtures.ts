import { test as base, expect } from '@playwright/test';
import { createApiClient, createTestDataBundle } from '../api';
import { TypesPage } from '../e2e/types/TypesPage';

type TestFixtures = {
  frontendUrl: string;
  backendUrl: string;
  sseTimeout: number;
  apiClient: ReturnType<typeof createApiClient>;
  testData: ReturnType<typeof createTestDataBundle>;
  types: TypesPage;
};

export const test = base.extend<TestFixtures>({
  frontendUrl: async ({}, use) => {
    const url = process.env.FRONTEND_URL || 'http://localhost:3100';
    await use(url);
  },

  backendUrl: async ({}, use) => {
    const url = process.env.BACKEND_URL || 'http://localhost:5100';
    await use(url);
  },

  sseTimeout: async ({}, use) => {
    // SSE-aware timeout for operations that may involve server-sent events
    await use(35000); // 35 seconds
  },

  apiClient: async ({}, use) => {
    const client = createApiClient();
    await use(client);
  },

  testData: async ({ apiClient }, use) => {
    const testData = createTestDataBundle(apiClient);
    await use(testData);
  },

  page: async ({ page }, use) => {
    // Track expected console errors for this test
    const expectedErrors: RegExp[] = [];

    // Add method to page for registering expected errors
    await page.exposeFunction('__registerExpectedError', (pattern: string) => {
      expectedErrors.push(new RegExp(pattern));
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();

        // Check if this error matches any expected patterns
        if (expectedErrors.some(pattern => pattern.test(text))) {
          // This error was expected, don't fail the test
          return;
        }

        // Legacy backwards compatibility - keep existing hardcoded patterns for now
        // These should eventually be replaced with explicit expectConsoleError calls
        if (text.includes('409') || text.includes('CONFLICT') ||
            text.includes('already exists') || text.includes('duplicate') ||
            text.includes('cannot delete') || text.includes('in use')) {
          // 409 errors and validation errors are expected for tests
          return;
        }
        // Ignore form submission errors for validation tests
        if (text.includes('Form submission error')) {
          return;
        }
        throw new Error(`Console error: ${text}`);
      }
    });
    page.on('pageerror', err => {
      throw err;
    });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addStyleTag({
      content: `*, *::before, *::after {
        transition-duration: 0s !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
      }`
    });

    // Clear expected errors after each test
    try {
      await use(page);
    } finally {
      expectedErrors.length = 0;
    }
  },

  types: async ({ page }, use) => {
    await use(new TypesPage(page));
  },
});

export { expect };