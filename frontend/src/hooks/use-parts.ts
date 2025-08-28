import { useMemo } from 'react';
import {
  useGetPartsLocationsByPartKey,
  usePostInventoryPartsStockByPartKey,
  useDeleteInventoryPartsStockByPartKey,
  type PartLocationResponseSchemaList_a9993e3_PartLocationResponseSchema,
} from '@/lib/api/generated/hooks';
import { calculateTotalQuantity } from '@/lib/utils/locations';

export function usePartLocations(partId: string) {
  const query = useGetPartsLocationsByPartKey(
    { path: { part_key: partId } },
    { enabled: !!partId }
  );

  const totalQuantity = useMemo(() => {
    if (!query.data) return 0;
    return calculateTotalQuantity(query.data.map((location: PartLocationResponseSchemaList_a9993e3_PartLocationResponseSchema) => ({
      boxNo: location.box_no,
      locNo: location.loc_no,
      quantity: location.qty,
    })));
  }, [query.data]);

  return {
    ...query,
    totalQuantity,
  };
}

export function useAddStock() {
  return usePostInventoryPartsStockByPartKey();
}

export function useRemoveStock() {
  return useDeleteInventoryPartsStockByPartKey();
}