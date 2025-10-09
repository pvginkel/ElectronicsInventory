import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetShoppingLists,
  useGetShoppingListsByListId,
  usePostShoppingLists,
  usePutShoppingListsByListId,
  useDeleteShoppingListsByListId,
  usePostPartsShoppingListMembershipsByPartKey,
  usePutShoppingListLinesByLineId,
  useDeleteShoppingListLinesByLineId,
  usePutShoppingListsStatusByListId,
  type ShoppingListListSchemaList_a9993e3_ShoppingListListSchema,
  type ShoppingListListSchemaList_a9993e3_ShoppingListLineCountsSchema,
  type ShoppingListListSchemaList_a9993e3_ShoppingListSellerOrderNoteSchema,
  type ShoppingListResponseSchema_46f0cf6,
  type ShoppingListResponseSchema_46f0cf6_ShoppingListLineCountsSchema,
  type ShoppingListResponseSchema_46f0cf6_ShoppingListLineResponseSchema,
  type ShoppingListResponseSchema_46f0cf6_ShoppingListSellerOrderNoteSchema,
  type ShoppingListResponseSchema_46f0cf6_SellerListSchema,
  type ShoppingListCreateSchema_46f0cf6,
  type ShoppingListUpdateSchema_46f0cf6,
  type ShoppingListLineUpdateSchema_d9ccce0,
  type ShoppingListLineResponseSchema_d9ccce0,
  type ShoppingListStatusUpdateSchema_46f0cf6,
  type PartShoppingListMembershipCreateSchema_d085feb,
  type PostPartsShoppingListMembershipsByPartKeyParameters,
} from '@/lib/api/generated/hooks';
import {
  type ShoppingListConceptLine,
  type ShoppingListCreateInput,
  type ShoppingListDetail,
  type ShoppingListDuplicateCheck,
  type ShoppingListLineCounts,
  type ShoppingListLineCreateInput,
  type ShoppingListLineSortKey,
  type ShoppingListLineSortOption,
  type ShoppingListLineUpdateInput,
  type ShoppingListLineSnapshot,
  type ShoppingListMarkReadyInput,
  type ShoppingListOverviewSummary,
  type ShoppingListUpdateInput,
} from '@/types/shopping-lists';

const SHOPPING_LISTS_KEY = ['getShoppingLists'] as const;
type ShoppingListMembershipVariables = {
  path: PostPartsShoppingListMembershipsByPartKeyParameters['path'];
  body: PartShoppingListMembershipCreateSchema_d085feb;
};
type ShoppingListStatusVariables = {
  path: { list_id: number };
  body: ShoppingListStatusUpdateSchema_46f0cf6;
};

function detailKey(listId: number) {
  return ['getShoppingListsByListId', { path: { list_id: listId } }] as const;
}

function linesKey(listId: number) {
  return ['getShoppingListsLinesByListId', { path: { list_id: listId } }] as const;
}

function mapLineCounts(
  counts?: ShoppingListListSchemaList_a9993e3_ShoppingListLineCountsSchema | ShoppingListResponseSchema_46f0cf6_ShoppingListLineCountsSchema | null
): ShoppingListLineCounts {
  return {
    new: counts?.new ?? 0,
    ordered: counts?.ordered ?? 0,
    done: counts?.done ?? 0,
  };
}

function totalLines(counts: ShoppingListLineCounts): number {
  return counts.new + counts.ordered + counts.done;
}

function primarySellerFromNotes(
  notes?: ShoppingListListSchemaList_a9993e3_ShoppingListSellerOrderNoteSchema[] | ShoppingListResponseSchema_46f0cf6_ShoppingListSellerOrderNoteSchema[]
): string | null {
  if (!notes?.length) {
    return null;
  }
  for (const note of notes) {
    const sellerName = note?.seller?.name;
    if (sellerName && sellerName.trim()) {
      return sellerName;
    }
  }
  return null;
}

function mapSeller(seller: ShoppingListResponseSchema_46f0cf6_SellerListSchema | null): ShoppingListConceptLine['seller'] {
  if (!seller) {
    return null;
  }
  return {
    id: seller.id,
    name: seller.name,
    website: seller.website ?? null,
  };
}

