import type {
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
  isStale: boolean;
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
