import { useState, useCallback } from 'react';
import type { components } from '@/lib/api/generated/types';
import { useSSETask } from './use-sse-task';
import { transformAIPartAnalysisResult } from '@/lib/utils/ai-parts';
import { getApiBaseUrl } from '@/lib/utils/api-config';

type AIPartAnalysisResult = components['schemas']['AIPartAnalysisTaskResultSchema.63ff6da.AIPartAnalysisResultSchema'];

interface UseAIPartAnalysisOptions {
  onProgress?: (message: string, percentage?: number) => void;
  onSuccess?: (result: ReturnType<typeof transformAIPartAnalysisResult>) => void;
  onError?: (error: string) => void;
}

interface UseAIPartAnalysisReturn {
  analyzePartFromData: (data: { text: string }) => Promise<void>;
  cancelAnalysis: () => void;
  isAnalyzing: boolean;
  progress: { message: string; percentage?: number } | null;
  result: ReturnType<typeof transformAIPartAnalysisResult> | null;
  error: string | null;
}

export function useAIPartAnalysis(options: UseAIPartAnalysisOptions = {}): UseAIPartAnalysisReturn {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const baseUrl = getApiBaseUrl();
  
  const {
    connect: connectSSE,
    disconnect: disconnectSSE,
    progress,
    result: sseResult,
    error: sseError
  } = useSSETask<AIPartAnalysisResult>({
    onProgress: options.onProgress,
    onResult: <T>(data: T) => {
      const transformedResult = transformAIPartAnalysisResult(data as AIPartAnalysisResult);
      options.onSuccess?.(transformedResult);
      setIsAnalyzing(false);
    },
    onError: (message) => {
      options.onError?.(message);
      setIsAnalyzing(false);
    }
  });

  const analyzePartFromData = useCallback(async (data: { text: string }) => {
    if (isAnalyzing) {
      return;
    }

    if (!data.text) {
      options.onError?.('Text input is required');
      return;
    }

    try {
      setIsAnalyzing(true);
      
      // Submit JSON data to analyze endpoint
      const response = await fetch(`${baseUrl}/api/ai-parts/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: data.text,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Analysis request failed: ${errorData}`);
      }

      const responseData = await response.json();
      const analysisTaskId = responseData.task_id;
      const streamUrl = responseData.stream_url;
      
      if (!analysisTaskId || !streamUrl) {
        throw new Error('Invalid response: missing task_id or stream_url');
      }
      
      // Ensure stream URL is absolute
      const absoluteStreamUrl = streamUrl.startsWith('http') 
        ? streamUrl 
        : `${baseUrl}${streamUrl}`;
      
      // Connect to SSE stream for progress updates
      connectSSE(absoluteStreamUrl);
      
    } catch (error) {
      console.error('Failed to submit analysis request:', error);
      setIsAnalyzing(false);
      options.onError?.(error instanceof Error ? error.message : 'Failed to start analysis');
    }
  }, [isAnalyzing, connectSSE, options, baseUrl]);

  const cancelAnalysis = useCallback(() => {
    disconnectSSE();
    setIsAnalyzing(false);
  }, [disconnectSSE]);

  // Transform SSE result when available
  const result = sseResult ? transformAIPartAnalysisResult(sseResult) : null;
  const error = sseError;

  return {
    analyzePartFromData,
    cancelAnalysis,
    isAnalyzing,
    progress,
    result,
    error
  };
}