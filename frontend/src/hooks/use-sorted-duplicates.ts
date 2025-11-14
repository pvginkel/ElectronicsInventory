import { useMemo } from 'react';
import type { DuplicatePartEntry } from '@/types/ai-parts';

/**
 * Hook to sort duplicate parts by confidence and part key.
 *
 * Strategy:
 * 1. Sorts by confidence (high > medium)
 * 2. Within each confidence group, sorts alphabetically by partKey
 * 3. Returns sorted array
 *
 * Note: This hook does NOT fetch part details. Sorting by description would require
 * fetching all part details first, which violates rules of hooks (can't call hooks
 * in loops). Instead, individual AIPartLinkChip components fetch their own details.
 * Sorting by partKey provides a stable, deterministic order without async coordination.
 *
 * @param duplicateParts - Array of duplicate part entries from AI analysis
 * @returns Object with sortedDuplicates array
 */
export function useSortedDuplicates(duplicateParts: DuplicatePartEntry[]) {
  // Guidepost: Sort duplicates by confidence (high > medium) then alphabetically by partKey
  const sortedDuplicates = useMemo(() => {
    return [...duplicateParts].sort((a, b) => {
      // Primary sort: confidence (high > medium)
      const confidenceOrder = { high: 0, medium: 1 };
      const confidenceDiff = confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
      if (confidenceDiff !== 0) return confidenceDiff;

      // Secondary sort: alphabetical by partKey
      return a.partKey.localeCompare(b.partKey);
    });
  }, [duplicateParts]);

  return {
    sortedDuplicates,
  };
}