function mapConceptLine(line: ShoppingListResponseSchema_46f0cf6_ShoppingListLineResponseSchema): ShoppingListConceptLine {
  return {
    id: line.id,
    shoppingListId: line.shopping_list_id,
    needed: line.needed,
    ordered: line.ordered,
    received: line.received,
    note: line.note,
    status: line.status,
    createdAt: line.created_at,
    updatedAt: line.updated_at,
    canReceive: line.can_receive,
    isOrderable: line.is_orderable,
    isRevertible: line.is_revertible,
    hasQuantityMismatch: line.has_quantity_mismatch,
    completionMismatch: line.completion_mismatch,
    completionNote: line.completion_note,
    part: {
      id: line.part_id,
      key: line.part.key,
      description: line.part.description,
      manufacturerCode: line.part.manufacturer_code,
    },
    seller: mapSeller(line.seller),
    effectiveSeller: mapSeller(line.effective_seller),
  };
}

function derivePrimarySeller(
  detail: ShoppingListResponseSchema_46f0cf6,
  lines: ShoppingListConceptLine[]
): string | null {
  const fromNotes = primarySellerFromNotes(detail.seller_notes);
  if (fromNotes) {
    return fromNotes;
  }

  for (const line of lines) {
    if (line.effectiveSeller?.name?.trim()) {
      return line.effectiveSeller.name;
    }
  }

  for (const line of lines) {
    if (line.seller?.name?.trim()) {
      return line.seller.name;
    }
  }

  return null;
}

function mapOverviewSummary(list: ShoppingListListSchemaList_a9993e3_ShoppingListListSchema): ShoppingListOverviewSummary {
  const lineCounts = mapLineCounts(list.line_counts);
  const total = totalLines(lineCounts);

  return {
    id: list.id,
    name: list.name,
    description: list.description,
    status: list.status,
    updatedAt: list.updated_at,
    lineCounts,
    totalLines: total,
    hasLines: total > 0,
    primarySellerName: primarySellerFromNotes(list.seller_notes),
  };
}

function mapShoppingListDetail(detail: ShoppingListResponseSchema_46f0cf6): ShoppingListDetail {
  const lines = detail.lines.map(mapConceptLine);
  const lineCounts = mapLineCounts(detail.line_counts);
  const total = totalLines(lineCounts);

  return {
    id: detail.id,
    name: detail.name,
    description: detail.description,
    status: detail.status,
    updatedAt: detail.updated_at,
    lineCounts,
    totalLines: total,
    hasLines: total > 0,
    primarySellerName: derivePrimarySeller(detail, lines),
    createdAt: detail.created_at,
    lines,
  };
}

function buildDuplicateCheck(lines: ShoppingListConceptLine[]): ShoppingListDuplicateCheck {
  const byPartKey = new Map<string, ShoppingListConceptLine>();
  for (const line of lines) {
    byPartKey.set(line.part.key, line);
  }
  return { byPartKey };
}

export const SHOPPING_LIST_LINE_SORT_OPTIONS: ShoppingListLineSortOption[] = [
  { key: 'description', label: 'Part description' },
  { key: 'mpn', label: 'Part / MPN' },
  { key: 'createdAt', label: 'Date added' },
];

function compareByDescription(a: ShoppingListConceptLine, b: ShoppingListConceptLine): number {
  return a.part.description.toLowerCase().localeCompare(b.part.description.toLowerCase());
}

function compareByMpn(a: ShoppingListConceptLine, b: ShoppingListConceptLine): number {
  const left = a.part.manufacturerCode?.toLowerCase() ?? a.part.key.toLowerCase();
  const right = b.part.manufacturerCode?.toLowerCase() ?? b.part.key.toLowerCase();
  return left.localeCompare(right);
}

function compareByCreatedAt(a: ShoppingListConceptLine, b: ShoppingListConceptLine): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function pickComparator(sortKey: ShoppingListLineSortKey) {
  switch (sortKey) {
    case 'mpn':
      return compareByMpn;
    case 'createdAt':
      return compareByCreatedAt;
    case 'description':
    default:
      return compareByDescription;
  }
}

