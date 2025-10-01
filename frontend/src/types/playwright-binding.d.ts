import type { TestEvent } from '@/types/test-events';

declare global {
  interface ImportMetaEnv {
    readonly VITE_TEST_MODE: 'true' | 'false';
  }
}

type TestModeEnabled = Extract<ImportMetaEnv['VITE_TEST_MODE'], 'true'> extends never ? false : true;

type PlaywrightEventBinding = TestModeEnabled extends true
  ? (event: TestEvent) => void | Promise<void>
  : never;

type PlaywrightResetDeploymentRequestIdBinding = TestModeEnabled extends true ? () => void : never;

declare global {
  interface Window {
    __playwright_emitTestEvent?: PlaywrightEventBinding;
    __resetDeploymentRequestId?: PlaywrightResetDeploymentRequestIdBinding;
  }
}

export {};
