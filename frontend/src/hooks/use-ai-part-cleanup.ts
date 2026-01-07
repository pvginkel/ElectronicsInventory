import { useState, useCallback } from 'react';
import type { TransformedCleanupResult } from '@/types/ai-parts';
import { useSSETask } from './use-sse-task';
import { transformCleanupResult } from '@/lib/utils/ai-parts';
import { emitComponentError } from '@/lib/test/error-instrumentation';

interface CleanupTaskResult {
  cleaned_part: {
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
  };
}

interface UseAIPartCleanupOptions {
  onProgress?: (message: string, percentage?: number) => void;
  onSuccess?: (result: TransformedCleanupResult) => void;
  onError?: (error: string) => void;
}

interface UseAIPartCleanupReturn {
  startCleanup: (partKey: string) => Promise<void>;
  cancelCleanup: () => void;
  isCleaningUp: boolean;
  progress: { message: string; percentage?: number } | null;
  result: TransformedCleanupResult | null;
  error: string | null;
}

export function useAIPartCleanup(options: UseAIPartCleanupOptions = {}): UseAIPartCleanupReturn {
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransformedCleanupResult | null>(null);
  const [requestedPartKey, setRequestedPartKey] = useState<string | null>(null);

  const {
    subscribeToTask,
    unsubscribe: unsubscribeSSE,
    progress
  } = useSSETask<CleanupTaskResult>({
    onProgress: options.onProgress,
    onResult: <T>(data: T) => {
      const transformedResult = transformCleanupResult(data as CleanupTaskResult);

      // Guidepost: Validate that cleanup result key matches requested part key
      // This prevents applying changes to wrong part due to backend bugs or race conditions
      if (requestedPartKey && transformedResult.cleanedPart.key !== requestedPartKey) {
        const errorMessage = `Cleanup result key mismatch: expected ${requestedPartKey}, got ${transformedResult.cleanedPart.key}`;
        emitComponentError(new Error(errorMessage), 'ai-part-cleanup');
        setError(errorMessage);
        options.onError?.(errorMessage);
        setIsCleaningUp(false);
        return;
      }

      setError(null);
      setResult(transformedResult);
      options.onSuccess?.(transformedResult);
      setIsCleaningUp(false);
    },
    onError: (message) => {
      emitComponentError(new Error(message), 'ai-part-cleanup');
      setError(message);
      options.onError?.(message);
      setIsCleaningUp(false);
    }
  });

  const startCleanup = useCallback(async (partKey: string) => {
    // Guidepost: Guard against double-submission
    if (isCleaningUp) {
      return;
    }

    if (!partKey) {
      const errorMessage = 'Part key is required';
      setError(errorMessage);
      options.onError?.(errorMessage);
      return;
    }

    try {
      setIsCleaningUp(true);
      setError(null);
      setRequestedPartKey(partKey);

      // Submit to cleanup endpoint
      const response = await fetch('/api/ai-parts/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ part_key: partKey }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Cleanup request failed: ${errorData}`);
      }

      const responseData = await response.json();
      const taskId = responseData.task_id;

      if (!taskId) {
        throw new Error('Invalid response: missing task_id');
      }

      // Subscribe to task events via unified SSE stream
      subscribeToTask(taskId);

    } catch (error) {
      console.error('Failed to submit cleanup request:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start cleanup';
      setIsCleaningUp(false);
      setError(errorMessage);
      if (error instanceof Error) {
        emitComponentError(error, 'ai-part-cleanup');
      } else {
        emitComponentError(new Error(String(error)), 'ai-part-cleanup');
      }
      options.onError?.(errorMessage);
    }
  }, [isCleaningUp, subscribeToTask, options]);

  const cancelCleanup = useCallback(() => {
    unsubscribeSSE();
    setIsCleaningUp(false);
    setError(null);
  }, [unsubscribeSSE]);

  return {
    startCleanup,
    cancelCleanup,
    isCleaningUp,
    progress,
    result,
    error
  };
}
