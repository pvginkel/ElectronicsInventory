/**
 * Seller group CRUD mutation hooks for shopping list Kanban columns.
 *
 * Wraps the four generated seller group endpoints with camelCase inputs
 * and consistent cache invalidation. Each mutation invalidates the full
 * shopping list detail + overview keys so the Kanban board re-renders
 * with authoritative data.
 */
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  usePostShoppingListsSellerGroupsByListId,
  useDeleteShoppingListsSellerGroupsByListIdAndSellerId,
  usePutShoppingListsSellerGroupsByListIdAndSellerId,
  type ShoppingListSellerGroupCreateSchema_57ff967,
  type ShoppingListSellerGroupUpdateSchema_57ff967,
  type ShoppingListSellerGroupSchema_46f0cf6,
} from '@/lib/api/generated/hooks';
import type {
  SellerGroupCreateInput,
  SellerGroupUpdateInput,
  SellerGroupDeleteInput,
} from '@/types/shopping-lists';

const SHOPPING_LISTS_KEY = ['getShoppingLists'] as const;

function detailKey(listId: number) {
  return ['getShoppingListsByListId', { path: { list_id: listId } }] as const;
}

function linesKey(listId: number) {
  return ['getShoppingListsLinesByListId', { path: { list_id: listId } }] as const;
}

function invalidateShoppingListQueries(queryClient: ReturnType<typeof useQueryClient>, listId: number) {
  queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_KEY });
  queryClient.invalidateQueries({ queryKey: detailKey(listId) });
  queryClient.invalidateQueries({ queryKey: linesKey(listId) });
}

// --- Create Seller Group ---

export function useCreateSellerGroupMutation() {
  const queryClient = useQueryClient();
  const {
    mutate: baseMutate,
    mutateAsync: baseMutateAsync,
    ...rest
  } = usePostShoppingListsSellerGroupsByListId({
    onSuccess: (_data, variables) => {
      const listId = (variables as { path?: { list_id?: number } })?.path?.list_id;
      if (typeof listId === 'number') {
        invalidateShoppingListQueries(queryClient, listId);
      }
    },
  });

  const mutate = useCallback<
    (input: SellerGroupCreateInput, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    const body: ShoppingListSellerGroupCreateSchema_57ff967 = {
      seller_id: input.sellerId,
    };
    baseMutate(
      { path: { list_id: input.listId }, body },
      options
    );
  }, [baseMutate]);

  const mutateAsync = useCallback<
    (input: SellerGroupCreateInput, options?: Parameters<typeof baseMutateAsync>[1]) => Promise<ShoppingListSellerGroupSchema_46f0cf6>
  >((input, options) => {
    const body: ShoppingListSellerGroupCreateSchema_57ff967 = {
      seller_id: input.sellerId,
    };
    return baseMutateAsync(
      { path: { list_id: input.listId }, body },
      options
    ) as Promise<ShoppingListSellerGroupSchema_46f0cf6>;
  }, [baseMutateAsync]);

  return { ...rest, mutate, mutateAsync };
}

// --- Update Seller Group (note and/or status) ---

export function useUpdateSellerGroupMutation() {
  const queryClient = useQueryClient();
  const {
    mutate: baseMutate,
    mutateAsync: baseMutateAsync,
    ...rest
  } = usePutShoppingListsSellerGroupsByListIdAndSellerId({
    onSuccess: (_data, variables) => {
      const listId = (variables as { path?: { list_id?: number } })?.path?.list_id;
      if (typeof listId === 'number') {
        invalidateShoppingListQueries(queryClient, listId);
      }
    },
  });

  const mutate = useCallback<
    (input: SellerGroupUpdateInput, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    // Only include fields that were explicitly provided to avoid clearing values
    const body = {} as Partial<ShoppingListSellerGroupUpdateSchema_57ff967>;
    if (input.note !== undefined) body.note = input.note;
    if (input.status !== undefined) body.status = input.status;
    baseMutate(
      { path: { list_id: input.listId, seller_id: input.sellerId }, body: body as ShoppingListSellerGroupUpdateSchema_57ff967 },
      options
    );
  }, [baseMutate]);

  const mutateAsync = useCallback<
    (input: SellerGroupUpdateInput, options?: Parameters<typeof baseMutateAsync>[1]) => Promise<ShoppingListSellerGroupSchema_46f0cf6>
  >((input, options) => {
    // Only include fields that were explicitly provided to avoid clearing values
    const body = {} as Partial<ShoppingListSellerGroupUpdateSchema_57ff967>;
    if (input.note !== undefined) body.note = input.note;
    if (input.status !== undefined) body.status = input.status;
    return baseMutateAsync(
      { path: { list_id: input.listId, seller_id: input.sellerId }, body: body as ShoppingListSellerGroupUpdateSchema_57ff967 },
      options
    ) as Promise<ShoppingListSellerGroupSchema_46f0cf6>;
  }, [baseMutateAsync]);

  return { ...rest, mutate, mutateAsync };
}

// --- Delete Seller Group ---

export function useDeleteSellerGroupMutation() {
  const queryClient = useQueryClient();
  const {
    mutate: baseMutate,
    mutateAsync: baseMutateAsync,
    ...rest
  } = useDeleteShoppingListsSellerGroupsByListIdAndSellerId();

  const handleInvalidate = useCallback((listId: number) => {
    invalidateShoppingListQueries(queryClient, listId);
  }, [queryClient]);

  const mutate = useCallback<
    (input: SellerGroupDeleteInput, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    baseMutate(
      { path: { list_id: input.listId, seller_id: input.sellerId } },
      {
        ...options,
        onSuccess: (data, variables, onMutateResult, context) => {
          handleInvalidate(input.listId);
          options?.onSuccess?.(data, variables, onMutateResult, context);
        },
      }
    );
  }, [baseMutate, handleInvalidate]);

  const mutateAsync = useCallback<
    (input: SellerGroupDeleteInput, options?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, options) => {
    return baseMutateAsync(
      { path: { list_id: input.listId, seller_id: input.sellerId } },
      {
        ...options,
        onSuccess: (data, variables, onMutateResult, context) => {
          handleInvalidate(input.listId);
          options?.onSuccess?.(data, variables, onMutateResult, context);
        },
      }
    );
  }, [baseMutateAsync, handleInvalidate]);

  return { ...rest, mutate, mutateAsync };
}
