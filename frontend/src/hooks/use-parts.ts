import { useMemo } from 'react';
import {
  useGetPartsLocationsByPartId4,
  useGetPartsHistoryByPartId4,
  usePostInventoryPartsStockByPartId4,
  useDeleteInventoryPartsStockByPartId4,
  usePostInventoryPartsMoveByPartId4,
  type PartLocationResponseSchemaList_a9993e3_PartLocationResponseSchema,
} from '@/lib/api/generated/hooks';
import { calculateTotalQuantity } from '@/lib/utils/locations';

export function usePartLocations(partId: string) {
  const query = useGetPartsLocationsByPartId4(
    { path: { part_id4: partId } },
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

export function usePartHistory(partId: string) {
  return useGetPartsHistoryByPartId4(
    { path: { part_id4: partId } },
    { enabled: !!partId }
  );
}

export function useAddStock() {
  return usePostInventoryPartsStockByPartId4({
    onError: (error: unknown) => {
      console.error('Failed to add stock:', error);
    },
  });
}

export function useRemoveStock() {
  return useDeleteInventoryPartsStockByPartId4({
    onError: (error: unknown) => {
      console.error('Failed to remove stock:', error);
    },
  });
}

export function useMoveStock() {
  return usePostInventoryPartsMoveByPartId4({
    onError: (error: unknown) => {
      console.error('Failed to move stock:', error);
    },
  });
}