import { useCallback, useMemo, useState } from 'react';
import { type PartWithTotalSchemaList_a9993e3_PartWithTotalSchema } from '@/lib/api/generated/hooks';
import { useAllParts } from '@/hooks/use-all-parts';
import { useGetTypesWithStats } from '@/hooks/use-types';
import { formatPartForDisplay } from '@/lib/utils/parts';
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
}

export interface PartSelectorSummary {
  id: string;
  partId: number | null;
  displayId: string;
  displayDescription: string;
  displayManufacturerCode?: string;
  typeName?: string;
  manufacturer?: string;
  raw?: PartWithTotalSchemaList_a9993e3_PartWithTotalSchema;
}

interface PartSelectorOptionMeta {
  option: PartSelectorOption;
  summary: PartSelectorSummary;
  searchTokens: string[];
}

export interface UsePartsSelectorOptions {
  excludePartKeys?: string[];
  includePartKeys?: string[];
}

export interface UsePartsSelectorResult {
  options: PartSelectorOption[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  getSelectedSummary: (id?: string) => PartSelectorSummary | undefined;
}

function buildSearchTokens(detail: PartSelectorOption, part: PartWithTotalSchemaList_a9993e3_PartWithTotalSchema): string[] {
  const tokens: string[] = [
    detail.displayId,
    detail.displayDescription,
    detail.displayManufacturerCode ?? '',
    detail.typeName ?? '',
  ];

  if (part.tags?.length) {
    tokens.push(...part.tags.map(tag => tag.toLowerCase()));
  }

  return tokens
    .map(token => token.trim())
    .filter(Boolean)
    .map(token => token.toLowerCase());
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
        manufacturer: displayManufacturer
      };

      const summary: PartSelectorSummary = {
        id: part.key,
        partId,
        displayId,
        displayDescription,
        displayManufacturerCode,
        typeName,
        manufacturer: displayManufacturer,
        raw: part,
      };

      return {
        option,
        summary,
        searchTokens: buildSearchTokens(option, part)
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
    if (!searchTerm.trim()) {
      return optionsWithMeta;
    }

    const term = searchTerm.toLowerCase();
    return optionsWithMeta.filter(({ option, searchTokens }) => {
      if (option.name.toLowerCase().includes(term)) {
        return true;
      }

      return searchTokens.some(token => token.includes(term));
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
