/**
 * Application test fixtures.
 * App-owned — extends infrastructure fixtures with domain-specific page objects
 * and test helpers. All test files import { test, expect } from this module.
 *
 * To add a new page object fixture:
 * 1. Create the page object class in tests/support/page-objects/
 * 2. Add the type to AppFixtures below
 * 3. Add the fixture setup in the .extend() call
 */

/* eslint-disable react-hooks/rules-of-hooks */
import { expect } from '@playwright/test';
import { createApiClient, createTestDataBundle } from '../api';
import { TypesPage } from './page-objects/TypesPage';
import { PartsPage } from './page-objects/parts-page';
import { BoxesPage } from './page-objects/boxes-page';
import { SellersPage } from './page-objects/sellers-page';
import { AIDialogPage } from './page-objects/ai-dialog-page';
import { LocationEditorPage } from './page-objects/location-editor-page';
import { DocumentGridPage } from './page-objects/document-grid-page';
import { AppShellPage } from './page-objects/app-shell-page';
import { AboutPage } from './page-objects/about-page';
import { ShoppingListsPage } from './page-objects/shopping-lists-page';
import { KitsPage } from './page-objects/kits-page';
import { PickListsPage } from './page-objects/pick-lists-page';
import { createAiAnalysisMock } from './helpers/ai-analysis-mock';
import type {
  AiAnalysisMockOptions,
  AiAnalysisMockSession,
} from './helpers/ai-analysis-mock';
import { createAiCleanupMock } from './helpers/ai-cleanup-mock';
import type {
  AiCleanupMockOptions,
  AiCleanupMockSession,
} from './helpers/ai-cleanup-mock';
import { infrastructureFixtures } from './fixtures-infrastructure';

type AppFixtures = {
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
  about: AboutPage;
  shoppingLists: ShoppingListsPage;
  kits: KitsPage;
  pickLists: PickListsPage;
  aiAnalysisMock: (
    options?: AiAnalysisMockOptions
  ) => AiAnalysisMockSession;
  aiCleanupMock: (
    options?: AiCleanupMockOptions
  ) => AiCleanupMockSession;
};

export const test = infrastructureFixtures.extend<AppFixtures>({
    apiClient: async ({ backendUrl }, use) => {
      const client = createApiClient({ baseUrl: backendUrl });
      await use(client);
    },

    testData: async ({ apiClient, backendUrl }, use) => {
      const testData = createTestDataBundle(apiClient, { backendUrl });
      await use(testData);
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

    kits: async ({ page }, use) => {
      await use(new KitsPage(page));
    },

    pickLists: async ({ page }, use) => {
      await use(new PickListsPage(page));
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

    about: async ({ page }, use) => {
      await use(new AboutPage(page));
    },

    shoppingLists: async ({ page }, use) => {
      await use(new ShoppingListsPage(page));
    },

    aiAnalysisMock: async ({ page, backendUrl, deploymentSse }, use) => {
      const sessions: AiAnalysisMockSession[] = [];

      const factory = (options?: AiAnalysisMockOptions) => {
        const session = createAiAnalysisMock(page, backendUrl, deploymentSse, options);
        sessions.push(session);
        return session;
      };

      try {
        await use(factory);
      } finally {
        await Promise.all(sessions.map(session => session.dispose()));
      }
    },

    aiCleanupMock: async ({ page, backendUrl, deploymentSse }, use) => {
      const sessions: AiCleanupMockSession[] = [];

      const factory = (options?: AiCleanupMockOptions) => {
        const session = createAiCleanupMock(page, backendUrl, deploymentSse, options);
        sessions.push(session);
        return session;
      };

      try {
        await use(factory);
      } finally {
        await Promise.all(sessions.map(session => session.dispose()));
      }
    },
  }
);

export { expect };
