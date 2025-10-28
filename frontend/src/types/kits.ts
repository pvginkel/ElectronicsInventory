import type {
  KitDetailResponseSchema_b98797e,
  KitDetailResponseSchema_b98797e_KitContentDetailSchema,
  KitDetailResponseSchema_b98797e_KitPickListSummarySchema,
  KitDetailResponseSchema_b98797e_KitReservationEntrySchema,
  KitDetailResponseSchema_b98797e_KitShoppingListLinkSchema,
  KitDetailResponseSchema_b98797e_PartListSchema,
  KitSummarySchemaList_a9993e3_KitStatus,
  KitSummarySchemaList_a9993e3_KitSummarySchema,
} from '@/lib/api/generated/hooks';
import type { ShoppingListStatus } from '@/types/shopping-lists';

export type KitStatus = KitSummarySchemaList_a9993e3_KitStatus;
export type KitSummaryRecord = KitSummarySchemaList_a9993e3_KitSummarySchema;

export interface KitSummary {
  id: number;
  name: string;
  description: string | null;
  status: KitStatus;
  buildTarget: number;
  archivedAt: string | null;
  updatedAt: string;
  shoppingListBadgeCount: number;
  pickListBadgeCount: number;
}

export interface KitOverviewBuckets {
  active: KitSummary[];
  archived: KitSummary[];
}

export interface KitOverviewCounts {
  active: number;
  archived: number;
}

export interface KitOverviewQueryResult {
  status: KitStatus;
  kits: KitSummary[];
  total: number;
  isFiltered: boolean;
}

export interface KitLifecycleMetadata {
  kitId: number;
  targetStatus: KitStatus;
}

export function mapKitSummary(model: KitSummarySchemaList_a9993e3_KitSummarySchema): KitSummary {
  return {
    id: model.id,
    name: model.name,
    description: model.description ?? null,
    status: model.status,
    buildTarget: model.build_target,
    archivedAt: model.archived_at ?? null,
    updatedAt: model.updated_at,
    shoppingListBadgeCount: model.shopping_list_badge_count ?? 0,
    pickListBadgeCount: model.pick_list_badge_count ?? 0,
  };
}

export function toKitSummaryRecord(summary: KitSummary): KitSummaryRecord {
  return {
    id: summary.id,
    name: summary.name,
    description: summary.description,
    status: summary.status,
    build_target: summary.buildTarget,
    archived_at: summary.archivedAt,
    updated_at: summary.updatedAt,
    shopping_list_badge_count: summary.shoppingListBadgeCount,
    pick_list_badge_count: summary.pickListBadgeCount,
  };
}

