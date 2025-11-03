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
  usePostShoppingListLinesReceiveByLineId,
  usePostShoppingListLinesCompleteByLineId,
  usePostShoppingListLinesRevertByLineId,
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
  type ShoppingListLineStatusUpdateSchema_d9ccce0,
  type ShoppingListLineReceiveSchema_d9ccce0,
  type ShoppingListLineReceiveSchema_d9ccce0_ShoppingListLineReceiveAllocationSchema,
  type ShoppingListLineCompleteSchema_d9ccce0,
  type ShoppingListStatusUpdateSchema_46f0cf6,
  type PartShoppingListMembershipCreateSchema_d085feb,
  type PostPartsShoppingListMembershipsByPartKeyParameters,
  type PutShoppingListsSellerGroupsOrderNoteByListIdAndSellerIdParameters,
  type PostShoppingListsSellerGroupsOrderByListIdAndGroupRefParameters,
  type PostShoppingListLinesOrderByLineIdParameters,
  type PostShoppingListLinesReceiveByLineIdParameters,
  type PostShoppingListLinesCompleteByLineIdParameters,
  type PostShoppingListLinesRevertByLineIdParameters,
  type ShoppingListSellerOrderNoteSchema_ceb40c1,
} from '@/lib/api/generated/hooks';
import {
  type ShoppingListConceptLine,
  type ShoppingListLineCompleteInput,
  type ShoppingListLinePartLocation,
  type ShoppingListLineReceiveAllocationInput,
  type ShoppingListLineReceiveInput,
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
  type ShoppingListOption,
  type ShoppingListOverviewSummary,
  type ShoppingListOverviewCounters,
  type ShoppingListSellerGroup,
  type ShoppingListSellerGroupTotals,
  type ShoppingListSellerGroupVisibility,
  type ShoppingListSellerGroupInstrumentation,
  type ShoppingListSellerOrderNote,
  type ShoppingListSellerOrderNoteInput,
  type ShoppingListStatus,
  type ShoppingListStatusUpdateInput,
  type ShoppingListUpdateInput,
} from '@/types/shopping-lists';
import { invalidatePartMemberships } from '@/hooks/use-part-shopping-list-memberships';

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

