import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  usePostTypes,
  usePutTypesByTypeId,
  useDeleteTypesByTypeId,
  useGetInventorySuggestionsByTypeId
} from '@/lib/api/generated/hooks';
import { api } from '@/lib/api/generated/client';

export function useGetTypesWithStats(includeStats = false) {
  return useQuery<Array<{ id: number; name: string; part_count?: number; created_at: string; updated_at: string }>>({
    queryKey: ['getTypes', includeStats],
    queryFn: async () => {
      const searchParams = includeStats ? '?include_stats=true' : '';
      const { data, error } = await api.GET(`/api/types${searchParams}` as '/api/types');
      if (error) throw error;
      return data as Array<{ id: number; name: string; part_count?: number; created_at: string; updated_at: string }>;
    },
  });
}

export function useTypesSearch(searchTerm: string) {
  const { data: allTypes, ...rest } = useGetTypesWithStats(true);

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