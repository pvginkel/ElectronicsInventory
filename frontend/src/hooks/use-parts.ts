import { useMemo } from 'react';
import {
  useGet__parts__part_id4__locations,
  useGet__parts__part_id4__history,
  usePost__inventory_parts__part_id4__stock,
  useDelete__inventory_parts__part_id4__stock,
  usePost__inventory_parts__part_id4__move,
} from '@/lib/api/generated/hooks';
import { calculateTotalQuantity } from '@/lib/utils/locations';

export function usePartLocations(partId: string) {
  const query = useGet__parts__part_id4__locations(
    { path: { part_id4: partId } },
    { enabled: !!partId }
  );

  const totalQuantity = useMemo(() => {
    if (!query.data) return 0;
    return calculateTotalQuantity(query.data.map(location => ({
      boxNo: location.box_no,
      locNo: location.loc_no,
      quantity: location.quantity,
    })));
  }, [query.data]);

  return {
    ...query,
    totalQuantity,
  };
}

export function usePartHistory(partId: string) {
  return useGet__parts__part_id4__history(
    { path: { part_id4: partId } },
    { enabled: !!partId }
  );
}

export function useAddStock() {
  return usePost__inventory_parts__part_id4__stock({
    onError: (error) => {
      console.error('Failed to add stock:', error);
    },
  });
}

export function useRemoveStock() {
  return useDelete__inventory_parts__part_id4__stock({
    onError: (error) => {
      console.error('Failed to remove stock:', error);
    },
  });
}

export function useMoveStock() {
  return usePost__inventory_parts__part_id4__move({
    onError: (error) => {
      console.error('Failed to move stock:', error);
    },
  });
}