function invalidateInventoryQueries(queryClient: ReturnType<typeof useQueryClient>, partKey: string) {
  invalidatePartMemberships(queryClient, partKey);
  queryClient.invalidateQueries({ queryKey: ['getPartsByPartKey'] });
  queryClient.invalidateQueries({ queryKey: ['getPartsLocationsByPartKey'] });
  queryClient.invalidateQueries({ queryKey: ['getPartsWithLocations'] });
  queryClient.invalidateQueries({ queryKey: ['getPartsHistoryByPartKey'] });
  queryClient.invalidateQueries({ queryKey: ['getBoxes'] });
  queryClient.invalidateQueries({ queryKey: ['getBoxesByBoxNo'] });
  queryClient.invalidateQueries({ queryKey: ['getBoxesLocationsByBoxNo'] });
  queryClient.invalidateQueries({ queryKey: ['getBoxesUsageByBoxNo'] });
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

type AnyPartLocationResponse =
  | ShoppingListResponseSchema_46f0cf6_ShoppingListLineResponseSchema['part_locations']
  | ShoppingListLineResponseSchema_d9ccce0['part_locations']
  | undefined
  | null;

function mapPartLocations(locations: AnyPartLocationResponse): ShoppingListLinePartLocation[] {
  if (!locations?.length) {
    return [];
  }
  return locations.map((location) => ({
    id: location.id,
    boxNo: location.box_no,
    locNo: location.loc_no,
    quantity: location.qty,
  }));
}

type AnyShoppingListLineResponse = ShoppingListResponseSchema_46f0cf6_ShoppingListLineResponseSchema | ShoppingListLineResponseSchema_d9ccce0;

function mapConceptLine(line: AnyShoppingListLineResponse): ShoppingListConceptLine {
  const normalizedStatus: ShoppingListConceptLine['status'] =
    line.status === 'ordered' && line.ordered === 0 ? 'new' : line.status;

  return {
    id: line.id,
    shoppingListId: line.shopping_list_id,
    needed: line.needed,
    ordered: line.ordered,
    received: line.received,
    note: line.note,
    status: normalizedStatus,
    createdAt: line.created_at,
    updatedAt: line.updated_at,
    canReceive: line.can_receive,
    isOrderable: line.is_orderable,
    isRevertible: line.is_revertible,
    hasQuantityMismatch: line.has_quantity_mismatch,
    completionMismatch: line.completion_mismatch,
    completionNote: line.completion_note,
    partLocations: mapPartLocations(line.part_locations),
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

function computeLineCountsFromLines(lines: ShoppingListConceptLine[]): ShoppingListLineCounts {
  return lines.reduce<ShoppingListLineCounts>((acc, line) => {
    switch (line.status) {
      case 'done':
        acc.done += 1;
        break;
      case 'ordered':
        acc.ordered += 1;
        break;
      default:
        acc.new += 1;
        break;
    }
    return acc;
  }, { new: 0, ordered: 0, done: 0 });
}

function mergeUpdatedLineIntoDetail(
  queryClient: ReturnType<typeof useQueryClient>,
  listId: number,
  updatedLine: ShoppingListConceptLine
) {
  queryClient.setQueryData<ShoppingListDetail | undefined>(detailKey(listId), (current) => {
    if (!current) {
      return current;
    }

    const lines = current.lines.some(line => line.id === updatedLine.id)
      ? current.lines.map(line => (line.id === updatedLine.id ? updatedLine : line))
      : [...current.lines, updatedLine];
    const lineCounts = computeLineCountsFromLines(lines);
    const sellerGroups = updateSellerGroupsWithLine(current.sellerGroups, updatedLine);

    if (import.meta.env.DEV) {
      console.debug('mergeUpdatedLineIntoDetail', {
        lineId: updatedLine.id,
        status: updatedLine.status,
        ordered: updatedLine.ordered,
        received: updatedLine.received,
      });
    }

    return {
      ...current,
      lines,
      lineCounts,
      hasOrderedLines: lineCounts.ordered > 0,
      canReturnToConcept: current.status === 'ready' && lineCounts.ordered === 0,
      sellerGroups,
    };
  });
}

function updateSellerGroupsWithLine(
  groups: ShoppingListSellerGroup[] | undefined,
  updatedLine: ShoppingListConceptLine
): ShoppingListSellerGroup[] {
  if (!groups?.length) {
    return [];
  }

  const groupContainingLine = groups.find(group => group.lines.some(line => line.id === updatedLine.id));
  const currentGroupKey = groupContainingLine?.groupKey ?? null;
  const targetGroupKey = updatedLine.effectiveSeller?.id != null
    ? groups.find(group => group.sellerId === updatedLine.effectiveSeller?.id)?.groupKey ?? currentGroupKey
    : currentGroupKey;

  return groups.map((group) => {
    const containsLine = group.lines.some(line => line.id === updatedLine.id);
    let nextLines = group.lines;

    if (containsLine && group.groupKey !== targetGroupKey) {
      nextLines = group.lines.filter(line => line.id !== updatedLine.id);
    } else if (group.groupKey === targetGroupKey) {
      const existingIndex = group.lines.findIndex(line => line.id === updatedLine.id);
      if (existingIndex >= 0) {
        nextLines = group.lines.map(line => line.id === updatedLine.id ? updatedLine : line);
      } else {
        nextLines = [...group.lines, updatedLine];
      }
    }

    const totals = {
      needed: nextLines.reduce((sum, line) => sum + line.needed, 0),
      ordered: nextLines.reduce((sum, line) => sum + line.ordered, 0),
      received: nextLines.reduce((sum, line) => sum + line.received, 0),
    };

    return {
      ...group,
      lines: nextLines,
      totals,
      hasOrderedLines: nextLines.some(line => line.status === 'ordered'),
      hasNewLines: nextLines.some(line => line.status === 'new'),
      hasDoneLines: nextLines.some(line => line.status === 'done'),
    };
  });
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

function mapOverviewToOption(list: ShoppingListOverviewSummary): ShoppingListOption {
  return {
    id: list.id,
    name: list.name,
    status: list.status,
    lineCounts: list.lineCounts,
  };
}

function mapShoppingListDetail(detail: ShoppingListResponseSchema_46f0cf6): ShoppingListDetail {
  const lines = detail.lines.map(mapConceptLine);
  const lineCounts = computeLineCountsFromLines(lines);
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

// Guidepost: shared collators keep alphabetical ordering deterministic across browsers and locales.
const listCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function compareByDescription(a: ShoppingListConceptLine, b: ShoppingListConceptLine): number {
  const comparison = listCollator.compare(a.part.description, b.part.description);
  if (comparison !== 0) {
    return comparison;
  }
  return a.id - b.id;
}

function compareByMpn(a: ShoppingListConceptLine, b: ShoppingListConceptLine): number {
  const left = a.part.manufacturerCode ?? a.part.key;
  const right = b.part.manufacturerCode ?? b.part.key;
  const comparison = listCollator.compare(left, right);
  if (comparison !== 0) {
    return comparison;
  }
  return a.id - b.id;
}

function compareByCreatedAt(a: ShoppingListConceptLine, b: ShoppingListConceptLine): number {
  const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (diff !== 0) {
    return diff;
  }
  return a.id - b.id;
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

export function sortSellerGroupsForReadyView(
  groups: ShoppingListSellerGroup[]
): ShoppingListSellerGroup[] {
  const compareGroups = (a: ShoppingListSellerGroup, b: ShoppingListSellerGroup) => {
    const aUngrouped = a.sellerId == null;
    const bUngrouped = b.sellerId == null;

    if (aUngrouped && bUngrouped) {
      return listCollator.compare(a.groupKey, b.groupKey);
    }
    if (aUngrouped) {
      return 1;
    }
    if (bUngrouped) {
      return -1;
    }

    const nameComparison = listCollator.compare(a.sellerName ?? '', b.sellerName ?? '');
    if (nameComparison !== 0) {
      return nameComparison;
    }

    return listCollator.compare(a.groupKey, b.groupKey);
  };

  const sortLinesByDescription = (lines: ShoppingListConceptLine[]) => {
    return [...lines].sort((a, b) => compareByDescription(a, b));
  };

  return [...groups]
    .sort(compareGroups)
    .map((group) => ({
      ...group,
      lines: sortLinesByDescription(group.lines),
    }));
}

export function summarizeSellerGroupVisibility(group: ShoppingListSellerGroup): ShoppingListSellerGroupVisibility {
  const visibleTotals = group.lines.reduce<ShoppingListSellerGroupTotals>((accumulator, line) => {
    return {
      needed: accumulator.needed + line.needed,
      ordered: accumulator.ordered + line.ordered,
      received: accumulator.received + line.received,
    };
  }, { needed: 0, ordered: 0, received: 0 });

  const backendTotals = group.totals;
  const backendSum = backendTotals.needed + backendTotals.ordered + backendTotals.received;
  const visibleSum = visibleTotals.needed + visibleTotals.ordered + visibleTotals.received;
  const filteredDiff = Math.max(backendSum - visibleSum, 0);

  return {
    visibleTotals,
    filteredDiff,
  };
}

export function buildSellerGroupInstrumentation(
  groups: ShoppingListSellerGroup[]
): ShoppingListSellerGroupInstrumentation[] {
  return groups.map((group) => {
    const visibility = summarizeSellerGroupVisibility(group);
    return {
      groupKey: group.groupKey,
      totals: group.totals,
      visibleTotals: visibility.visibleTotals,
      filteredDiff: visibility.filteredDiff,
    };
  });
}

export function flattenReceivableLines(
  groups: ShoppingListSellerGroup[]
): ShoppingListConceptLine[] {
  const orderedGroups = sortSellerGroupsForReadyView(groups);
  const orderedLines: ShoppingListConceptLine[] = [];
  for (const group of orderedGroups) {
    for (const line of group.lines) {
      if (line.status === 'ordered') {
        orderedLines.push(line);
      }
    }
  }
  return orderedLines;
}

export function findNextReceivableLine(
  currentLineId: number,
  groups: ShoppingListSellerGroup[]
): ShoppingListConceptLine | undefined {
  const orderedLines = flattenReceivableLines(groups);
  const currentIndex = orderedLines.findIndex(line => line.id === currentLineId);
  if (currentIndex < 0) {
    return undefined;
  }
  for (let index = currentIndex + 1; index < orderedLines.length; index += 1) {
    const candidate = orderedLines[index];
    if (candidate.canReceive) {
      return candidate;
    }
  }
  return undefined;
}

const selectOverviewLists = (data?: ShoppingListListSchemaList_a9993e3_ShoppingListListSchema[]): ShoppingListOverviewSummary[] => {
  if (!data) {
    return [];
  }
  return data.map(mapOverviewSummary);
};

const DEFAULT_SELECTOR_STATUSES: ShoppingListStatus[] = ['concept'];

export interface UseShoppingListOptionsParams {
  statuses: ShoppingListStatus[];
  enabled?: boolean;
}

export interface UseShoppingListOptionsResult {
  options: ShoppingListOption[];
  statuses: ShoppingListStatus[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: unknown;
  refetch: ReturnType<typeof useGetShoppingLists>['refetch'];
}

export function useShoppingListOptions({
  statuses,
  enabled = true,
}: UseShoppingListOptionsParams): UseShoppingListOptionsResult {
  const statusesKey = useMemo(() => {
    if (!statuses?.length) {
      return DEFAULT_SELECTOR_STATUSES.join('|');
    }
    return statuses.join('|');
  }, [statuses]);

  const normalizedStatuses = useMemo<ShoppingListStatus[]>(() => {
    const raw = statusesKey?.length ? (statusesKey.split('|') as ShoppingListStatus[]) : [];
    const seen = new Set<ShoppingListStatus>();
    const deduped: ShoppingListStatus[] = [];

    const source = raw.length ? raw : DEFAULT_SELECTOR_STATUSES;
    for (const status of source) {
      if (status && !seen.has(status)) {
        seen.add(status);
        deduped.push(status);
      }
    }

    return deduped.length ? deduped : [...DEFAULT_SELECTOR_STATUSES];
  }, [statusesKey]);

  const params = useMemo(() => ({
    query: { status: normalizedStatuses },
  }), [normalizedStatuses]);

  const query = useGetShoppingLists(params, { enabled });
  const summaries = useMemo<ShoppingListOverviewSummary[]>(() => selectOverviewLists(query.data), [query.data]);
  const allowedStatuses = useMemo<Set<ShoppingListStatus>>(
    () => new Set(normalizedStatuses),
    [normalizedStatuses],
  );
  const options = useMemo<ShoppingListOption[]>(() => {
    if (!summaries.length) {
      return [];
    }
    return summaries
      .filter((summary) => allowedStatuses.has(summary.status))
      .map(mapOverviewToOption);
  }, [summaries, allowedStatuses]);

  return {
    options,
    statuses: normalizedStatuses,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError ?? false,
    isSuccess: query.isSuccess ?? false,
    error: query.error,
    refetch: query.refetch,
  };
}

const selectShoppingListDetail = (data?: ShoppingListResponseSchema_46f0cf6): ShoppingListDetail | undefined => {
  return data ? mapShoppingListDetail(data) : undefined;
};

export function useShoppingListsOverview() {
  const overviewQueryParams = useMemo(() => ({ query: { include_done: true as const } }), []);
  const query = useGetShoppingLists(overviewQueryParams);
  const lists = useMemo<ShoppingListOverviewSummary[]>(() => selectOverviewLists(query.data), [query.data]);
  const counters = useMemo<ShoppingListOverviewCounters>(() => {
    let activeCount = 0;
    let completedCount = 0;
    let withLines = 0;

    for (const list of lists) {
      if (list.status === 'done') {
        completedCount += 1;
      } else {
        activeCount += 1;
      }
      if (list.hasLines) {
        withLines += 1;
      }
    }

    return {
      total: lists.length,
      withLines,
      activeCount,
      completedCount,
    };
  }, [lists]);

  const getReadyMetadata = useCallback(() => ({
    ...counters,
  }), [counters]);

  const getErrorMetadata = useCallback((error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  }), []);

  return {
    ...query,
    lists,
    overviewCounters: counters,
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
  const isCompleted = shoppingList?.status === 'done';
  const hasNewLines = Boolean(shoppingList?.lineCounts.new);
  const sellerGroupsByKey = useMemo<Map<string, ShoppingListSellerGroup>>(() => {
    const entries: Array<[string, ShoppingListSellerGroup]> = [];
    for (const group of sellerGroups) {
      entries.push([group.groupKey, group]);
    }
    return new Map(entries);
  }, [sellerGroups]);
  const duplicateCheck = useMemo(() => buildDuplicateCheck(lines), [lines]);
  const sellerGroupInstrumentation = useMemo(() => buildSellerGroupInstrumentation(sellerGroups), [sellerGroups]);
  const aggregatedFilteredDiff = useMemo(() => {
    return sellerGroupInstrumentation.reduce((total, group) => total + group.filteredDiff, 0);
  }, [sellerGroupInstrumentation]);

  const getReadyMetadata = useCallback((sortKey: ShoppingListLineSortKey) => {
    const status = shoppingList?.status ?? 'concept';
    const view = status === 'done' ? 'completed' : status === 'ready' ? 'ready' : status;
    return {
      status,
      view,
      lineCount: lines.length,
      groupCount: sellerGroups.length,
      ordered: shoppingList?.lineCounts.ordered ?? 0,
      sortKey,
      groupTotals: sellerGroupInstrumentation,
      filteredDiff: aggregatedFilteredDiff,
      hasNewLines,
    };
  }, [
    aggregatedFilteredDiff,
    hasNewLines,
    lines.length,
    sellerGroupInstrumentation,
    sellerGroups.length,
    shoppingList?.lineCounts.ordered,
    shoppingList?.status,
  ]);

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
    hasNewLines,
    isCompleted,
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

function toLineReceiveAllocationPayload(
  allocation: ShoppingListLineReceiveAllocationInput
): ShoppingListLineReceiveSchema_d9ccce0_ShoppingListLineReceiveAllocationSchema {
  return {
    box_no: allocation.boxNo,
    loc_no: allocation.locNo,
    qty: allocation.quantity,
  };
}

function toLineReceivePayload(input: ShoppingListLineReceiveInput): ShoppingListLineReceiveSchema_d9ccce0 {
  return {
    receive_qty: input.receiveQuantity,
    allocations: input.allocations.map(toLineReceiveAllocationPayload),
  };
}

function toLineCompletePayload(input: ShoppingListLineCompleteInput): ShoppingListLineCompleteSchema_d9ccce0 {
  return {
    mismatch_reason: input.mismatchReason ?? null,
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
      const partKey = resolved?.path?.part_key;
      if (partKey) {
        invalidatePartMemberships(queryClient, partKey);
      }
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
          invalidatePartMemberships(queryClient, input.partKey);
          options?.onSuccess?.(data, variables, context);
        },
      }
    );
  }, [baseMutate, handleInvalidate, queryClient]);

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
          invalidatePartMemberships(queryClient, input.partKey);
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

export function useDeleteShoppingListLineMutation() {
  const queryClient = useQueryClient();
  const { mutate: baseMutate, mutateAsync: baseMutateAsync, ...rest } = useDeleteShoppingListLinesByLineId();

  const handleInvalidate = useCallback((listId: number) => {
    invalidateShoppingListQueries(queryClient, listId);
  }, [queryClient]);

  const mutate = useCallback<
    (input: { lineId: number; listId: number; partKey?: string }, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    baseMutate(
      { path: { line_id: input.lineId } },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          handleInvalidate(input.listId);
          if (input.partKey) {
            invalidatePartMemberships(queryClient, input.partKey);
          }
          options?.onSuccess?.(data, variables, context);
        },
      }
    );
  }, [baseMutate, handleInvalidate, queryClient]);

  const mutateAsync = useCallback<
    (input: { lineId: number; listId: number; partKey?: string }, options?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, options) => {
    return baseMutateAsync(
      { path: { line_id: input.lineId } },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          handleInvalidate(input.listId);
          if (input.partKey) {
            invalidatePartMemberships(queryClient, input.partKey);
          }
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

export function useReceiveShoppingListLineMutation() {
  const queryClient = useQueryClient();
  const { mutate: baseMutate, mutateAsync: baseMutateAsync, ...rest } = usePostShoppingListLinesReceiveByLineId();

  const mutate = useCallback<
    (input: ShoppingListLineReceiveInput, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    baseMutate(
      {
        path: { line_id: input.lineId } satisfies PostShoppingListLinesReceiveByLineIdParameters['path'],
        body: toLineReceivePayload(input),
      },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          const response = data as ShoppingListLineResponseSchema_d9ccce0 | undefined;
          const resolvedListId = response?.shopping_list_id ?? input.listId;

          if (typeof resolvedListId === 'number' && response) {
            const updatedLine = mapConceptLine(response);
            mergeUpdatedLineIntoDetail(queryClient, resolvedListId, updatedLine);
            invalidateShoppingListQueries(queryClient, resolvedListId);
          } else if (typeof resolvedListId === 'number') {
            invalidateShoppingListQueries(queryClient, resolvedListId);
          }

          invalidateInventoryQueries(queryClient, input.partKey);
          options?.onSuccess?.(data, variables, context);
        },
      }
    );
  }, [baseMutate, queryClient]);

  const mutateAsync = useCallback<
    (input: ShoppingListLineReceiveInput, options?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, options) => {
    return baseMutateAsync(
      {
        path: { line_id: input.lineId } satisfies PostShoppingListLinesReceiveByLineIdParameters['path'],
        body: toLineReceivePayload(input),
      },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          const response = data as ShoppingListLineResponseSchema_d9ccce0 | undefined;
          const resolvedListId = response?.shopping_list_id ?? input.listId;

          if (typeof resolvedListId === 'number' && response) {
            const updatedLine = mapConceptLine(response);
            mergeUpdatedLineIntoDetail(queryClient, resolvedListId, updatedLine);
            invalidateShoppingListQueries(queryClient, resolvedListId);
          } else if (typeof resolvedListId === 'number') {
            invalidateShoppingListQueries(queryClient, resolvedListId);
          }

          invalidateInventoryQueries(queryClient, input.partKey);
          options?.onSuccess?.(data, variables, context);
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

export function useCompleteShoppingListLineMutation() {
  const queryClient = useQueryClient();
  const { mutate: baseMutate, mutateAsync: baseMutateAsync, ...rest } = usePostShoppingListLinesCompleteByLineId();

  const mutate = useCallback<
    (input: ShoppingListLineCompleteInput, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    baseMutate(
      {
        path: { line_id: input.lineId } satisfies PostShoppingListLinesCompleteByLineIdParameters['path'],
        body: toLineCompletePayload(input),
      },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          const response = data as ShoppingListLineResponseSchema_d9ccce0 | undefined;
          const resolvedListId = response?.shopping_list_id ?? input.listId;

          if (typeof resolvedListId === 'number' && response) {
            const updatedLine = mapConceptLine(response);
            mergeUpdatedLineIntoDetail(queryClient, resolvedListId, updatedLine);
            invalidateShoppingListQueries(queryClient, resolvedListId);
          } else if (typeof resolvedListId === 'number') {
            invalidateShoppingListQueries(queryClient, resolvedListId);
          }

          invalidateInventoryQueries(queryClient, input.partKey);
          options?.onSuccess?.(data, variables, context);
        },
      }
    );
  }, [baseMutate, queryClient]);

  const mutateAsync = useCallback<
    (input: ShoppingListLineCompleteInput, options?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, options) => {
    return baseMutateAsync(
      {
        path: { line_id: input.lineId } satisfies PostShoppingListLinesCompleteByLineIdParameters['path'],
        body: toLineCompletePayload(input),
      },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          const response = data as ShoppingListLineResponseSchema_d9ccce0 | undefined;
          const resolvedListId = response?.shopping_list_id ?? input.listId;

          if (typeof resolvedListId === 'number' && response) {
            const updatedLine = mapConceptLine(response);
            mergeUpdatedLineIntoDetail(queryClient, resolvedListId, updatedLine);
            invalidateShoppingListQueries(queryClient, resolvedListId);
          } else if (typeof resolvedListId === 'number') {
            invalidateShoppingListQueries(queryClient, resolvedListId);
          }

          invalidateInventoryQueries(queryClient, input.partKey);
          options?.onSuccess?.(data, variables, context);
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
          if (typeof resolvedListId === 'number') {
            const resolveUpdatedLine = (current: ShoppingListDetail | undefined) => {
              if (!current) {
                return undefined;
              }
              if (response) {
                return mapConceptLine(response);
              }
              const existing = current.lines.find(line => line.id === input.lineId);
              if (!existing) {
                return undefined;
              }
              if (input.orderedQuantity == null) {
                return {
                  ...existing,
                  ordered: 0,
                  status: 'new',
                  isRevertible: false,
                  canReceive: false,
                } satisfies ShoppingListConceptLine;
              }
              const nextStatus: ShoppingListConceptLine['status'] = input.orderedQuantity > 0 ? 'ordered' : 'new';
              return {
                ...existing,
                ordered: input.orderedQuantity,
                status: nextStatus,
                isRevertible: input.orderedQuantity > 0,
              } satisfies ShoppingListConceptLine;
            };

            queryClient.setQueryData<ShoppingListDetail | undefined>(detailKey(resolvedListId), (current) => {
              if (!current) {
                return current;
              }

              const updatedLine = resolveUpdatedLine(current);
              if (!updatedLine) {
                return current;
              }

              const lines = current.lines.some(existing => existing.id === updatedLine.id)
                ? current.lines.map(existing => existing.id === updatedLine.id ? updatedLine : existing)
                : current.lines;
              const lineCounts = computeLineCountsFromLines(lines);
              const sellerGroups = updateSellerGroupsWithLine(current.sellerGroups, updatedLine);
              if (import.meta.env.DEV) {
                console.debug('Updated line via mutation', {
                  lineId: updatedLine.id,
                  status: updatedLine.status,
                  ordered: updatedLine.ordered,
                  lineCounts,
                });
              }

              return {
                ...current,
                lines,
                lineCounts,
                hasOrderedLines: lineCounts.ordered > 0,
                canReturnToConcept: current.status === 'ready' && lineCounts.ordered === 0,
                sellerGroups,
              };
            });
          }
          options?.onSuccess?.(data, variables, context);
        },
      }
    );
  }, [baseMutate, handleInvalidate, queryClient]);

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
          if (typeof resolvedListId === 'number') {
            const resolveUpdatedLine = (current: ShoppingListDetail | undefined) => {
              if (!current) {
                return undefined;
              }
              if (response) {
                return mapConceptLine(response);
              }
              const existing = current.lines.find(line => line.id === input.lineId);
              if (!existing) {
                return undefined;
              }
              if (input.orderedQuantity == null) {
                return {
                  ...existing,
                  ordered: 0,
                  status: 'new',
                  isRevertible: false,
                  canReceive: false,
                } satisfies ShoppingListConceptLine;
              }
              const nextStatus: ShoppingListConceptLine['status'] = input.orderedQuantity > 0 ? 'ordered' : 'new';
              return {
                ...existing,
                ordered: input.orderedQuantity,
                status: nextStatus,
                isRevertible: input.orderedQuantity > 0,
              } satisfies ShoppingListConceptLine;
            };

            queryClient.setQueryData<ShoppingListDetail | undefined>(detailKey(resolvedListId), (current) => {
              if (!current) {
                return current;
              }

              const updatedLine = resolveUpdatedLine(current);
              if (!updatedLine) {
                return current;
              }

              const lines = current.lines.some(existing => existing.id === updatedLine.id)
                ? current.lines.map(existing => existing.id === updatedLine.id ? updatedLine : existing)
                : current.lines;
              const lineCounts = computeLineCountsFromLines(lines);
              const sellerGroups = updateSellerGroupsWithLine(current.sellerGroups, updatedLine);
              if (import.meta.env.DEV) {
                console.debug('Updated line via mutation', {
                  lineId: updatedLine.id,
                  status: updatedLine.status,
                  ordered: updatedLine.ordered,
                  lineCounts,
                });
              }

              return {
                ...current,
                lines,
                lineCounts,
                hasOrderedLines: lineCounts.ordered > 0,
                canReturnToConcept: current.status === 'ready' && lineCounts.ordered === 0,
                sellerGroups,
              };
            });
          }
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