export function sortShoppingListLines(
  lines: ShoppingListConceptLine[],
  sortKey: ShoppingListLineSortKey
): ShoppingListConceptLine[] {
  const comparator = pickComparator(sortKey);
  return [...lines].sort(comparator);
}

export function useSortedShoppingListLines(
  lines: ShoppingListConceptLine[],
  sortKey: ShoppingListLineSortKey
): ShoppingListConceptLine[] {
  return useMemo(() => sortShoppingListLines(lines, sortKey), [lines, sortKey]);
}

const selectOverviewLists = (data?: ShoppingListListSchemaList_a9993e3_ShoppingListListSchema[]): ShoppingListOverviewSummary[] => {
  if (!data) {
    return [];
  }
  return data.map(mapOverviewSummary);
};

const selectShoppingListDetail = (data?: ShoppingListResponseSchema_46f0cf6): ShoppingListDetail | undefined => {
  return data ? mapShoppingListDetail(data) : undefined;
};

export function useShoppingListsOverview() {
  const query = useGetShoppingLists();
  const lists = useMemo<ShoppingListOverviewSummary[]>(() => selectOverviewLists(query.data), [query.data]);

  const getReadyMetadata = useCallback(() => ({
    total: lists.length,
    withLines: lists.filter(list => list.hasLines).length,
  }), [lists]);

  const getErrorMetadata = useCallback((error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  }), []);

  return {
    ...query,
    lists,
    getReadyMetadata,
    getErrorMetadata,
  };
}

export function useShoppingListDetail(listId: number | string | undefined) {
  const numericId = typeof listId === 'string' ? Number(listId) : listId;
  const hasValidId = typeof numericId === 'number' && Number.isFinite(numericId);

  const query = useGetShoppingListsByListId(
    hasValidId ? { path: { list_id: numericId } } : undefined,
    {
      enabled: hasValidId,
    }
  );

  const shoppingList = useMemo<ShoppingListDetail | undefined>(() => selectShoppingListDetail(query.data), [query.data]);
  const lines = useMemo<ShoppingListConceptLine[]>(() => shoppingList?.lines ?? [], [shoppingList]);
  const duplicateCheck = useMemo(() => buildDuplicateCheck(lines), [lines]);

  const getReadyMetadata = useCallback((sortKey: ShoppingListLineSortKey) => ({
    status: shoppingList?.status ?? 'concept',
    lineCount: lines.length,
    sortKey,
  }), [lines.length, shoppingList?.status]);

  const getErrorMetadata = useCallback((error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  }), []);

  return {
    ...query,
    shoppingList,
    lines,
    duplicateCheck,
    getReadyMetadata,
    getErrorMetadata,
  };
}

function toCreatePayload(input: ShoppingListCreateInput): ShoppingListCreateSchema_46f0cf6 {
  return {
    name: input.name,
    description: input.description,
  };
}

function toUpdatePayload(input: ShoppingListUpdateInput): ShoppingListUpdateSchema_46f0cf6 {
  return {
    name: input.name,
    description: input.description,
  };
}

function toLineUpdatePayload(input: ShoppingListLineUpdateInput): ShoppingListLineUpdateSchema_d9ccce0 {
  return {
    needed: input.needed,
    note: input.note,
    seller_id: input.sellerId,
  };
}

function toStatusPayload(): ShoppingListStatusUpdateSchema_46f0cf6 {
  return { status: 'ready' };
}

export function useCreateShoppingListMutation() {
  const queryClient = useQueryClient();
  const {
    mutate: baseMutate,
    mutateAsync: baseMutateAsync,
    ...rest
  } = usePostShoppingLists({
    onSuccess: (data) => {
      const created = data as ShoppingListResponseSchema_46f0cf6 | undefined;
      queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_KEY });
      if (created?.id) {
        queryClient.invalidateQueries({ queryKey: detailKey(created.id) });
      }
    },
  });

  const mutate = useCallback<
    (input: ShoppingListCreateInput, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    baseMutate({ body: toCreatePayload(input) }, options);
  }, [baseMutate]);

  const mutateAsync = useCallback<
    (input: ShoppingListCreateInput, options?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, options) => {
    return baseMutateAsync({ body: toCreatePayload(input) }, options);
  }, [baseMutateAsync]);

  return {
    ...rest,
    mutate,
    mutateAsync,
  };
}

