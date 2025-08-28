import { useMemo } from 'react';
import {
  useGetTypes,
  usePostTypes,
  usePutTypesByTypeId,
  useDeleteTypesByTypeId,
  useGetInventorySuggestionsByTypeId
} from '@/lib/api/generated/hooks';

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

    const term = searchTerm.toLowerCase();
    return allTypes.filter((type) => 
      type.name.toLowerCase().includes(term)
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