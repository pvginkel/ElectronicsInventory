import { test as base, expect } from '@playwright/test';
import { createApiClient, createTestDataBundle } from '../api';
import { TypesPage } from '../e2e/types/TypesPage';
import { PartsPage } from './page-objects/parts-page';
import { AIDialogPage } from './page-objects/ai-dialog-page';
import { LocationEditorPage } from './page-objects/location-editor-page';
import { DocumentGridPage } from './page-objects/document-grid-page';
import { getBackendUrl } from './backend-url';
import {
  TestEventCapture,
  createTestEventCapture,
  ensureTestEventBridge,
  releaseTestEventBridge,
} from './helpers/test-events';
import { ToastHelper, createToastHelper } from './helpers/toast-helpers';
import { SSEMocker, createSSEMocker } from './helpers/sse-mock';
import { createAiAnalysisMock } from './helpers/ai-analysis-mock';
import type {
  AiAnalysisMockOptions,
  AiAnalysisMockSession,
} from './helpers/ai-analysis-mock';
import { FileUploadHelper, createFileUploadHelper } from './helpers/file-upload';

type TestFixtures = {
  frontendUrl: string;
  backendUrl: string;
  sseTimeout: number;
  apiClient: ReturnType<typeof createApiClient>;
  testData: ReturnType<typeof createTestDataBundle>;
  types: TypesPage;
  parts: PartsPage;
  partsAI: AIDialogPage;
  partsLocations: LocationEditorPage;
  partsDocuments: DocumentGridPage;
  testEvents: TestEventCapture;
  toastHelper: ToastHelper;
  sseMocker: SSEMocker;
  fileUploadHelper: FileUploadHelper;
  aiAnalysisMock: (options?: AiAnalysisMockOptions) => Promise<AiAnalysisMockSession>;
};

export const test = base.extend<TestFixtures>({
  frontendUrl: async ({}, use) => {
    const url = process.env.FRONTEND_URL || 'http://localhost:3100';
    await use(url);
  },

  backendUrl: async ({}, use) => {
    await use(getBackendUrl());
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

    const buffer = await ensureTestEventBridge(page);

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
      // Check for buffer overflow before cleanup
      const overflowError = buffer.getOverflowError();
      if (overflowError) {
        throw overflowError;
      }
      expectedErrors.length = 0;
      releaseTestEventBridge(page);
    }
  },

  types: async ({ page }, use) => {
    await use(new TypesPage(page));
  },

  parts: async ({ page }, use) => {
    await use(new PartsPage(page));
  },

  partsAI: async ({ page }, use) => {
    await use(new AIDialogPage(page));
  },

  partsLocations: async ({ page }, use) => {
    await use(new LocationEditorPage(page));
  },

  partsDocuments: async ({ page }, use) => {
    await use(new DocumentGridPage(page));
  },

  testEvents: async ({ page }, use) => {
    const buffer = await ensureTestEventBridge(page);

    const testEvents = createTestEventCapture(page);
    await testEvents.startCapture();

    try {
      await use(testEvents);
    } finally {
      await testEvents.stopCapture();

      // Check for buffer overflow
      const overflowError = buffer.getOverflowError();
      if (overflowError) {
        throw overflowError;
      }
    }
  },

  toastHelper: async ({ page }, use) => {
    const toastHelper = createToastHelper(page);
    await use(toastHelper);
  },

  sseMocker: async ({ page }, use) => {
    const sseMocker = createSSEMocker(page);
    await sseMocker.setupSSEMonitoring();
    await use(sseMocker);
    sseMocker.closeAllStreams();
  },

  aiAnalysisMock: async ({ page, sseMocker }, use) => {
    const sessions: AiAnalysisMockSession[] = [];

    const factory = async (options?: AiAnalysisMockOptions) => {
      const session = await createAiAnalysisMock(page, sseMocker, options);
      sessions.push(session);
      return session;
    };

    try {
      await use(factory);
    } finally {
      await Promise.all(sessions.map(session => session.dispose()));
    }
  },

  fileUploadHelper: async ({ page }, use) => {
    const fileUploadHelper = createFileUploadHelper(page);
    await use(fileUploadHelper);
  },
});

export { expect };
