import { test as base, expect } from '@playwright/test';
import { createApiClient, createTestDataBundle } from '../api';
import { TypesPage } from '../e2e/types/TypesPage';
import { PartsPage } from './page-objects/parts-page';
import { BoxesPage } from './page-objects/boxes-page';
import { SellersPage } from './page-objects/sellers-page';
import { AIDialogPage } from './page-objects/ai-dialog-page';
import { LocationEditorPage } from './page-objects/location-editor-page';
import { DocumentGridPage } from './page-objects/document-grid-page';
import { DashboardPage } from './page-objects/dashboard-page';
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
  boxes: BoxesPage;
  sellers: SellersPage;
  partsAI: AIDialogPage;
  partsLocations: LocationEditorPage;
  partsDocuments: DocumentGridPage;
  dashboard: DashboardPage;
  testEvents: TestEventCapture;
  toastHelper: ToastHelper;
  sseMocker: SSEMocker;
  fileUploadHelper: FileUploadHelper;
  aiAnalysisMock: (options?: AiAnalysisMockOptions) => Promise<AiAnalysisMockSession>;
};

export const test = base.extend<TestFixtures>({
  // eslint-disable-next-line no-empty-pattern
  frontendUrl: async ({}, provide) => {
    const url = process.env.FRONTEND_URL || 'http://localhost:3100';
    await provide(url);
  },

  // eslint-disable-next-line no-empty-pattern
  backendUrl: async ({}, provide) => {
    await provide(getBackendUrl());
  },

  // eslint-disable-next-line no-empty-pattern
  sseTimeout: async ({}, provide) => {
    // SSE-aware timeout for operations that may involve server-sent events
    await provide(35000); // 35 seconds
  },

  // eslint-disable-next-line no-empty-pattern
  apiClient: async ({}, provide) => {
    const client = createApiClient();
    await provide(client);
  },

  testData: async ({ apiClient }, provide) => {
    const testData = createTestDataBundle(apiClient);
    await provide(testData);
  },

  page: async ({ page }, provide) => {
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
    let overflowError: Error | null = null;
    try {
      await provide(page);
    } finally {
      overflowError = buffer.getOverflowError();
      expectedErrors.length = 0;
      releaseTestEventBridge(page);
    }

    if (overflowError) {
      throw overflowError;
    }
  },

  types: async ({ page }, provide) => {
    await provide(new TypesPage(page));
  },

  parts: async ({ page }, provide) => {
    await provide(new PartsPage(page));
  },

  boxes: async ({ page }, provide) => {
    await provide(new BoxesPage(page));
  },

  sellers: async ({ page }, provide) => {
    await provide(new SellersPage(page));
  },

  partsAI: async ({ page }, provide) => {
    await provide(new AIDialogPage(page));
  },

  partsLocations: async ({ page }, provide) => {
    await provide(new LocationEditorPage(page));
  },

  partsDocuments: async ({ page }, provide) => {
    await provide(new DocumentGridPage(page));
  },

  dashboard: async ({ page }, provide) => {
    await provide(new DashboardPage(page));
  },

  testEvents: async ({ page }, provide) => {
    const buffer = await ensureTestEventBridge(page);

    const testEvents = createTestEventCapture(page);
    await testEvents.startCapture();

    let overflowError: Error | null = null;
    try {
      await provide(testEvents);
    } finally {
      await testEvents.stopCapture();
      overflowError = buffer.getOverflowError();
    }

    if (overflowError) {
      throw overflowError;
    }
  },

  toastHelper: async ({ page }, provide) => {
    const toastHelper = createToastHelper(page);
    await provide(toastHelper);
  },

  sseMocker: async ({ page }, provide) => {
    const sseMocker = createSSEMocker(page);
    await sseMocker.setupSSEMonitoring();
    await provide(sseMocker);
    sseMocker.closeAllStreams();
  },

  aiAnalysisMock: async ({ page, sseMocker }, provide) => {
    const sessions: AiAnalysisMockSession[] = [];

    const factory = async (options?: AiAnalysisMockOptions) => {
      const session = await createAiAnalysisMock(page, sseMocker, options);
      sessions.push(session);
      return session;
    };

    try {
      await provide(factory);
    } finally {
      await Promise.all(sessions.map(session => session.dispose()));
    }
  },

  fileUploadHelper: async ({ page }, provide) => {
    const fileUploadHelper = createFileUploadHelper(page);
    await provide(fileUploadHelper);
  },
});

export { expect };
