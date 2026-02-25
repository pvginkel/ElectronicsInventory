/**
 * Shopping list domain types shared across overview and detail views.
 * These map generated API payloads into camelCase models we can reason about.
 */

import type { KitStatus } from '@/types/kits';
import type {
  KitChipSchemaList_a9993e3,
  KitChipSchemaList_a9993e3_KitChipSchema,
} from '@/lib/api/generated/hooks';

export type ShoppingListStatus = 'active' | 'done';
export type ShoppingListLineStatus = 'new' | 'ordered' | 'done';
export type ShoppingListSellerStatus = 'active' | 'ordered';

export interface ShoppingListLineCounts {
  /** `new` + `ordered` + `done` used for card rollups; counts stay non-negative. */
  new: number;
  ordered: number;
  done: number;
}

export interface ShoppingListOption extends Record<string, unknown> {
  id: number;
  name: string;
  status: ShoppingListStatus;
  lineCounts: ShoppingListLineCounts;
}

export interface ShoppingListOverviewSummary extends Record<string, unknown> {
  id: number;
  name: string;
  description: string | null;
  status: ShoppingListStatus;
  updatedAt: string;
  lineCounts: ShoppingListLineCounts;
  /** Derived helper so cards can show empty states without recalculating. */
  totalLines: number;
  hasLines: boolean;
  /** Provides quick attribution for overview cards and instrumentation metadata. */
  primarySellerName: string | null;
}

export interface ShoppingListOverviewCounters extends Record<string, unknown> {
  total: number;
  withLines: number;
  activeCount: number;
  completedCount: number;
}

export interface ShoppingListSellerGroupTotals {
  needed: number;
  ordered: number;
  received: number;
}

export interface ShoppingListSellerGroup extends Record<string, unknown> {
  groupKey: string;
  sellerId: number | null;
  sellerName: string | null;
  sellerWebsite: string | null;
  sellerLogoUrl: string | null;
  /** Seller group status: 'active' (ordering), 'ordered' (receiving), null for ungrouped. */
  status: ShoppingListSellerStatus | null;
  /** True when all lines in the group have status 'done'. */
  completed: boolean;
  orderNote: string | null;
  totals: ShoppingListSellerGroupTotals;
  lines: ShoppingListLine[];
  hasOrderedLines: boolean;
  hasNewLines: boolean;
  hasDoneLines: boolean;
}

export interface ShoppingListSellerGroupVisibility extends Record<string, unknown> {
  visibleTotals: ShoppingListSellerGroupTotals;
  filteredDiff: number;
}

export interface ShoppingListSellerGroupInstrumentation extends Record<string, unknown> {
  groupKey: string;
  totals: ShoppingListSellerGroupTotals;
  visibleTotals: ShoppingListSellerGroupTotals;
  filteredDiff: number;
}

export interface ShoppingListDetail extends ShoppingListOverviewSummary {
  createdAt: string;
  lines: ShoppingListLine[];
  sellerGroups: ShoppingListSellerGroup[];
  hasOrderedLines: boolean;
}

