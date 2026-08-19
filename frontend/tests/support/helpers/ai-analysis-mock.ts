import { Page } from '@playwright/test';
import { DeploymentSseHelper } from './deployment-sse';
import { waitForSseEvent, extractSseData } from './test-events';

interface AiAnalysisDocumentPreview {
  content_type: string;
  image_url: string | null;
  original_url: string;
  title: string;
}

interface AiAnalysisDocument {
  document_type: string;
  is_cover_image: boolean;
  url: string;
  preview: AiAnalysisDocumentPreview;
}

export interface AiAnalysisDuplicateEntry {
  part_key: string;
  confidence: 'high' | 'medium';
  reasoning: string;
}

export interface AiAnalysisResult {
  description: string;
  manufacturer: string | null;
  manufacturer_code: string | null;
  type: string;
  type_is_existing: boolean;
  existing_type_id: number | string | null;
  tags: string[];
  documents: AiAnalysisDocument[];
  dimensions: string | null;
  voltage_rating: string | null;
  mounting_type: string | null;
  package: string | null;
  pin_count: number | null;
  pin_pitch: string | null;
  series: string | null;
  input_voltage: string | null;
  output_voltage: string | null;
  product_page?: string | null;
  seller?: string | null;
  seller_is_existing?: boolean;
  existing_seller_id?: number | string | null;
  seller_link?: string | null;
  [key: string]: unknown;
}

export interface AiAnalysisCompletionOverrides {
  success?: boolean;
  analysis?: Partial<AiAnalysisResult> | null;
  duplicate_parts?: AiAnalysisDuplicateEntry[] | null;
  analysis_failure_reason?: string | null;
  error_message?: string | null;
}

export interface AiAnalysisMockOptions {
  analysisOverrides?: Partial<AiAnalysisResult>;
}

export interface AiAnalysisMockSession {
  taskId: string | null;
  analysisTemplate: AiAnalysisResult;
  waitForTaskId(): Promise<string>;
  emitStarted(): Promise<void>;
  emitProgress(text: string, value: number): Promise<void>;
  emitCompleted(overrides?: AiAnalysisCompletionOverrides): Promise<void>;
  emitFailure(message: string): Promise<void>;
  dispose(): Promise<void>;
}

const defaultAnalysis: AiAnalysisResult = {
  description: 'OMRON G5Q-1A4 relay',
  manufacturer: 'Omron',
  manufacturer_code: 'G5Q-1A4',
  type: 'Relay',
  type_is_existing: true,
  existing_type_id: null,
  tags: ['relay', '5V', 'SPDT'],
  documents: [
    {
      document_type: 'datasheet',
      is_cover_image: false,
      url: 'https://example.com/relay-datasheet.pdf',
      preview: {
        content_type: 'application/pdf',
        image_url: null,
        original_url: 'https://example.com/relay-datasheet.pdf',
        title: 'Relay Datasheet',
      },
    },
  ],
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

function mergeAnalysis(
  base: AiAnalysisResult,
  overrides?: Partial<AiAnalysisResult> | null
): AiAnalysisResult {
  if (!overrides) {
    return { ...base };
  }

  return {
    ...base,
    ...overrides,
  };
}

export function createAiAnalysisMock(
  page: Page,
  backendUrl: string,
  deploymentSse: DeploymentSseHelper,
  options: AiAnalysisMockOptions = {}
): AiAnalysisMockSession {
  const analysisTemplate = mergeAnalysis(defaultAnalysis, options.analysisOverrides);

  let disposed = false;
  let taskIdPromise: Promise<string> | null = null;
  let resolvedTaskId: string | null = null;

  // Lazy initialization: first call to any emission method creates taskIdPromise by waiting for task_subscription event; subsequent calls reuse the cached promise
  const ensureTaskId = async (): Promise<string> => {
    if (disposed) {
      throw new Error('AI analysis mock has been disposed');
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

  const emitCompleted = async (overrides?: AiAnalysisCompletionOverrides) => {
    const analysisOverride = overrides?.analysis;
    const analysisPayload = analysisOverride === null
      ? null
      : mergeAnalysis(analysisTemplate, analysisOverride);

    // Support nested structure with analysis_result, duplicate_parts, and analysis_failure_reason
    const analysisResult = analysisPayload ? {
      analysis_result: analysisPayload,
      duplicate_parts: overrides?.duplicate_parts ?? null,
      analysis_failure_reason: overrides?.analysis_failure_reason ?? null,
    } : {
      analysis_result: null,
      duplicate_parts: overrides?.duplicate_parts ?? null,
      analysis_failure_reason: overrides?.analysis_failure_reason ?? null,
    };

    const completion = {
      success: overrides?.success ?? true,
      analysis: analysisResult,
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
      analysis: null,
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
    analysisTemplate,
    waitForTaskId,
    emitStarted,
    emitProgress,
    emitCompleted,
    emitFailure,
    dispose,
  };
}
