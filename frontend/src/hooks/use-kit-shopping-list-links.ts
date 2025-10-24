import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  usePostKitsShoppingListsByKitId,
  useDeleteKitShoppingListLinksByLinkId,
  type KitShoppingListLinkResponseSchema_b98797e,
} from '@/lib/api/generated/hooks';
import { buildKitDetailQueryKey } from '@/hooks/use-kit-detail';
import { mapKitShoppingListLink, type KitShoppingListLink } from '@/types/kits';
import type { ShoppingListStatus } from '@/types/shopping-lists';

const SHOPPING_MEMBERSHIP_QUERY_KEY = ['kits.shoppingListMemberships'] as const;

function shoppingListDetailQueryKey(listId: number) {
  return ['getShoppingListsByListId', { path: { list_id: listId } }] as const;
}

function shoppingListKitsQueryKey(listId: number) {
  return ['getShoppingListsKitsByListId', { path: { list_id: listId } }] as const;
}

// Guidepost: keep related kit + shopping list queries consistent after link mutations.
function invalidateKitShoppingListCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  kitId: number,
  shoppingListId?: number | null
) {
  queryClient.invalidateQueries({ queryKey: buildKitDetailQueryKey(kitId) });
  queryClient.invalidateQueries({ queryKey: SHOPPING_MEMBERSHIP_QUERY_KEY });

  if (typeof shoppingListId === 'number') {
    queryClient.invalidateQueries({ queryKey: shoppingListDetailQueryKey(shoppingListId) });
    queryClient.invalidateQueries({ queryKey: shoppingListKitsQueryKey(shoppingListId) });
    return;
  }

  queryClient.invalidateQueries({ queryKey: ['getShoppingListsByListId'] });
  queryClient.invalidateQueries({ queryKey: ['getShoppingListsKitsByListId'] });
}

export interface KitShoppingListLinkInput {
  kitId: number;
  shoppingListId: number;
  requestedUnits: number;
  honorReserved: boolean;
  notePrefix: string | null;
}

export interface KitShoppingListUnlinkInput {
  kitId: number;
  linkId: number;
  shoppingListId: number;
}

export interface KitShoppingListLinkMutationResult {
  link: KitShoppingListLink | null;
  shoppingListId: number | null;
  shoppingListStatus: ShoppingListStatus | null;
  totalNeededQuantity: number;
  linesModified: number;
  createdNewList: boolean;
  noop: boolean;
}

export function mapKitShoppingListLinkResponse(
  response: KitShoppingListLinkResponseSchema_b98797e | undefined,
  fallbackListId?: number
): KitShoppingListLinkMutationResult {
  const link = response?.link ? mapKitShoppingListLink(response.link) : null;
  const shoppingListId =
    response?.shopping_list?.id ??
    link?.shoppingListId ??
    fallbackListId ??
    null;
  const shoppingListStatus = (response?.shopping_list?.status ?? link?.status) ?? null;

  return {
    link,
    shoppingListId,
    shoppingListStatus,
    totalNeededQuantity: response?.total_needed_quantity ?? 0,
    linesModified: response?.lines_modified ?? 0,
    createdNewList: response?.created_new_list ?? false,
    noop: response?.noop ?? false,
  };
}

function resolveShoppingListId(
  response: KitShoppingListLinkResponseSchema_b98797e | undefined,
  fallbackListId: number
) {
  return (
    response?.shopping_list?.id ??
    response?.link?.shopping_list_id ??
    fallbackListId
  );
}