export interface ShoppingListKitLink extends Record<string, unknown> {
  linkId: number;
  kitId: number;
  kitName: string;
  kitStatus: KitStatus;
  requestedUnits: number;
  honorReserved: boolean;
  isStale: boolean;
  snapshotKitUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingListPartSummary {
  /** Numeric primary key for mutations that require part_id. */
  id: number;
  key: string;
  description: string;
  manufacturerCode: string | null;
  coverUrl: string | null;
}

export interface ShoppingListSellerSummary {
  id: number;
  name: string;
  website: string | null;
  logoUrl: string | null;
}

export interface ShoppingListLinePartLocation extends Record<string, unknown> {
  id: number;
  boxNo: number;
  locNo: number;
  quantity: number;
}

export interface ShoppingListLineReceiveAllocationInput extends Record<string, unknown> {
  boxNo: number;
  locNo: number;
  quantity: number;
}

export interface ShoppingListLineReceiveInput extends Record<string, unknown> {
  listId: number;
  lineId: number;
  partKey: string;
  receiveQuantity: number;
  allocations: ShoppingListLineReceiveAllocationInput[];
}

export interface ShoppingListLineCompleteInput extends Record<string, unknown> {
  listId: number;
  lineId: number;
  partKey: string;
  mismatchReason: string | null;
}

export interface ShoppingListMembership extends Record<string, unknown> {
  listId: number;
  listName: string;
  listStatus: ShoppingListStatus;
  lineId: number;
  lineStatus: ShoppingListLineStatus;
  needed: number;
  ordered: number;
  received: number;
  note: string | null;
  seller: ShoppingListSellerSummary | null;
}

export interface ShoppingListMembershipSummary extends Record<string, unknown> {
  partKey: string;
  memberships: ShoppingListMembership[];
  hasActiveMembership: boolean;
  listNames: string[];
  activeListIds: number[];
  activeCount: number;
  completedCount: number;
}

export interface ShoppingListLine extends Record<string, unknown> {
  id: number;
  shoppingListId: number;
  needed: number; // >= 1
  ordered: number;
  received: number;
  note: string | null;
  status: ShoppingListLineStatus;
  createdAt: string;
  updatedAt: string;
  // Inline flags expose backend prohibitions (receive/order toggles) to the UI.
  canReceive: boolean;
  isOrderable: boolean;
  isRevertible: boolean;
  hasQuantityMismatch: boolean;
  completionMismatch: boolean;
  completionNote: string | null;
  partLocations: ShoppingListLinePartLocation[];
  part: ShoppingListPartSummary;
  seller: ShoppingListSellerSummary | null;
  effectiveSeller: ShoppingListSellerSummary | null;
  /** Seller-specific product page URL from the part-seller link table. */
  sellerLink: string | null;
}

export type ShoppingListLineSortKey = 'description' | 'mpn' | 'createdAt';

export interface ShoppingListLineSortOption {
  key: ShoppingListLineSortKey;
  label: string;
}

export function mapShoppingListKitLinks(links?: KitChipSchemaList_a9993e3 | null): ShoppingListKitLink[] {
  if (!links?.length) {
    return [];
  }

  return links.map(mapShoppingListKitLink);
}

function mapShoppingListKitLink(model: KitChipSchemaList_a9993e3_KitChipSchema): ShoppingListKitLink {
  return {
    linkId: model.id,
    kitId: model.kit_id,
    kitName: model.kit_name,
    kitStatus: model.kit_status,
    requestedUnits: model.requested_units ?? 0,
    honorReserved: model.honor_reserved ?? false,
    isStale: model.is_stale ?? false,
    snapshotKitUpdatedAt: model.snapshot_kit_updated_at,
    createdAt: model.created_at,
    updatedAt: model.updated_at,
  };
}

/** Input for creating lists; callers trim strings before passing. */
export interface ShoppingListCreateInput {
  name: string;
  description: string | null;
}

/** Input for updating list metadata; mirrors create rules. */
export interface ShoppingListUpdateInput {
  name: string;
  description: string | null;
}

/** Shared fields emitted via instrumentation snapshots. */
export interface ShoppingListLineSnapshot extends Record<string, unknown> {
  listId: number;
  partKey: string;
  needed: number;
}

export interface ShoppingListLineCreateInput extends Record<string, unknown> {
  listId: number;
  partId: number | null;
  partKey: string;
  needed: number; // >= 1
  sellerId: number | null;
  note: string | null;
}

export interface ShoppingListLineUpdateInput extends Record<string, unknown> {
  listId: number;
  lineId: number;
  partId: number;
  partKey: string;
  needed: number; // >= 1
  ordered: number | null;
  sellerId: number | null;
  note: string | null;
}

export interface ShoppingListDuplicateCheck extends Record<string, unknown> {
  byPartKey: Map<string, ShoppingListLine>;
}

export interface ShoppingListStatusUpdateInput extends Record<string, unknown> {
  listId: number;
  status: ShoppingListStatus;
}

// --- Seller group input types for the CRUD endpoints ---

export interface SellerGroupCreateInput extends Record<string, unknown> {
  listId: number;
  sellerId: number;
}

export interface SellerGroupUpdateInput extends Record<string, unknown> {
  listId: number;
  sellerId: number;
  note?: string | null;
  status?: ShoppingListSellerStatus | null;
}

export interface SellerGroupDeleteInput extends Record<string, unknown> {
  listId: number;
  sellerId: number;
}
