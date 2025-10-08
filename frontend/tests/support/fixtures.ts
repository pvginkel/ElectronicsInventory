/* eslint-disable react-hooks/rules-of-hooks, no-empty-pattern */
import { test as base, expect } from '@playwright/test';
import type { WorkerInfo } from '@playwright/test';
import { createApiClient, createTestDataBundle } from '../api';
import { TypesPage } from '../e2e/types/TypesPage';
import { PartsPage } from './page-objects/parts-page';
import { BoxesPage } from './page-objects/boxes-page';
import { SellersPage } from './page-objects/sellers-page';
import { AIDialogPage } from './page-objects/ai-dialog-page';
import { LocationEditorPage } from './page-objects/location-editor-page';
import { DocumentGridPage } from './page-objects/document-grid-page';
import { DashboardPage } from './page-objects/dashboard-page';
import { AppShellPage } from './page-objects/app-shell-page';
import { AboutPage } from './page-objects/about-page';
import {
  TestEventCapture,
  createTestEventCapture,
  ensureTestEventBridge,
  releaseTestEventBridge,
} from './helpers/test-events';
import { ToastHelper, createToastHelper } from './helpers/toast-helpers';
import { SSEMocker, createSSEMocker } from './helpers/sse-mock';
import {
  DeploymentSseHelper,
  createDeploymentSseHelper,
} from './helpers/deployment-sse';
import { createAiAnalysisMock } from './helpers/ai-analysis-mock';
import type {
  AiAnalysisMockOptions,
  AiAnalysisMockSession,
} from './helpers/ai-analysis-mock';
import { FileUploadHelper, createFileUploadHelper } from './helpers/file-upload';
import { startBackend } from './process/backend-server';
import { startFrontend } from './process/frontend-server';
import {
  createBackendLogCollector,
  type BackendLogCollector,
} from './process/backend-logs';

type ServiceManager = {
  backendUrl: string;
  frontendUrl: string;
  backendLogs: BackendLogCollector;
  disposeServices(): Promise<void>;
};

type TestFixtures = {
  frontendUrl: string;
  backendUrl: string;
  backendLogs: BackendLogCollector;
  sseTimeout: number;
  apiClient: ReturnType<typeof createApiClient>;
  testData: ReturnType<typeof createTestDataBundle>;
  types: TypesPage;
  appShell: AppShellPage;
  parts: PartsPage;
  boxes: BoxesPage;
  sellers: SellersPage;
  partsAI: AIDialogPage;
  partsLocations: LocationEditorPage;
  partsDocuments: DocumentGridPage;
  dashboard: DashboardPage;
  about: AboutPage;
  testEvents: TestEventCapture;
  toastHelper: ToastHelper;
  sseMocker: SSEMocker;
  fileUploadHelper: FileUploadHelper;
  aiAnalysisMock: (
    options?: AiAnalysisMockOptions
  ) => Promise<AiAnalysisMockSession>;
  deploymentSse: DeploymentSseHelper;
};

type InternalFixtures = {
  _serviceManager: ServiceManager;
};