export function useKitShoppingListLinkMutation() {
  const queryClient = useQueryClient();
  const {
    mutate: baseMutate,
    mutateAsync: baseMutateAsync,
    ...rest
  } = usePostKitsShoppingListsByKitId();

  const invalidate = useCallback(
    (kitId: number, response: KitShoppingListLinkResponseSchema_b98797e | undefined, fallbackListId: number) => {
      const resolvedListId = resolveShoppingListId(response, fallbackListId);
      invalidateKitShoppingListCaches(queryClient, kitId, resolvedListId);
    },
    [queryClient]
  );

  const mutate = useCallback<
    (input: KitShoppingListLinkInput, mutateOptions?: Parameters<typeof baseMutate>[1]) => void
  >((input, mutateOptions) => {
    baseMutate(
      {
        path: { kit_id: input.kitId },
        body: {
          shopping_list_id: input.shoppingListId,
          units: input.requestedUnits,
          honor_reserved: input.honorReserved,
          note_prefix: input.notePrefix,
          new_list_name: null,
          new_list_description: null,
        },
      },
      {
        ...mutateOptions,
        onSuccess: (data, variables, context) => {
          invalidate(input.kitId, data as KitShoppingListLinkResponseSchema_b98797e | undefined, input.shoppingListId);
          mutateOptions?.onSuccess?.(data, variables, context);
        },
        onError: (error, variables, context) => {
          mutateOptions?.onError?.(error, variables, context);
        },
        onSettled: (data, error, variables, context) => {
          mutateOptions?.onSettled?.(data, error, variables, context);
        },
      }
    );
  }, [baseMutate, invalidate]);

  const mutateAsync = useCallback<
    (input: KitShoppingListLinkInput, mutateOptions?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, mutateOptions) => {
    return baseMutateAsync(
      {
        path: { kit_id: input.kitId },
        body: {
          shopping_list_id: input.shoppingListId,
          units: input.requestedUnits,
          honor_reserved: input.honorReserved,
          note_prefix: input.notePrefix,
          new_list_name: null,
          new_list_description: null,
        },
      },
      {
        ...mutateOptions,
        onSuccess: (data, variables, context) => {
          invalidate(input.kitId, data as KitShoppingListLinkResponseSchema_b98797e | undefined, input.shoppingListId);
          mutateOptions?.onSuccess?.(data, variables, context);
        },
        onError: (error, variables, context) => {
          mutateOptions?.onError?.(error, variables, context);
        },
        onSettled: (data, error, variables, context) => {
          mutateOptions?.onSettled?.(data, error, variables, context);
        },
      }
    );
  }, [baseMutateAsync, invalidate]);

  return {
    ...rest,
    mutate,
    mutateAsync,
  };
}

export function useKitShoppingListUnlinkMutation() {
  const queryClient = useQueryClient();
  const {
    mutate: baseMutate,
    mutateAsync: baseMutateAsync,
    ...rest
  } = useDeleteKitShoppingListLinksByLinkId();

  const mutate = useCallback<
    (input: KitShoppingListUnlinkInput, mutateOptions?: Parameters<typeof baseMutate>[1]) => void
  >((input, mutateOptions) => {
    baseMutate(
      {
        path: { link_id: input.linkId },
      },
      {
        ...mutateOptions,
        onSuccess: (data, variables, context) => {
          invalidateKitShoppingListCaches(queryClient, input.kitId, input.shoppingListId);
          mutateOptions?.onSuccess?.(data, variables, context);
        },
        onError: (error, variables, context) => {
          mutateOptions?.onError?.(error, variables, context);
        },
        onSettled: (data, error, variables, context) => {
          mutateOptions?.onSettled?.(data, error, variables, context);
        },
      }
    );
  }, [baseMutate, queryClient]);

  const mutateAsync = useCallback<
    (input: KitShoppingListUnlinkInput, mutateOptions?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, mutateOptions) => {
    return baseMutateAsync(
      {
        path: { link_id: input.linkId },
      },
      {
        ...mutateOptions,
        onSuccess: (data, variables, context) => {
          invalidateKitShoppingListCaches(queryClient, input.kitId, input.shoppingListId);
          mutateOptions?.onSuccess?.(data, variables, context);
        },
        onError: (error, variables, context) => {
          mutateOptions?.onError?.(error, variables, context);
        },
        onSettled: (data, error, variables, context) => {
          mutateOptions?.onSettled?.(data, error, variables, context);
        },
      }
    );
  }, [baseMutateAsync, queryClient]);

  return {
    ...rest,
    mutate,
    mutateAsync,
  };
}
