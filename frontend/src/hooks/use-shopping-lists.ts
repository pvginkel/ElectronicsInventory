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
  usePostShoppingListLinesOrderByLineId,
  usePostShoppingListsSellerGroupsOrderByListIdAndGroupRef,
  usePutShoppingListsSellerGroupsOrderNoteByListIdAndSellerId,
  type ShoppingListListSchemaList_a9993e3_ShoppingListListSchema,
  type ShoppingListListSchemaList_a9993e3_ShoppingListLineCountsSchema,
  type ShoppingListListSchemaList_a9993e3_ShoppingListSellerOrderNoteSchema,
  type ShoppingListResponseSchema_46f0cf6,
  type ShoppingListResponseSchema_46f0cf6_ShoppingListLineCountsSchema,
  type ShoppingListResponseSchema_46f0cf6_ShoppingListLineResponseSchema,
  type ShoppingListResponseSchema_46f0cf6_ShoppingListSellerGroupSchema,
  type ShoppingListResponseSchema_46f0cf6_ShoppingListSellerGroupTotalsSchema,
  type ShoppingListResponseSchema_46f0cf6_ShoppingListSellerOrderNoteSchema,
  type ShoppingListResponseSchema_46f0cf6_SellerListSchema,
  type ShoppingListCreateSchema_46f0cf6,
  type ShoppingListUpdateSchema_46f0cf6,
  type ShoppingListLineUpdateSchema_d9ccce0,
  type ShoppingListLineResponseSchema_d9ccce0,
  type ShoppingListStatusUpdateSchema_46f0cf6,
  type PartShoppingListMembershipCreateSchema_d085feb,
  type PostPartsShoppingListMembershipsByPartKeyParameters,
  type PutShoppingListsSellerGroupsOrderNoteByListIdAndSellerIdParameters,
  type PostShoppingListsSellerGroupsOrderByListIdAndGroupRefParameters,
  type PostShoppingListLinesOrderByLineIdParameters,
  type ShoppingListSellerOrderNoteSchema_ceb40c1,
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
  type ShoppingListLineOrderInput,
  type ShoppingListGroupOrderInput,
  type ShoppingListGroupOrderLineInput,
  type ShoppingListMarkReadyInput,
  type ShoppingListOverviewSummary,
  type ShoppingListSellerGroup,
  type ShoppingListSellerOrderNote,
  type ShoppingListSellerOrderNoteInput,
  type ShoppingListStatus,
  type ShoppingListStatusUpdateInput,
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

function invalidateShoppingListQueries(queryClient: ReturnType<typeof useQueryClient>, listId: number) {
  queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_KEY });
  queryClient.invalidateQueries({ queryKey: detailKey(listId) });
  queryClient.invalidateQueries({ queryKey: linesKey(listId) });
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

function mapSellerOrderNote(
  note: ShoppingListResponseSchema_46f0cf6_ShoppingListSellerOrderNoteSchema | ShoppingListSellerOrderNoteSchema_ceb40c1
): ShoppingListSellerOrderNote {
  const rawNote = note.note ?? '';
  const trimmed = rawNote.trim();
  return {
    sellerId: note.seller_id,
    sellerName: note.seller?.name ?? 'Unknown seller',
    sellerWebsite: note.seller?.website ?? null,
    note: trimmed.length > 0 ? note.note : null,
    updatedAt: note.updated_at,
  };
}

function mapGroupTotals(
  totals?: ShoppingListResponseSchema_46f0cf6_ShoppingListSellerGroupTotalsSchema | null
): ShoppingListSellerGroup['totals'] {
  return {
    needed: totals?.needed ?? 0,
    ordered: totals?.ordered ?? 0,
    received: totals?.received ?? 0,
  };
}