export function useUpdateShoppingListMutation(listId: number) {
  const queryClient = useQueryClient();
  const {
    mutate: baseMutate,
    mutateAsync: baseMutateAsync,
    ...rest
  } = usePutShoppingListsByListId({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(listId) });
      queryClient.invalidateQueries({ queryKey: linesKey(listId) });
    },
  });

  const mutate = useCallback<
    (input: ShoppingListUpdateInput, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    baseMutate({ path: { list_id: listId }, body: toUpdatePayload(input) }, options);
  }, [baseMutate, listId]);

  const mutateAsync = useCallback<
    (input: ShoppingListUpdateInput, options?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, options) => {
    return baseMutateAsync({ path: { list_id: listId }, body: toUpdatePayload(input) }, options);
  }, [baseMutateAsync, listId]);

  return {
    ...rest,
    mutate,
    mutateAsync,
  };
}

export function useDeleteShoppingListMutation() {
  const queryClient = useQueryClient();
  const { mutate: baseMutate, mutateAsync: baseMutateAsync, ...rest } = useDeleteShoppingListsByListId();

  const handleCleanup = useCallback((listId: number) => {
    queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_KEY });
    queryClient.removeQueries({ queryKey: detailKey(listId) });
    queryClient.removeQueries({ queryKey: linesKey(listId) });
  }, [queryClient]);

  const mutate = useCallback<
    (listId: number, options?: Parameters<typeof baseMutate>[1]) => void
  >((listId, options) => {
    baseMutate(
      { path: { list_id: listId } },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          handleCleanup(listId);
          options?.onSuccess?.(data, variables, context);
        },
      }
    );
  }, [baseMutate, handleCleanup]);

  const mutateAsync = useCallback<
    (listId: number, options?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((listId, options) => {
    return baseMutateAsync(
      { path: { list_id: listId } },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          handleCleanup(listId);
          options?.onSuccess?.(data, variables, context);
        },
      }
    );
  }, [baseMutateAsync, handleCleanup]);

  return {
    ...rest,
    mutate,
    mutateAsync,
  };
}

export function useCreateShoppingListLineMutation() {
  const queryClient = useQueryClient();
  const {
    mutate: baseMutate,
    mutateAsync: baseMutateAsync,
    ...rest
  } = usePostPartsShoppingListMembershipsByPartKey({
    onSuccess: (_data, variables) => {
      const resolved = variables as ShoppingListMembershipVariables | undefined;
      const listId = resolved?.body?.shopping_list_id;
      if (typeof listId === 'number') {
        queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_KEY });
        queryClient.invalidateQueries({ queryKey: detailKey(listId) });
        queryClient.invalidateQueries({ queryKey: linesKey(listId) });
      }
    },
  });

  const mutate = useCallback<
    (input: ShoppingListLineCreateInput, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    baseMutate(
      {
        path: { part_key: input.partKey },
        body: {
          shopping_list_id: input.listId,
          needed: input.needed,
          seller_id: input.sellerId,
          note: input.note,
        },
      },
      options
    );
  }, [baseMutate]);

  const mutateAsync = useCallback<
    (input: ShoppingListLineCreateInput, options?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, options) => {
    return baseMutateAsync(
      {
        path: { part_key: input.partKey },
        body: {
          shopping_list_id: input.listId,
          needed: input.needed,
          seller_id: input.sellerId,
          note: input.note,
        },
      },
      options
    );
  }, [baseMutateAsync]);

  return {
    ...rest,
    mutate,
    mutateAsync,
  };
}

