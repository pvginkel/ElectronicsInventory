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