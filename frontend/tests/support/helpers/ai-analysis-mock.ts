import { Page, Route } from '@playwright/test';
import { makeUnique } from '../helpers';
import { SSEMocker } from './sse-mock';

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
  seller_link?: string | null;
  [key: string]: unknown;
}

export interface AiAnalysisCompletionOverrides {
  success?: boolean;
  analysis?: Partial<AiAnalysisResult> | null;
  error_message?: string | null;
}

export interface AiAnalysisAnalyzeResponse {
  task_id: string;
  stream_url: string;
  [key: string]: unknown;
}

export interface AiAnalysisMockOptions {
  analyzeMatcher?: string | RegExp;
  taskId?: string;
  streamPath?: string;
  streamPattern?: string | RegExp;
  analysisOverrides?: Partial<AiAnalysisResult>;
  analyzeResponseOverrides?: Partial<AiAnalysisAnalyzeResponse>;
}

export interface AiAnalysisMockSession {
  taskId: string;
  streamPath: string;
  analyzeResponse: AiAnalysisAnalyzeResponse;
  analysisTemplate: AiAnalysisResult;
  waitForConnection(options?: { timeout?: number }): Promise<void>;
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
  seller_link: null,
};

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, (character) => `\\${character}`);
}

async function fulfillAnalyzeRoute(
  route: Route,
  response: AiAnalysisAnalyzeResponse
): Promise<void> {
  // eslint-disable-next-line testing/no-route-mocks -- AI analysis SSE lacks deterministic backend stream
  await route.fulfill({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(response),
  });
}

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

export async function createAiAnalysisMock(
  page: Page,
  sseMocker: SSEMocker,
  options: AiAnalysisMockOptions = {}
): Promise<AiAnalysisMockSession> {
  const analyzeMatcher = options.analyzeMatcher ?? '**/api/ai-parts/analyze';
  const taskId = options.taskId ?? makeUnique('task');
  const streamPath = options.streamPath ?? `/tests/ai-stream/${taskId}`;
  const streamPattern = options.streamPattern ?? new RegExp(`${escapeForRegExp(streamPath)}$`);

  const analyzeResponse: AiAnalysisAnalyzeResponse = {
    task_id: taskId,
    stream_url: streamPath,
    ...options.analyzeResponseOverrides,
  };

  const analysisTemplate = mergeAnalysis(defaultAnalysis, options.analysisOverrides);

  let disposed = false;

  const analyzeHandler = async (route: Route) => {
    await fulfillAnalyzeRoute(route, analyzeResponse);
  };

  // eslint-disable-next-line testing/no-route-mocks -- AI analysis SSE lacks deterministic backend stream
  await page.route(analyzeMatcher, analyzeHandler, { times: 1 });

  // eslint-disable-next-line testing/no-route-mocks -- AI analysis SSE lacks deterministic backend stream
  await sseMocker.mockSSE({
    url: streamPattern,
    events: [],
  });

  const sendTaskEvent = async (payload: Record<string, unknown>) => {
    if (disposed) {
      throw new Error('AI analysis mock has been disposed');
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

  const emitCompleted = async (overrides?: AiAnalysisCompletionOverrides) => {
    const analysisOverride = overrides?.analysis;
    const analysisPayload = analysisOverride === null
      ? null
      : mergeAnalysis(analysisTemplate, analysisOverride);

    const completion = {
      success: overrides?.success ?? true,
      analysis: analysisPayload,
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

    await page.unroute(analyzeMatcher, analyzeHandler).catch(() => {
      /* ignore - route may already be removed */
    });

    await sseMocker.closeStreams(streamPattern).catch(() => {
      /* ignore - page context might be closed */
    });
  };

  return {
    taskId,
    streamPath,
    analyzeResponse,
    analysisTemplate,
    waitForConnection,
    emitStarted,
    emitProgress,
    emitCompleted,
    emitFailure,
    dispose,
  };
}