export function useRevertShoppingListLineMutation() {
  const queryClient = useQueryClient();
  const { mutate: baseMutate, mutateAsync: baseMutateAsync, ...rest } = usePostShoppingListLinesRevertByLineId();

  const handleInvalidate = useCallback((listId: number | undefined) => {
    if (typeof listId !== 'number') {
      return;
    }
    invalidateShoppingListQueries(queryClient, listId);
  }, [queryClient]);

  const updateCache = useCallback((listId: number, lineId: number) => {
    queryClient.setQueryData<ShoppingListDetail | undefined>(detailKey(listId), (current) => {
      if (!current) {
        return current;
      }

      const existing = current.lines.find(line => line.id === lineId);
      if (!existing) {
        return current;
      }

      const updatedLine: ShoppingListConceptLine = {
        ...existing,
        ordered: 0,
        status: 'new',
        isRevertible: false,
        canReceive: false,
      };

      const lines = current.lines.map(line => line.id === lineId ? updatedLine : line);
      const lineCounts = computeLineCountsFromLines(lines);
      const sellerGroups = updateSellerGroupsWithLine(current.sellerGroups, updatedLine);

      return {
        ...current,
        lines,
        lineCounts,
        hasOrderedLines: lineCounts.ordered > 0,
        canReturnToConcept: current.status === 'ready' && lineCounts.ordered === 0,
        sellerGroups,
      };
    });
  }, [queryClient]);

  const mutate = useCallback<
    (input: { listId: number; lineId: number }, options?: Parameters<typeof baseMutate>[1]) => void
  >((input, options) => {
    baseMutate(
      {
        path: { line_id: input.lineId } satisfies PostShoppingListLinesRevertByLineIdParameters['path'],
        body: { status: 'new' } satisfies ShoppingListLineStatusUpdateSchema_d9ccce0,
      },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          handleInvalidate(input.listId);
          updateCache(input.listId, input.lineId);
          options?.onSuccess?.(data, variables, context);
        },
      }
    );
  }, [baseMutate, handleInvalidate, updateCache]);

  const mutateAsync = useCallback<
    (input: { listId: number; lineId: number }, options?: Parameters<typeof baseMutateAsync>[1]) => ReturnType<typeof baseMutateAsync>
  >((input, options) => {
    return baseMutateAsync(
      {
        path: { line_id: input.lineId } satisfies PostShoppingListLinesRevertByLineIdParameters['path'],
        body: { status: 'new' } satisfies ShoppingListLineStatusUpdateSchema_d9ccce0,
      },
      {
        ...options,
        onSuccess: (data, variables, context) => {
          handleInvalidate(input.listId);
          updateCache(input.listId, input.lineId);
          options?.onSuccess?.(data, variables, context);
        },
      }
    );
  }, [baseMutateAsync, handleInvalidate, updateCache]);

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
            const payload = data as ShoppingListSellerOrderNoteSchema_ceb40c1 | undefined;
            if (!payload) {
              return current;
            }
            const mappedNote = mapSellerOrderNote(payload);
            const nextSellerOrderNotes = (() => {
              const notes = (current.sellerOrderNotes ?? []).filter(note => note.sellerId !== mappedNote.sellerId);
              if (mappedNote.note) {
                return [...notes, mappedNote];
              }
              return notes;
            })();
            const nextSellerGroups = (current.sellerGroups ?? []).map((group) => {
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
            const payload = data as ShoppingListSellerOrderNoteSchema_ceb40c1 | undefined;
            if (!payload) {
              return current;
            }
            const mappedNote = mapSellerOrderNote(payload);
            const notes = (current.sellerOrderNotes ?? []).filter(note => note.sellerId !== mappedNote.sellerId);
            if (mappedNote.note) {
              notes.push(mappedNote);
            }
            const nextSellerGroups = (current.sellerGroups ?? []).map((group) => {
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
