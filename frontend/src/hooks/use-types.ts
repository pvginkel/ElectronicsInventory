import { useMemo } from 'react';
import {
  useGet__types,
  usePost__types,
  useGet__inventory_suggestions__type_id_,
} from '@/lib/api/generated/hooks';

export function useTypesSearch(searchTerm: string) {
  const { data: allTypes, ...rest } = useGet__types();

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
  return usePost__types({
    onError: (error) => {
      console.error('Failed to create type:', error);
    },
  });
}

export function useLocationSuggestions(typeId: number | undefined) {
  return useGet__inventory_suggestions__type_id_(
    { path: { type_id: typeId! } },
    { enabled: !!typeId }
  );
}