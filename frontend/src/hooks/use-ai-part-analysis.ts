import { useState, useCallback } from 'react';
import type { components } from '@/lib/api/generated/types';
import type { TransformedAIPartAnalysisResult } from '@/types/ai-parts';
import { useSSETask } from './use-sse-task';
import { transformAIPartAnalysisResult } from '@/lib/utils/ai-parts';
import { emitComponentError } from '@/lib/test/error-instrumentation';

type AIPartAnalysisResult = components['schemas']['AIPartAnalysisTaskResultSchema.63ff6da.AIPartAnalysisResultSchema'];

interface UseAIPartAnalysisOptions {
  onProgress?: (message: string, percentage?: number) => void;
  onSuccess?: (result: TransformedAIPartAnalysisResult) => void;
  onError?: (error: string) => void;
}

interface UseAIPartAnalysisReturn {
  analyzePartFromData: (data: { text?: string; image?: File }) => Promise<void>;
  cancelAnalysis: () => void;
  isAnalyzing: boolean;
  progress: { message: string; percentage?: number } | null;
  result: TransformedAIPartAnalysisResult | null;
  error: string | null;
}

export function useAIPartAnalysis(options: UseAIPartAnalysisOptions = {}): UseAIPartAnalysisReturn {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    subscribeToTask,
    unsubscribe: unsubscribeSSE,
    progress,
    result: sseResult
  } = useSSETask<AIPartAnalysisResult>({
    onProgress: options.onProgress,
    onResult: <T>(data: T) => {
      const transformedResult = transformAIPartAnalysisResult(data as AIPartAnalysisResult);

      // Guidepost: Differentiate between hard and soft failures
      // - Hard failure: analysisFailureReason present AND no analysis data (description absent)
      // - Soft failure: analysisFailureReason present BUT analysis data exists (description present)

      const hasFailureReason = !!transformedResult.analysisFailureReason?.trim();
      const hasAnalysisData = !!transformedResult.description;

      // Route to error only for hard failures (failure reason without analysis data)
      if (hasFailureReason && !hasAnalysisData) {
        const failureMessage = transformedResult.analysisFailureReason!;
        emitComponentError(new Error(failureMessage), 'ai-part-analysis');
        setError(failureMessage);
        options.onError?.(failureMessage);
        setIsAnalyzing(false);
        return;
      }

      // Success path: route to review/duplicates
      // This includes both normal success and soft failures (partial results with warning)
      setError(null);
      options.onSuccess?.(transformedResult);
      setIsAnalyzing(false);
    },
    onError: (message) => {
      emitComponentError(new Error(message), 'ai-part-analysis');
      setError(message);
      options.onError?.(message);
      setIsAnalyzing(false);
    }
  });

  const analyzePartFromData = useCallback(async (data: { text?: string; image?: File }) => {
    if (isAnalyzing) {
      return;
    }

    if (!data.text && !data.image) {
      const errorMessage = 'Either text or image must be provided';
      setError(errorMessage);
      options.onError?.(errorMessage);
      return;
    }

    try {
      setIsAnalyzing(true);
      setError(null);
      
      // Create FormData for multipart submission
      const formData = new FormData();
      
      if (data.text) {
        formData.append('text', data.text);
      }
      
      if (data.image) {
        formData.append('image', data.image);
      }

      // Submit to analyze endpoint
      const response = await fetch('/api/ai-parts/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Analysis request failed: ${errorData}`);
      }

      const responseData = await response.json();
      const taskId = responseData.task_id;

      if (!taskId) {
        throw new Error('Invalid response: missing task_id');
      }

      // Subscribe to task events via unified SSE stream
      subscribeToTask(taskId);
      
    } catch (error) {
      console.error('Failed to submit analysis request:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start analysis';
      setIsAnalyzing(false);
      setError(errorMessage);
      if (error instanceof Error) {
        emitComponentError(error, 'ai-part-analysis');
      } else {
        emitComponentError(new Error(String(error)), 'ai-part-analysis');
      }
      options.onError?.(errorMessage);
    }
  }, [isAnalyzing, subscribeToTask, options]);

  const cancelAnalysis = useCallback(() => {
    unsubscribeSSE();
    setIsAnalyzing(false);
    setError(null);
  }, [unsubscribeSSE]);

  // Transform SSE result when available
  const result = sseResult ? transformAIPartAnalysisResult(sseResult) : null;

  return {
    analyzePartFromData,
    cancelAnalysis,
    isAnalyzing,
    progress,
    result,
    error
  };
}
