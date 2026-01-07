import { Page } from '@playwright/test';
import { DeploymentSseHelper } from './deployment-sse';
import { waitForSseEvent, extractSseData } from './test-events';

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

export interface AiCleanupMockOptions {
  cleanupOverrides?: Partial<AiCleanupResult>;
}

export interface AiCleanupMockSession {
  taskId: string | null;
  cleanupTemplate: AiCleanupResult;
  waitForTaskId(): Promise<string>;
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

export function createAiCleanupMock(
  page: Page,
  backendUrl: string,
  deploymentSse: DeploymentSseHelper,
  options: AiCleanupMockOptions = {}
): AiCleanupMockSession {
  const cleanupTemplate = mergeCleanup(defaultCleanup, options.cleanupOverrides);

  let disposed = false;
  let taskIdPromise: Promise<string> | null = null;
  let resolvedTaskId: string | null = null;

  // Lazy initialization: first call to any emission method creates taskIdPromise by waiting for task_subscription event; subsequent calls reuse the cached promise
  const ensureTaskId = async (): Promise<string> => {
    if (disposed) {
      throw new Error('AI cleanup mock has been disposed');
    }

    if (!taskIdPromise) {
      taskIdPromise = (async () => {
        const subscriptionEvent = await waitForSseEvent(page, {
          streamId: 'task',
          phase: 'open',
          event: 'task_subscription',
          timeoutMs: 10000,
        });

        const subscriptionData = extractSseData<{ taskId?: string }>(subscriptionEvent);
        const taskId = subscriptionData?.taskId;

        if (!taskId || typeof taskId !== 'string' || taskId.trim() === '') {
          throw new Error('Invalid task subscription event: taskId is missing or empty');
        }

        // Cache the resolved value for synchronous access via getter
        resolvedTaskId = taskId;
        return taskId;
      })();
    }

    return await taskIdPromise;
  };

  const sendTaskEvent = async (payload: {
    event_type: string;
    data: unknown;
  }): Promise<void> => {
    const taskId = await ensureTaskId();
    const requestId = await deploymentSse.getRequestId();

    if (!requestId) {
      throw new Error(
        'SSE connection lost or not established. Call deploymentSse.ensureConnected() and ensure connection remains active during test execution.'
      );
    }

    const response = await page.request.post(`${backendUrl}/api/testing/sse/task-event`, {
      data: {
        request_id: requestId,
        task_id: taskId,
        event_type: payload.event_type,
        data: payload.data,
      },
    });

    if (response.status() >= 400) {
      throw new Error(
        `Failed to send task event: ${payload.event_type} ` +
        `(status: ${response.status()}, request_id: ${requestId}, task_id: ${taskId})`
      );
    }
  };

  const waitForTaskId = async (): Promise<string> => {
    return await ensureTaskId();
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
      cleaned_part: cleanupPayload,
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
    // No cleanup needed - no routes or streams to close
  };

  return {
    get taskId() {
      // Return cached taskId if available, otherwise null
      return resolvedTaskId;
    },
    cleanupTemplate,
    waitForTaskId,
    emitStarted,
    emitProgress,
    emitCompleted,
    emitFailure,
    dispose,
  };
}
