import { useMemo } from 'react';
import {
  useGetSellers,
  usePostSellers,
  usePutSellersBySellerId,
  useDeleteSellersBySellerId,
  useGetSellersBySellerId
} from '@/lib/api/generated/hooks';

export function useSellers(searchTerm?: string) {
  const query = useGetSellers();

  const filteredSellers = useMemo(() => {
    if (!query.data || !searchTerm?.trim()) {
      return query.data || [];
    }

    const term = searchTerm.toLowerCase();
    return query.data.filter((seller) =>
      seller.name.toLowerCase().includes(term) ||
      seller.website.toLowerCase().includes(term)
    );
  }, [query.data, searchTerm]);

  return {
    ...query,
    data: filteredSellers,
  };
}

export function useSellersSearch(searchTerm?: string) {
  const { data: allSellers, ...rest } = useGetSellers();

  const filteredSellers = useMemo(() => {
    if (!allSellers || !searchTerm?.trim()) {
      return allSellers || [];
    }

    const term = searchTerm.toLowerCase();
    return allSellers.filter((seller) =>
      seller.name.toLowerCase().includes(term)
    );
  }, [allSellers, searchTerm]);

  return {
    ...rest,
    data: filteredSellers,
  };
}

export function useSellerById(sellerId: number) {
  return useGetSellersBySellerId(
    { path: { seller_id: sellerId } },
    { enabled: !!sellerId }
  );
}

export function useCreateSeller() {
  return usePostSellers();
}

export function useUpdateSeller() {
  return usePutSellersBySellerId();
}

export function useDeleteSeller() {
  return useDeleteSellersBySellerId();
}