export interface KitShoppingListMembership {
  id: number;
  listId: number;
  listName: string;
  status: ShoppingListStatus;
  requestedUnits: number;
  honorReserved: boolean;
  snapshotKitUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface KitShoppingListMembershipSummary {
  kitId: number;
  memberships: KitShoppingListMembership[];
  hasActiveMembership: boolean;
  listNames: string[];
  conceptListIds: number[];
  activeCount: number;
  conceptCount: number;
  readyCount: number;
  completedCount: number;
}

export type KitPickListStatus = 'open' | 'completed';

export interface KitPickListMembership {
  id: number;
  kitId: number;
  status: KitPickListStatus;
  requestedUnits: number;
  lineCount: number;
  openLineCount: number;
  completedLineCount: number;
  totalQuantityToPick: number;
  pickedQuantity: number;
  remainingQuantity: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface KitPickListMembershipSummary {
  kitId: number;
  memberships: KitPickListMembership[];
  hasOpenMembership: boolean;
  totalCount: number;
  openCount: number;
  completedCount: number;
}

export interface KitReservationEntry {
  kitId: number;
  kitName: string;
  status: KitStatus;
  reservedQuantity: number;
  requiredPerUnit: number;
  buildTarget: number;
  updatedAt: string;
}

export interface KitContentPartSummary {
  id: number;
  key: string;
  description: string;
  manufacturerCode: string | null;
}

export interface KitContentRow {
  id: number;
  partId: number;
  part: KitContentPartSummary;
  requiredPerUnit: number;
  totalRequired: number;
  inStock: number;
  reserved: number;
  available: number;
  shortfall: number;
  version: number;
  note: string | null;
  activeReservations: KitReservationEntry[];
}

export interface KitShoppingListPreviewRow {
  contentId: number;
  partId: number;
  partKey: string;
  partDescription: string;
  requestedUnits: number;
  requiredPerUnit: number;
  totalRequired: number;
  availableHonoringReserved: number;
  availableIgnoringReserved: number;
  neededWithHonor: number;
  neededWithoutHonor: number;
}

export interface KitShoppingListPreviewSummary {
  totalNeededWithHonor: number;
  totalNeededWithoutHonor: number;
  linesWithNeedWithHonor: number;
  linesWithNeedWithoutHonor: number;
}

export interface KitShoppingListPreview {
  rows: KitShoppingListPreviewRow[];
  summary: KitShoppingListPreviewSummary;
}

/**
 * Derive per-part quantities for the shopping list dialog preview.
 * Keeps both honor-reserved and ignore-reserved projections so the UI can
 * surface the delta alongside the toggle without recomputing.
 */
export function buildKitShoppingListPreview(contents: KitContentRow[], requestedUnits: number): KitShoppingListPreview {
  const normalizedUnits = Number.isFinite(requestedUnits) ? Math.max(0, Math.trunc(requestedUnits)) : 0;

  if (normalizedUnits <= 0 || contents.length === 0) {
    return {
      rows: [],
      summary: {
        totalNeededWithHonor: 0,
        totalNeededWithoutHonor: 0,
        linesWithNeedWithHonor: 0,
        linesWithNeedWithoutHonor: 0,
      },
    };
  }

  const computedRows = contents.map<KitShoppingListPreviewRow>((row) => {
    const requiredPerUnit = clampNonNegative(row.requiredPerUnit);
    const totalRequired = requiredPerUnit * normalizedUnits;
    const availableHonoringReserved = clampNonNegative(row.available);
    const availableIgnoringReserved = clampNonNegative(row.inStock);
    const neededWithHonor = Math.max(totalRequired - availableHonoringReserved, 0);
    const neededWithoutHonor = Math.max(totalRequired - availableIgnoringReserved, 0);

    return {
      contentId: row.id,
      partId: row.partId,
      partKey: row.part.key,
      partDescription: row.part.description,
      requestedUnits: normalizedUnits,
      requiredPerUnit,
      totalRequired,
      availableHonoringReserved,
      availableIgnoringReserved,
      neededWithHonor,
      neededWithoutHonor,
    };
  });

  const summary = computedRows.reduce<KitShoppingListPreviewSummary>(
    (totals, row) => ({
      totalNeededWithHonor: totals.totalNeededWithHonor + row.neededWithHonor,
      totalNeededWithoutHonor: totals.totalNeededWithoutHonor + row.neededWithoutHonor,
      linesWithNeedWithHonor: totals.linesWithNeedWithHonor + (row.neededWithHonor > 0 ? 1 : 0),
      linesWithNeedWithoutHonor: totals.linesWithNeedWithoutHonor + (row.neededWithoutHonor > 0 ? 1 : 0),
    }),
    {
      totalNeededWithHonor: 0,
      totalNeededWithoutHonor: 0,
      linesWithNeedWithHonor: 0,
      linesWithNeedWithoutHonor: 0,
    }
  );

  const sortedRows = [...computedRows].sort((a, b) => {
    const honorDelta = b.neededWithHonor - a.neededWithHonor;
    if (honorDelta !== 0) {
      return honorDelta;
    }
    const withoutHonorDelta = b.neededWithoutHonor - a.neededWithoutHonor;
    if (withoutHonorDelta !== 0) {
      return withoutHonorDelta;
    }
    return a.partKey.localeCompare(b.partKey);
  });

  return {
    rows: sortedRows,
    summary,
  };
}

export interface KitShoppingListLink {
  id: number;
  shoppingListId: number;
  name: string;
  status: ShoppingListStatus;
  honorReserved: boolean;
  requestedUnits: number;
  snapshotKitUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface KitPickListSummary {
  id: number;
  kitId: number;
  status: 'open' | 'completed';
  requestedUnits: number;
  lineCount: number;
  openLineCount: number;
  completedLineCount: number;
  totalQuantityToPick: number;
  pickedQuantity: number;
  remainingQuantity: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface KitDetail {
  id: number;
  name: string;
  description: string | null;
  status: KitStatus;
  buildTarget: number;
  shoppingListBadgeCount: number;
  shoppingListLinks: KitShoppingListLink[];
  pickListBadgeCount: number;
  pickLists: KitPickListSummary[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  contents: KitContentRow[];
}

export interface KitContentAggregates {
  contentCount: number;
  totalRequired: number;
  totalAvailable: number;
  totalReserved: number;
  totalShortfall: number;
  shortfallCount: number;
}

export function mapKitDetail(model: KitDetailResponseSchema_b98797e): KitDetail {
  return {
    id: model.id,
    name: model.name,
    description: model.description ?? null,
    status: model.status,
    buildTarget: model.build_target,
    shoppingListBadgeCount: clampNonNegative(model.shopping_list_badge_count),
    shoppingListLinks: mapKitShoppingListLinks(model.shopping_list_links),
    pickListBadgeCount: clampNonNegative(model.pick_list_badge_count),
    pickLists: mapKitPickLists(model.pick_lists),
    archivedAt: model.archived_at ?? null,
    createdAt: model.created_at,
    updatedAt: model.updated_at,
    contents: mapKitContents(model.contents),
  };
}

export function summarizeKitContents(contents: KitContentRow[]): KitContentAggregates {
  if (contents.length === 0) {
    return {
      contentCount: 0,
      totalRequired: 0,
      totalAvailable: 0,
      totalReserved: 0,
      totalShortfall: 0,
      shortfallCount: 0,
    };
  }

  return contents.reduce<KitContentAggregates>(
    (accumulator, row) => {
      const required = clampNonNegative(row.totalRequired);
      const available = clampNonNegative(row.available);
      const reserved = clampNonNegative(row.reserved);
      const shortfall = clampNonNegative(row.shortfall);

      return {
        contentCount: accumulator.contentCount + 1,
        totalRequired: accumulator.totalRequired + required,
        totalAvailable: accumulator.totalAvailable + available,
        totalReserved: accumulator.totalReserved + reserved,
        totalShortfall: accumulator.totalShortfall + shortfall,
        shortfallCount: accumulator.shortfallCount + (shortfall > 0 ? 1 : 0),
      };
    },
    {
      contentCount: 0,
      totalRequired: 0,
      totalAvailable: 0,
      totalReserved: 0,
      totalShortfall: 0,
      shortfallCount: 0,
    }
  );
}

function mapKitContents(contents?: KitDetailResponseSchema_b98797e_KitContentDetailSchema[] | null): KitContentRow[] {
  if (!contents?.length) {
    return [];
  }

  return contents.map(mapKitContentRow);
}

function mapKitContentRow(model: KitDetailResponseSchema_b98797e_KitContentDetailSchema): KitContentRow {
  return {
    id: model.id,
    partId: model.part_id,
    part: mapKitContentPart(model.part, model.part_id),
    requiredPerUnit: clampNonNegative(model.required_per_unit),
    totalRequired: clampNonNegative(model.total_required),
    inStock: clampNonNegative(model.in_stock),
    reserved: clampNonNegative(model.reserved),
    available: clampNonNegative(model.available),
    shortfall: clampNonNegative(model.shortfall),
    version: clampNonNegative(model.version),
    note: model.note ?? null,
    activeReservations: mapKitReservations(model.active_reservations),
  };
}

function mapKitContentPart(
  part: KitDetailResponseSchema_b98797e_PartListSchema | undefined,
  partId: number
): KitContentPartSummary {
  return {
    id: partId,
    key: part?.key ?? '',
    description: part?.description ?? '',
    manufacturerCode: part?.manufacturer_code ?? null,
  };
}

function mapKitReservations(
  reservations?: KitDetailResponseSchema_b98797e_KitReservationEntrySchema[] | null
): KitReservationEntry[] {
  if (!reservations?.length) {
    return [];
  }

  return reservations.map(mapKitReservation);
}

function mapKitReservation(model: KitDetailResponseSchema_b98797e_KitReservationEntrySchema): KitReservationEntry {
  return {
    kitId: model.kit_id,
    kitName: model.kit_name,
    status: model.status,
    reservedQuantity: clampNonNegative(model.reserved_quantity),
    requiredPerUnit: clampNonNegative(model.required_per_unit),
    buildTarget: clampNonNegative(model.build_target),
    updatedAt: model.updated_at,
  };
}

export function mapKitShoppingListLinks(
  links?: KitDetailResponseSchema_b98797e_KitShoppingListLinkSchema[] | null
): KitShoppingListLink[] {
  if (!links?.length) {
    return [];
  }

  return links.map(mapKitShoppingListLink);
}

export function mapKitShoppingListLink(model: KitDetailResponseSchema_b98797e_KitShoppingListLinkSchema): KitShoppingListLink {
  return {
    id: model.id,
    shoppingListId: model.shopping_list_id,
    name: model.shopping_list_name,
    status: model.status,
    honorReserved: model.honor_reserved,
    requestedUnits: clampNonNegative(model.requested_units),
    snapshotKitUpdatedAt: model.snapshot_kit_updated_at,
    createdAt: model.created_at,
    updatedAt: model.updated_at,
  };
}

function mapKitPickLists(
  pickLists?: KitDetailResponseSchema_b98797e_KitPickListSummarySchema[] | null
): KitPickListSummary[] {
  if (!pickLists?.length) {
    return [];
  }

  return pickLists.map(mapKitPickList);
}

function mapKitPickList(model: KitDetailResponseSchema_b98797e_KitPickListSummarySchema): KitPickListSummary {
  return {
    id: model.id,
    kitId: model.kit_id,
    status: model.status,
    requestedUnits: clampNonNegative(model.requested_units),
    lineCount: clampNonNegative(model.line_count),
    openLineCount: clampNonNegative(model.open_line_count),
    completedLineCount: clampNonNegative(model.completed_line_count),
    totalQuantityToPick: clampNonNegative(model.total_quantity_to_pick),
    pickedQuantity: clampNonNegative(model.picked_quantity),
    remainingQuantity: clampNonNegative(model.remaining_quantity),
    createdAt: model.created_at,
    updatedAt: model.updated_at,
    completedAt: model.completed_at ?? null,
  };
}

function clampNonNegative(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
}
