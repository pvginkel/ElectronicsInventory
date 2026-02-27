import { useMemo } from 'react';
import {
  useGetSellers,
  usePostSellers,
  usePutSellersBySellerId,
  useDeleteSellersBySellerId,
} from '@/lib/api/generated/hooks';

// Role constants for mutation gating
import {
  postSellersRole,
  putSellersBySellerIdRole,
  deleteSellersBySellerIdRole,
} from '@/lib/api/generated/roles';
/** @public */
export { postSellersRole, putSellersBySellerIdRole, deleteSellersBySellerIdRole };

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

export function useCreateSeller() {
  return usePostSellers();
}

export function useUpdateSeller() {
  return usePutSellersBySellerId();
}

export function useDeleteSeller() {
  return useDeleteSellersBySellerId();
}