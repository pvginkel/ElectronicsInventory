import { useMemo } from 'react';
import {
  useGetTypes,
  usePostTypes,
  usePutTypesByTypeId,
  useDeleteTypesByTypeId,
  useGetInventorySuggestionsByTypeId,
} from '@/lib/api/generated/hooks';

export function useTypesSearch(searchTerm: string) {
  const { data: allTypes, ...rest } = useGetTypes();

  const filteredTypes = useMemo(() => {
    if (!allTypes || !searchTerm.trim()) {
      return allTypes || [];
    }

    const term = searchTerm.toLowerCase();
    return allTypes.filter((type: unknown) => 
      (type as {name: string}).name.toLowerCase().includes(term)
    );
  }, [allTypes, searchTerm]);

  return {
    ...rest,
    data: filteredTypes,
  };
}

export function useCreateType() {
  return usePostTypes({
    onError: (error: unknown) => {
      console.error('Failed to create type:', error);
    },
  });
}

export function useUpdateType() {
  return usePutTypesByTypeId({
    onError: (error: unknown) => {
      console.error('Failed to update type:', error);
    },
  });
}

export function useDeleteType() {
  return useDeleteTypesByTypeId({
    onError: (error: unknown) => {
      console.error('Failed to delete type:', error);
    },
  });
}

export function useLocationSuggestions(typeId: number | undefined) {
  return useGetInventorySuggestionsByTypeId(
    { path: { type_id: typeId! } },
    { enabled: !!typeId }
  );
}