function mapSellerGroup(
  group: ShoppingListResponseSchema_46f0cf6_ShoppingListSellerGroupSchema,
  lineLookup: Map<number, ShoppingListConceptLine>
): ShoppingListSellerGroup {
  const lines = group.lines.map((line) => lineLookup.get(line.id) ?? mapConceptLine(line));
  const hasOrderedLines = lines.some(line => line.status === 'ordered');
  const hasNewLines = lines.some(line => line.status === 'new');
  const hasDoneLines = lines.some(line => line.status === 'done');
  const sellerName = group.seller?.name ?? 'Ungrouped';
  const rawNote = group.order_note?.note ?? '';
  const orderNote = rawNote.trim().length > 0 ? group.order_note?.note ?? null : null;

  return {
    groupKey: group.group_key,
    sellerId: group.seller_id ?? null,
    sellerName,
    sellerWebsite: group.seller?.website ?? null,
    orderNote,
    totals: mapGroupTotals(group.totals),
    lines,
    hasOrderedLines,
    hasNewLines,
    hasDoneLines,
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
  const lineLookup = new Map<number, ShoppingListConceptLine>();
  for (const line of lines) {
    lineLookup.set(line.id, line);
  }
  const sellerGroups = (detail.seller_groups ?? []).map(group => mapSellerGroup(group, lineLookup));
  const sellerOrderNotes = (detail.seller_notes ?? []).map(mapSellerOrderNote);
  const hasOrderedLines = lineCounts.ordered > 0;
  const canReturnToConcept = detail.status === 'ready' && !hasOrderedLines;

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
    sellerGroups,
    sellerOrderNotes,
    hasOrderedLines,
    canReturnToConcept,
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
  const sellerGroups = useMemo<ShoppingListSellerGroup[]>(() => shoppingList?.sellerGroups ?? [], [shoppingList]);
  const sellerGroupsByKey = useMemo<Map<string, ShoppingListSellerGroup>>(() => {
    const entries: Array<[string, ShoppingListSellerGroup]> = [];
    for (const group of sellerGroups) {
      entries.push([group.groupKey, group]);
    }
    return new Map(entries);
  }, [sellerGroups]);
  const duplicateCheck = useMemo(() => buildDuplicateCheck(lines), [lines]);

  const getReadyMetadata = useCallback((sortKey: ShoppingListLineSortKey) => ({
    status: shoppingList?.status ?? 'concept',
    view: shoppingList?.status ?? 'concept',
    lineCount: lines.length,
    groupCount: sellerGroups.length,
    ordered: shoppingList?.lineCounts.ordered ?? 0,
    sortKey,
  }), [lines.length, sellerGroups.length, shoppingList?.lineCounts.ordered, shoppingList?.status]);

  const getErrorMetadata = useCallback((error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  }), []);

  return {
    ...query,
    shoppingList,
    lines,
    sellerGroups,
    sellerGroupsByKey,
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

function toStatusPayload(status: ShoppingListStatus): ShoppingListStatusUpdateSchema_46f0cf6 {
  return { status };
}

function toLineOrderPayload(input: ShoppingListLineOrderInput) {
  return {
    ordered_qty: input.orderedQuantity ?? null,
    comment: input.comment ?? null,
  };
}

function toGroupOrderPayload(input: ShoppingListGroupOrderInput) {
  return {
    lines: input.lines.map((line: ShoppingListGroupOrderLineInput) => ({
      line_id: line.lineId,
      ordered_qty: line.orderedQuantity ?? null,
    })),
  };
}

function toSellerOrderNotePayload(input: ShoppingListSellerOrderNoteInput) {
  const trimmed = input.note.trim();
  return {
    note: trimmed,
  };
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
    invalidateShoppingListQueries(queryClient, listId);
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

export function useOrderShoppingListLineMutation() {
  const queryClient = useQueryClient();
  const { mutate: baseMutate, mutateAsync: baseMutateAsync, ...rest } = usePostShoppingListLinesOrderByLineId();

  const handleInvalidate = useCallback((listId: number | undefined) => {
    if (typeof listId !== 'number') {
      return;
    }
    invalidateShoppingListQueries(queryClient, listId);
  }, [queryClient]);

  const mutate = useCallback<
    (input: ShoppingListLineOrderInput, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    baseMutate(
      {
        path: { line_id: input.lineId } satisfies PostShoppingListLinesOrderByLineIdParameters['path'],
        body: toLineOrderPayload(input),
      },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          const response = data as ShoppingListLineResponseSchema_d9ccce0 | undefined;
          const resolvedListId = response?.shopping_list_id ?? input.listId;
          handleInvalidate(resolvedListId);
          options?.onSuccess?.(data, variables, context);
        },
      }
    );
  }, [baseMutate, handleInvalidate]);

  const mutateAsync = useCallback<
    (input: ShoppingListLineOrderInput, options?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, options) => {
    return baseMutateAsync(
      {
        path: { line_id: input.lineId } satisfies PostShoppingListLinesOrderByLineIdParameters['path'],
        body: toLineOrderPayload(input),
      },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          const response = data as ShoppingListLineResponseSchema_d9ccce0 | undefined;
          const resolvedListId = response?.shopping_list_id ?? input.listId;
          handleInvalidate(resolvedListId);
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

export function useOrderShoppingListGroupMutation() {
  const queryClient = useQueryClient();
  const { mutate: baseMutate, mutateAsync: baseMutateAsync, ...rest } = usePostShoppingListsSellerGroupsOrderByListIdAndGroupRef();

  const handleInvalidate = useCallback((listId: number) => {
    invalidateShoppingListQueries(queryClient, listId);
  }, [queryClient]);

  const mutate = useCallback<
    (input: ShoppingListGroupOrderInput, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    baseMutate(
      {
        path: {
          list_id: input.listId,
          group_ref: input.groupKey,
        } satisfies PostShoppingListsSellerGroupsOrderByListIdAndGroupRefParameters['path'],
        body: toGroupOrderPayload(input),
      },
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
    (input: ShoppingListGroupOrderInput, options?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, options) => {
    return baseMutateAsync(
      {
        path: {
          list_id: input.listId,
          group_ref: input.groupKey,
        } satisfies PostShoppingListsSellerGroupsOrderByListIdAndGroupRefParameters['path'],
        body: toGroupOrderPayload(input),
      },
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

export function useUpdateSellerOrderNoteMutation() {
  const queryClient = useQueryClient();
  const { mutate: baseMutate, mutateAsync: baseMutateAsync, ...rest } = usePutShoppingListsSellerGroupsOrderNoteByListIdAndSellerId();

  const handleInvalidate = useCallback((listId: number) => {
    invalidateShoppingListQueries(queryClient, listId);
  }, [queryClient]);

  const mutate = useCallback<
    (input: ShoppingListSellerOrderNoteInput, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    baseMutate(
      {
        path: {
          list_id: input.listId,
          seller_id: input.sellerId,
        } satisfies PutShoppingListsSellerGroupsOrderNoteByListIdAndSellerIdParameters['path'],
        body: toSellerOrderNotePayload(input),
      },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          handleInvalidate(input.listId);
          // Update local cache so the Ready view reflects the note without waiting on refetch.
          queryClient.setQueryData<ShoppingListDetail | undefined>(detailKey(input.listId), (current) => {
            if (!current) {
              return current;
            }
            const mappedNote = mapSellerOrderNote((data as ShoppingListSellerOrderNoteSchema_ceb40c1));
            const nextSellerOrderNotes = (() => {
              const notes = current.sellerOrderNotes.filter(note => note.sellerId !== mappedNote.sellerId);
              if (mappedNote.note) {
                notes.push(mappedNote);
              }
              return notes;
            })();
            const nextSellerGroups = current.sellerGroups.map((group) => {
              if ((group.sellerId ?? undefined) !== mappedNote.sellerId) {
                return group;
              }
              return {
                ...group,
                orderNote: mappedNote.note,
              };
            });
            return {
              ...current,
              sellerOrderNotes: nextSellerOrderNotes,
              sellerGroups: nextSellerGroups,
            };
          });
          options?.onSuccess?.(data, variables, context);
        },
      }
    );
  }, [baseMutate, handleInvalidate, queryClient]);

  const mutateAsync = useCallback<
    (input: ShoppingListSellerOrderNoteInput, options?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, options) => {
    return baseMutateAsync(
      {
        path: {
          list_id: input.listId,
          seller_id: input.sellerId,
        } satisfies PutShoppingListsSellerGroupsOrderNoteByListIdAndSellerIdParameters['path'],
        body: toSellerOrderNotePayload(input),
      },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          handleInvalidate(input.listId);
          queryClient.setQueryData<ShoppingListDetail | undefined>(detailKey(input.listId), (current) => {
            if (!current) {
              return current;
            }
            const mappedNote = mapSellerOrderNote((data as ShoppingListSellerOrderNoteSchema_ceb40c1));
            const notes = current.sellerOrderNotes.filter(note => note.sellerId !== mappedNote.sellerId);
            if (mappedNote.note) {
              notes.push(mappedNote);
            }
            const nextSellerGroups = current.sellerGroups.map((group) => {
              if ((group.sellerId ?? undefined) !== mappedNote.sellerId) {
                return group;
              }
              return {
                ...group,
                orderNote: mappedNote.note,
              };
            });
            return {
              ...current,
              sellerOrderNotes: notes,
              sellerGroups: nextSellerGroups,
            };
          });
          options?.onSuccess?.(data, variables, context);
        },
      }
    );
  }, [baseMutateAsync, handleInvalidate, queryClient]);

  return {
    ...rest,
    mutate,
    mutateAsync,
  };
}

function useShoppingListStatusMutationBase() {
  const queryClient = useQueryClient();
  const {
    mutate: baseMutate,
    mutateAsync: baseMutateAsync,
    ...rest
  } = usePutShoppingListsStatusByListId({
    onSuccess: (data, variables) => {
      const resolved = variables as ShoppingListStatusVariables | undefined;
      const listId = resolved?.path?.list_id;
      const nextStatus = resolved?.body?.status ?? (data as ShoppingListStatusUpdateSchema_46f0cf6 | undefined)?.status;

      if (typeof listId === 'number') {
        invalidateShoppingListQueries(queryClient, listId);
        if (nextStatus) {
          queryClient.setQueryData<ShoppingListDetail | undefined>(detailKey(listId), (current) => {
            if (!current) {
              return current;
            }
            const status = nextStatus;
            const hasOrderedLines = status === 'concept' ? false : current.hasOrderedLines;
            return {
              ...current,
              status,
              hasOrderedLines,
              canReturnToConcept: status === 'ready' ? !hasOrderedLines : false,
            };
          });
        }
      }
    },
  });

  const mutate = useCallback<
    (input: ShoppingListStatusUpdateInput, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    baseMutate(
      {
        path: { list_id: input.listId },
        body: toStatusPayload(input.status),
      },
      options
    );
  }, [baseMutate]);

  const mutateAsync = useCallback<
    (input: ShoppingListStatusUpdateInput, options?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, options) => {
    return baseMutateAsync(
      {
        path: { list_id: input.listId },
        body: toStatusPayload(input.status),
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

export function useUpdateShoppingListStatusMutation() {
  return useShoppingListStatusMutationBase();
}

export function useMarkShoppingListReadyMutation() {
  const {
    mutate: baseMutate,
    mutateAsync: baseMutateAsync,
    ...rest
  } = useShoppingListStatusMutationBase();

  const mutate = useCallback<
    (input: ShoppingListMarkReadyInput, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    baseMutate({ listId: input.listId, status: 'ready' }, options);
  }, [baseMutate]);

  const mutateAsync = useCallback<
    (input: ShoppingListMarkReadyInput, options?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, options) => {
    return baseMutateAsync({ listId: input.listId, status: 'ready' }, options);
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
