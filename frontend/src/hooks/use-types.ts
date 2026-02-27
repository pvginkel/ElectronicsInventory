import { useMemo } from 'react';
import {
  useGetTypes,
  usePostTypes,
  usePutTypesByTypeId,
  useDeleteTypesByTypeId,
  useGetInventorySuggestionsByTypeId
} from '@/lib/api/generated/hooks';
import { fuzzyMatch } from '@/lib/utils/fuzzy-search';

// Role constants for mutation gating
import {
  postTypesRole,
  putTypesByTypeIdRole,
  deleteTypesByTypeIdRole,
} from '@/lib/api/generated/roles';
/** @public */
export { postTypesRole, putTypesByTypeIdRole, deleteTypesByTypeIdRole };

export function useGetTypesWithStats() {
  // Use the generated API hook with query parameters for stats
  return useGetTypes({
    query: { include_stats: 'true' }
  });
}

export function useTypesSearch(searchTerm: string) {
  const { data: allTypes, ...rest } = useGetTypesWithStats();

  const filteredTypes = useMemo(() => {
    if (!allTypes || !searchTerm.trim()) {
      return allTypes || [];
    }

    return allTypes.filter((type) =>
      fuzzyMatch([{ term: type.name, type: 'text' }], searchTerm),
    );
  }, [allTypes, searchTerm]);

  return {
    ...rest,
    data: filteredTypes,
  };
}

export function useCreateType() {
  return usePostTypes();
}

export function useUpdateType() {
  return usePutTypesByTypeId();
}

export function useDeleteType() {
  return useDeleteTypesByTypeId();
}

export function useLocationSuggestions(typeId: number | undefined) {
  return useGetInventorySuggestionsByTypeId(
    { path: { type_id: typeId! } },
    { enabled: !!typeId }
  );
}