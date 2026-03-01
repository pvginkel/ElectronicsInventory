import { useCallback, useMemo, useState } from 'react';
import { type PartWithTotalSchemaList_a9993e3_PartWithTotalSchema } from '@/lib/api/generated/hooks';
import { useAllParts } from '@/hooks/use-all-parts';
import { useGetTypesWithStats } from '@/hooks/use-types';
import { formatPartForDisplay } from '@/lib/utils/parts';
import { fuzzyMatch, type FuzzySearchTerm } from '@/lib/utils/fuzzy-search';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';

export interface PartSelectorOption extends Record<string, unknown> {
  id: string;
  name: string;
  partId: number | null;
  displayId: string;
  displayDescription: string;
  displayManufacturerCode?: string;
  typeName?: string;
  manufacturer?: string;
  coverUrl: string | null;
}

export interface PartSelectorSummary {
  id: string;
  partId: number | null;
  displayId: string;
  displayDescription: string;
  displayManufacturerCode?: string;
  typeName?: string;
  manufacturer?: string;
  coverUrl: string | null;
  raw?: PartWithTotalSchemaList_a9993e3_PartWithTotalSchema;
}

interface PartSelectorOptionMeta {
  option: PartSelectorOption;
  summary: PartSelectorSummary;
}

interface UsePartsSelectorOptions {
  excludePartKeys?: string[];
  includePartKeys?: string[];
}

interface UsePartsSelectorResult {
  options: PartSelectorOption[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  getSelectedSummary: (id?: string) => PartSelectorSummary | undefined;
}

export function usePartsSelector(options?: UsePartsSelectorOptions): UsePartsSelectorResult {
  const [searchTerm, setSearchTerm] = useState('');
  const {
    data: partsResponse,
    isLoading,
    isFetching,
    error
  } = useAllParts();
  const { data: types = [] } = useGetTypesWithStats();

  const parts = useMemo<PartWithTotalSchemaList_a9993e3_PartWithTotalSchema[]>(() => {
    return partsResponse ?? [];
  }, [partsResponse]);

  const typeMap = useMemo(() => {
    const map = new Map<number, string>();
    types.forEach(type => {
      map.set(type.id, type.name);
    });
    return map;
  }, [types]);

  const optionsWithMeta = useMemo<PartSelectorOptionMeta[]>(() => {
    const mapped = parts.map((part) => {
      const {
        displayId,
        displayDescription,
        displayManufacturerCode,
        displayManufacturer
      } = formatPartForDisplay(part);
      const typeName = part.type_id ? typeMap.get(part.type_id) : undefined;

      const partId = (() => {
        if ('id' in part && typeof (part as { id?: unknown }).id === 'number') {
          return (part as { id: number }).id;
        }
        if ('part_id' in part && typeof (part as { part_id?: unknown }).part_id === 'number') {
          return (part as { part_id: number }).part_id;
        }
        return null;
      })();

      const option: PartSelectorOption = {
        id: part.key,
        name: `${displayDescription} (${part.key})`,
        partId,
        displayId,
        displayDescription,
        displayManufacturerCode,
        typeName,
        manufacturer: displayManufacturer,
        coverUrl: part.cover_url ?? null,
      };

      const summary: PartSelectorSummary = {
        id: part.key,
        partId,
        displayId,
        displayDescription,
        displayManufacturerCode,
        typeName,
        manufacturer: displayManufacturer,
        coverUrl: part.cover_url ?? null,
        raw: part,
      };

      return {
        option,
        summary,
      };
    });

    return mapped.sort((a, b) => {
      return a.option.displayDescription.localeCompare(
        b.option.displayDescription,
        undefined,
        { sensitivity: 'base' }
      );
    });
  }, [parts, typeMap]);

  const excludeSet = useMemo(() => new Set(options?.excludePartKeys ?? []), [options?.excludePartKeys]);
  const includeSet = useMemo(() => new Set(options?.includePartKeys ?? []), [options?.includePartKeys]);

  const filteredBySearch = useMemo(() => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      return optionsWithMeta;
    }

    // SearchableSelect syncs the input value to the selected option's display
    // name (e.g. "8-bit shift register (ABCD)").  The parenthesized key token
    // can't survive fuzzy tokenization, so treat an exact display-name match
    // as a no-op to avoid an infinite render loop.
    if (optionsWithMeta.some(({ option }) => option.name === trimmed)) {
      return optionsWithMeta;
    }

    return optionsWithMeta.filter(({ option, summary }) => {
      const raw = summary.raw;
      const data: FuzzySearchTerm[] = [
        { term: option.displayId, type: 'literal' },
        { term: option.displayDescription, type: 'text' },
        { term: option.displayManufacturerCode ?? '', type: 'text' },
        { term: option.manufacturer ?? '', type: 'text' },
        { term: option.typeName ?? '', type: 'text' },
        ...(raw?.seller_links ?? []).map(sl => ({ term: sl.seller_name ?? '', type: 'text' as const })),
        ...(raw?.tags ?? []).map(tag => ({ term: tag, type: 'text' as const })),
      ];
      return fuzzyMatch(data, searchTerm);
    });
  }, [optionsWithMeta, searchTerm]);

  const filteredOptions = useMemo(() => {
    if (excludeSet.size === 0 && includeSet.size === 0) {
      return filteredBySearch;
    }
    return filteredBySearch.filter(({ option }) => {
      if (includeSet.has(option.id)) {
        return true;
      }
      return !excludeSet.has(option.id);
    });
  }, [excludeSet, filteredBySearch, includeSet]);

  const optionsForDisplay = useMemo(
    () => filteredOptions.map(({ option }) => option),
    [filteredOptions]
  );

  const summaryById = useMemo(() => {
    const map = new Map<string, PartSelectorSummary>();
    optionsWithMeta.forEach(({ summary }) => {
      map.set(summary.id, summary);
    });
    return map;
  }, [optionsWithMeta]);

  const handleSearchChange = useCallback((term: string) => {
    setSearchTerm(term);
  }, []);

  const getSelectedSummary = useCallback((id?: string) => {
    if (!id) {
      return undefined;
    }
    return summaryById.get(id);
  }, [summaryById]);

  const getReadyMetadata = useCallback(() => ({
    status: 'success',
    counts: { parts: parts.length }
  }), [parts.length]);

  const getErrorMetadata = useCallback((err: unknown) => ({
    status: 'error',
    message: err instanceof Error ? err.message : String(err)
  }), []);

  const getAbortedMetadata = useCallback(() => ({
    status: 'aborted'
  }), []);

  useListLoadingInstrumentation({
    scope: 'parts.selector',
    isLoading,
    isFetching,
    error,
    getReadyMetadata,
    getErrorMetadata,
    getAbortedMetadata
  });

  return {
    options: optionsForDisplay,
    searchTerm,
    onSearchChange: handleSearchChange,
    isLoading,
    isFetching,
    error,
    getSelectedSummary
  };
}