export const test = base.extend<TestFixtures, InternalFixtures>({
    frontendUrl: async ({ _serviceManager }, use) => {
      await use(_serviceManager.frontendUrl);
    },

    backendUrl: async ({ _serviceManager }, use) => {
      await use(_serviceManager.backendUrl);
    },

    backendLogs: async ({ _serviceManager }, use, testInfo) => {
      const attachment = await _serviceManager.backendLogs.attachToTest(testInfo);
      try {
        await use(_serviceManager.backendLogs);
      } finally {
        await attachment.stop();
      }
    },

    baseURL: async ({ frontendUrl }, use) => {
      await use(frontendUrl);
    },

    sseTimeout: async ({}, use) => {
      await use(35_000);
    },

    apiClient: async ({ backendUrl }, use) => {
      const client = createApiClient({ baseUrl: backendUrl });
      await use(client);
    },

    testData: async ({ apiClient, backendUrl }, use) => {
      const testData = createTestDataBundle(apiClient, { backendUrl });
      await use(testData);
    },

    page: async ({ page, _serviceManager }, use) => {
      const expectedErrors: RegExp[] = [];
      const buffer = await ensureTestEventBridge(page);

      buffer.addEvent({
        kind: 'ui_state',
        scope: 'worker.services',
        phase: 'ready',
        metadata: {
          backendUrl: _serviceManager.backendUrl,
          frontendUrl: _serviceManager.frontendUrl,
        },
        timestamp: new Date().toISOString(),
      });

      await page.exposeFunction('__registerExpectedError', (pattern: string) => {
        expectedErrors.push(new RegExp(pattern));
      });

      page.on('console', msg => {
        if (msg.type() === 'error') {
          const text = msg.text();

          if (expectedErrors.some(pattern => pattern.test(text))) {
            return;
          }

          if (
            text.includes('409') ||
            text.includes('CONFLICT') ||
            text.includes('already exists') ||
            text.includes('duplicate') ||
            text.includes('cannot delete') ||
            text.includes('in use')
          ) {
            return;
          }

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
      }`,
      });

      let overflowError: Error | null = null;
      try {
        await use(page);
      } finally {
        overflowError = buffer.getOverflowError();
        expectedErrors.length = 0;
        releaseTestEventBridge(page);
      }

      if (overflowError) {
        throw overflowError;
      }
    },

    types: async ({ page }, use) => {
      await use(new TypesPage(page));
    },

    appShell: async ({ page }, use) => {
      await use(new AppShellPage(page));
    },

    parts: async ({ page }, use) => {
      await use(new PartsPage(page));
    },

    boxes: async ({ page }, use) => {
      await use(new BoxesPage(page));
    },

    sellers: async ({ page }, use) => {
      await use(new SellersPage(page));
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

    dashboard: async ({ page }, use) => {
      await use(new DashboardPage(page));
    },

    about: async ({ page }, use) => {
      await use(new AboutPage(page));
    },

    testEvents: async ({ page, _serviceManager }, use) => {
      const buffer = await ensureTestEventBridge(page);
      const testEvents = createTestEventCapture(page);
      await testEvents.startCapture();

      buffer.addEvent({
        kind: 'ui_state',
        scope: 'worker.services',
        phase: 'ready',
        metadata: {
          backendUrl: _serviceManager.backendUrl,
          frontendUrl: _serviceManager.frontendUrl,
        },
        timestamp: new Date().toISOString(),
      });

      let overflowError: Error | null = null;
      try {
        await use(testEvents);
      } finally {
        await testEvents.stopCapture();
        overflowError = buffer.getOverflowError();
      }

      if (overflowError) {
        throw overflowError;
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

    deploymentSse: async ({ page }, use) => {
      const helper = createDeploymentSseHelper(page);
      try {
        await use(helper);
      } finally {
        try {
          await helper.disconnect();
        } catch {
          // Ignore cleanup failures; the page may have navigated away.
        }
      }
    },
    _serviceManager: [
      async ({}, use: (value: ServiceManager) => Promise<void>, workerInfo: WorkerInfo) => {
        const managedServices =
          process.env.PLAYWRIGHT_MANAGED_SERVICES !== 'false';
        const streamLogs =
          process.env.PLAYWRIGHT_BACKEND_LOG_STREAM === 'true';
        const backendLogs = createBackendLogCollector({
          workerIndex: workerInfo.workerIndex,
          streamToConsole: streamLogs,
        });

        const previousBackend = process.env.BACKEND_URL;
        const previousFrontend = process.env.FRONTEND_URL;

        if (!managedServices) {
          const backendUrl =
            process.env.BACKEND_URL || 'http://localhost:5100';
          const frontendUrl =
            process.env.FRONTEND_URL || 'http://localhost:3100';

          backendLogs.log(
            'PLAYWRIGHT_MANAGED_SERVICES=false; using externally managed services.'
          );

          process.env.BACKEND_URL = backendUrl;
          process.env.FRONTEND_URL = frontendUrl;

          if (workerInfo.project?.use) {
            const projectUse = workerInfo.project.use as { baseURL?: string };
            projectUse.baseURL = frontendUrl;
          }

          const serviceManager: ServiceManager = {
            backendUrl,
            frontendUrl,
            backendLogs,
            disposeServices: async () => {},
          };

          try {
            await use(serviceManager);
          } finally {
            process.env.BACKEND_URL = previousBackend;
            process.env.FRONTEND_URL = previousFrontend;
            backendLogs.dispose();
          }
          return;
        }

        const backendPromise = startBackend(workerInfo.workerIndex);
        const backendReadyPromise = backendPromise.then(backendHandle => {
          backendLogs.attachStream(backendHandle.process.stdout, 'stdout');
          backendLogs.attachStream(backendHandle.process.stderr, 'stderr');
          backendLogs.log(`Backend listening on ${backendHandle.url}`);
          return backendHandle;
        });

        const frontendPromise = backendReadyPromise.then(async backendHandle => {
          try {
            return await startFrontend({
              workerIndex: workerInfo.workerIndex,
              backendUrl: backendHandle.url,
              excludePorts: [backendHandle.port],
            });
          } catch (error) {
            await backendHandle.dispose();
            throw error;
          }
        });

        let backend:
          | Awaited<ReturnType<typeof startBackend>>
          | undefined;
        let frontend:
          | Awaited<ReturnType<typeof startFrontend>>
          | undefined;

        try {
          [backend, frontend] = await Promise.all([
            backendReadyPromise,
            frontendPromise,
          ]);
        } catch (error) {
          backendLogs.dispose();
          throw error;
        }

        if (!backend || !frontend) {
          backendLogs.dispose();
          throw new Error(
            `[worker-${workerInfo.workerIndex}] Failed to start managed services`
          );
        }

        process.env.BACKEND_URL = backend.url;
        process.env.FRONTEND_URL = frontend.url;

        if (workerInfo.project?.use) {
          const projectUse = workerInfo.project.use as { baseURL?: string };
          projectUse.baseURL = frontend.url;
        }

        let disposed = false;
        const disposeServices = async () => {
          if (disposed) {
            return;
          }
          disposed = true;

          if (frontend) {
            try {
              await frontend.dispose();
            } catch (error) {
              console.warn(
                `[worker-${workerInfo.workerIndex}] Failed to dispose frontend:`,
                error
              );
            }
          }
          await backend.dispose();
        };

        const serviceManager: ServiceManager = {
          backendUrl: backend.url,
          frontendUrl: frontend.url,
          backendLogs,
          disposeServices,
        };

        try {
          await use(serviceManager);
        } finally {
          await disposeServices();
          process.env.BACKEND_URL = previousBackend;
          process.env.FRONTEND_URL = previousFrontend;
          backendLogs.dispose();
        }
      },
      { scope: 'worker', timeout: 120_000 },
    ],
  }
);

export { expect };
