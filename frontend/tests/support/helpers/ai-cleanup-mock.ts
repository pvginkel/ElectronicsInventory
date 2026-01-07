import { Page, Route } from '@playwright/test';
import { makeUnique } from '../helpers';
import { SSEMocker } from './sse-mock';

export interface AiCleanupResult {
  key: string;
  description: string | null;
  manufacturer_code: string | null;
  manufacturer: string | null;
  product_page: string | null;
  seller_link: string | null;
  dimensions: string | null;
  package: string | null;
  pin_count: number | null;
  pin_pitch: string | null;
  mounting_type: string | null;
  series: string | null;
  voltage_rating: string | null;
  input_voltage: string | null;
  output_voltage: string | null;
  type: string | null;
  type_is_existing: boolean;
  existing_type_id: number | null;
  seller: string | null;
  seller_is_existing: boolean;
  existing_seller_id: number | null;
  tags: string[];
  [key: string]: unknown;
}

export interface AiCleanupCompletionOverrides {
  success?: boolean;
  cleaned_part?: Partial<AiCleanupResult> | null;
  error_message?: string | null;
}

export interface AiCleanupCleanupResponse {
  task_id: string;
  stream_url: string;
  [key: string]: unknown;
}

export interface AiCleanupMockOptions {
  cleanupMatcher?: string | RegExp;
  taskId?: string;
  streamPath?: string;
  streamPattern?: string | RegExp;
  cleanupOverrides?: Partial<AiCleanupResult>;
  cleanupResponseOverrides?: Partial<AiCleanupCleanupResponse>;
}

export interface AiCleanupMockSession {
  taskId: string;
  streamPath: string;
  cleanupResponse: AiCleanupCleanupResponse;
  cleanupTemplate: AiCleanupResult;
  waitForConnection(options?: { timeout?: number }): Promise<void>;
  emitStarted(): Promise<void>;
  emitProgress(text: string, value: number): Promise<void>;
  emitCompleted(overrides?: AiCleanupCompletionOverrides): Promise<void>;
  emitFailure(message: string): Promise<void>;
  dispose(): Promise<void>;
}

const defaultCleanup: AiCleanupResult = {
  key: 'test-part-key',
  description: 'OMRON G5Q-1A4 relay',
  manufacturer: 'Omron',
  manufacturer_code: 'G5Q-1A4',
  type: 'Relay',
  type_is_existing: true,
  existing_type_id: null,
  tags: ['relay', '5V', 'SPDT'],
  dimensions: '29x12.7x15.8mm',
  voltage_rating: '5V',
  mounting_type: 'Through-hole',
  package: 'DIP',
  pin_count: 5,
  pin_pitch: '2.54mm',
  series: 'G5Q',
  input_voltage: '5V DC',
  output_voltage: null,
  product_page: 'https://example.com/relay',
  seller: null,
  seller_is_existing: false,
  existing_seller_id: null,
  seller_link: null,
};

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, (character) => `\\${character}`);
}

async function fulfillCleanupRoute(
  route: Route,
  response: AiCleanupCleanupResponse
): Promise<void> {
  // eslint-disable-next-line testing/no-route-mocks -- AI cleanup SSE lacks deterministic backend stream
  await route.fulfill({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(response),
  });
}

function mergeCleanup(
  base: AiCleanupResult,
  overrides?: Partial<AiCleanupResult> | null
): AiCleanupResult {
  if (!overrides) {
    return { ...base };
  }

  return {
    ...base,
    ...overrides,
  };
}

export async function createAiCleanupMock(
  page: Page,
  sseMocker: SSEMocker,
  options: AiCleanupMockOptions = {}
): Promise<AiCleanupMockSession> {
  const cleanupMatcher = options.cleanupMatcher ?? '**/api/ai-parts/cleanup';
  const taskId = options.taskId ?? makeUnique('cleanup-task');
  const streamPath = options.streamPath ?? `/tests/ai-stream/${taskId}`;
  const streamPattern = options.streamPattern ?? new RegExp(`${escapeForRegExp(streamPath)}$`);

  const cleanupResponse: AiCleanupCleanupResponse = {
    task_id: taskId,
    stream_url: streamPath,
    ...options.cleanupResponseOverrides,
  };

  const cleanupTemplate = mergeCleanup(defaultCleanup, options.cleanupOverrides);

  let disposed = false;

  const cleanupHandler = async (route: Route) => {
    await fulfillCleanupRoute(route, cleanupResponse);
  };

  // eslint-disable-next-line testing/no-route-mocks -- AI cleanup SSE lacks deterministic backend stream
  await page.route(cleanupMatcher, cleanupHandler, { times: 1 });

  // eslint-disable-next-line testing/no-route-mocks -- AI cleanup SSE lacks deterministic backend stream
  await sseMocker.mockSSE({
    url: streamPattern,
    events: [],
  });

  const sendTaskEvent = async (payload: Record<string, unknown>) => {
    if (disposed) {
      throw new Error('AI cleanup mock has been disposed');
    }

    await sseMocker.sendEvent(streamPattern, {
      event: 'task_event',
      data: {
        task_id: taskId,
        timestamp: new Date().toISOString(),
        ...payload,
      },
    });
  };

  const waitForConnection = async (options?: { timeout?: number }) => {
    await sseMocker.waitForConnection(streamPattern, options);
  };

  const emitStarted = async () => {
    await sendTaskEvent({
      event_type: 'task_started',
      data: null,
    });
  };

  const emitProgress = async (text: string, value: number) => {
    await sendTaskEvent({
      event_type: 'progress_update',
      data: {
        text,
        value,
      },
    });
  };

  const emitCompleted = async (overrides?: AiCleanupCompletionOverrides) => {
    const cleanupOverride = overrides?.cleaned_part;
    const cleanupPayload = cleanupOverride === null
      ? null
      : mergeCleanup(cleanupTemplate, cleanupOverride);

    const completion = {
      success: overrides?.success ?? true,
      analysis: cleanupPayload ? { cleaned_part: cleanupPayload } : null,
      error_message: overrides?.error_message ?? null,
    };

    await sendTaskEvent({
      event_type: 'task_completed',
      data: completion,
    });
  };

  const emitFailure = async (message: string) => {
    await emitCompleted({
      success: false,
      cleaned_part: null,
      error_message: message,
    });
  };

  const dispose = async () => {
    if (disposed) {
      return;
    }
    disposed = true;

    await page.unroute(cleanupMatcher, cleanupHandler).catch(() => {
      /* ignore - route may already be removed */
    });

    await sseMocker.closeStreams(streamPattern).catch(() => {
      /* ignore - page context might be closed */
    });
  };

  return {
    taskId,
    streamPath,
    cleanupResponse,
    cleanupTemplate,
    waitForConnection,
    emitStarted,
    emitProgress,
    emitCompleted,
    emitFailure,
    dispose,
  };
}
