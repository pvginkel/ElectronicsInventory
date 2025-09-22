import { test as base, expect } from '@playwright/test';
import { createApiClient, createTestDataBundle } from '../api';

type TestFixtures = {
  frontendUrl: string;
  backendUrl: string;
  sseTimeout: number;
  apiClient: ReturnType<typeof createApiClient>;
  testData: ReturnType<typeof createTestDataBundle>;
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
});

export { expect };