export function useUpdateShoppingListLineMutation() {
  const queryClient = useQueryClient();
  const { mutate: baseMutate, mutateAsync: baseMutateAsync, ...rest } = usePutShoppingListLinesByLineId();

  const handleInvalidate = useCallback((listId: number) => {
    queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_KEY });
    queryClient.invalidateQueries({ queryKey: detailKey(listId) });
    queryClient.invalidateQueries({ queryKey: linesKey(listId) });
  }, [queryClient]);

  const mutate = useCallback<
    (input: ShoppingListLineUpdateInput, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    baseMutate(
      { path: { line_id: input.lineId }, body: toLineUpdatePayload(input) },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          const response = data as ShoppingListLineResponseSchema_d9ccce0 | undefined;
          const resolvedListId = response?.shopping_list_id ?? input.listId;
          if (typeof resolvedListId === 'number') {
            handleInvalidate(resolvedListId);
          }
          options?.onSuccess?.(data, variables, context);
        },
      }
    );
  }, [baseMutate, handleInvalidate]);

  const mutateAsync = useCallback<
    (input: ShoppingListLineUpdateInput, options?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, options) => {
    return baseMutateAsync(
      { path: { line_id: input.lineId }, body: toLineUpdatePayload(input) },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          const response = data as ShoppingListLineResponseSchema_d9ccce0 | undefined;
          const resolvedListId = response?.shopping_list_id ?? input.listId;
          if (typeof resolvedListId === 'number') {
            handleInvalidate(resolvedListId);
          }
          options?.onSuccess?.(data, variables, context);
        },
      }
    );
  }, [baseMutateAsync, handleInvalidate]);

  return {
    ...rest,
    mutate,
    mutateAsync,
  };
}

export function useDeleteShoppingListLineMutation() {
  const queryClient = useQueryClient();
  const { mutate: baseMutate, mutateAsync: baseMutateAsync, ...rest } = useDeleteShoppingListLinesByLineId();

  const handleInvalidate = useCallback((listId: number) => {
    queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_KEY });
    queryClient.invalidateQueries({ queryKey: detailKey(listId) });
    queryClient.invalidateQueries({ queryKey: linesKey(listId) });
  }, [queryClient]);

  const mutate = useCallback<
    (input: { lineId: number; listId: number }, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    baseMutate(
      { path: { line_id: input.lineId } },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          handleInvalidate(input.listId);
          options?.onSuccess?.(data, variables, context);
        },
      }
    );
  }, [baseMutate, handleInvalidate]);

  const mutateAsync = useCallback<
    (input: { lineId: number; listId: number }, options?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, options) => {
    return baseMutateAsync(
      { path: { line_id: input.lineId } },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          handleInvalidate(input.listId);
          options?.onSuccess?.(data, variables, context);
        },
      }
    );
  }, [baseMutateAsync, handleInvalidate]);

  return {
    ...rest,
    mutate,
    mutateAsync,
  };
}

export function useMarkShoppingListReadyMutation() {
  const queryClient = useQueryClient();
  const {
    mutate: baseMutate,
    mutateAsync: baseMutateAsync,
    ...rest
  } = usePutShoppingListsStatusByListId({
    onSuccess: (data, variables) => {
      const resolved = variables as ShoppingListStatusVariables | undefined;
      const listId = resolved?.path?.list_id;
      if (typeof listId === 'number') {
        queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_KEY });
        queryClient.invalidateQueries({ queryKey: detailKey(listId) });

        queryClient.setQueryData<ShoppingListDetail | undefined>(detailKey(listId), (current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            status: (data as ShoppingListStatusUpdateSchema_46f0cf6 | undefined)?.status ?? 'ready',
          };
        });
      }
    },
  });

  const mutate = useCallback<
    (input: ShoppingListMarkReadyInput, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    baseMutate({ path: { list_id: input.listId }, body: toStatusPayload() }, options);
  }, [baseMutate]);

  const mutateAsync = useCallback<
    (input: ShoppingListMarkReadyInput, options?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, options) => {
    return baseMutateAsync({ path: { list_id: input.listId }, body: toStatusPayload() }, options);
  }, [baseMutateAsync]);

  return {
    ...rest,
    mutate,
    mutateAsync,
  };
}

export function snapshotLineFields(input: { listId: number; partKey: string; needed: number }): ShoppingListLineSnapshot {
  return {
    listId: input.listId,
    partKey: input.partKey,
    needed: input.needed,
  };
}
