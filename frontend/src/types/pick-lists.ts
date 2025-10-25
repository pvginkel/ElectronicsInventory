import type {
  KitPickListDetailSchema_b247181,
  KitPickListDetailSchema_b247181_KitPickListLineSchema,
  KitPickListDetailSchema_b247181_PickListLineContentSchema,
  KitPickListDetailSchema_b247181_PickListLineLocationSchema,
  KitPickListDetailSchema_b247181_PickListLineStatus,
  KitPickListDetailSchema_b247181_KitPickListStatus,
  PartLocationResponseSchemaList_a9993e3,
  PartLocationResponseSchemaList_a9993e3_PartLocationResponseSchema,
} from '@/lib/api/generated/hooks';
import type { KitStatus } from '@/types/kits';

export type PickListStatus = KitPickListDetailSchema_b247181_KitPickListStatus;
export type PickListLineStatus = KitPickListDetailSchema_b247181_PickListLineStatus;

export interface PickListLocation {
  id: number;
  boxNo: number;
  locNo: number;
}

export interface PickListLineContent {
  id: number;
  partId: number;
  partKey: string;
  description: string;
  manufacturerCode: string | null;
}

export interface PickListLine {
  id: number;
  status: PickListLineStatus;
  quantityToPick: number;
  pickedAt: string | null;
  inventoryChangeId: number | null;
  kitContent: PickListLineContent;
  location: PickListLocation;
}

export interface PickListDetail {
  id: number;
  kitId: number;
  kitName: string;
  status: PickListStatus;
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
  lines: PickListLine[];
}

export interface PickListLineGroup {
  kitContentId: number;
  partId: number;
  partKey: string;
  description: string;
  manufacturerCode: string | null;
  lines: PickListLine[];
  lineCount: number;
  openLineCount: number;
  completedLineCount: number;
  totalQuantityToPick: number;
  openQuantityToPick: number;
  pickedQuantity: number;
}

export interface PickListPartLocationAvailability {
  partKey: string;
  locations: PickListAvailabilityLocation[];
  totalQuantity: number;
  byLocationKey: Map<string, number>;
}

export interface PickListAvailabilityLocation {
  boxNo: number;
  locNo: number;
  quantity: number;
}

export type PickListAvailabilityResponse = PartLocationResponseSchemaList_a9993e3;

export interface PickListAvailabilityErrorDetail {
  partKey: string;
  message: string;
}

export interface PickListDetailSearchParams {
  kitId?: number;
  status?: KitStatus;
  search?: string;
}

export function mapPickListDetail(model: KitPickListDetailSchema_b247181): PickListDetail {
  return {
    id: model.id,
    kitId: model.kit_id,
    kitName: model.kit_name,
    status: model.status,
    requestedUnits: model.requested_units,
    lineCount: model.line_count,
    openLineCount: model.open_line_count,
    completedLineCount: model.completed_line_count,
    totalQuantityToPick: model.total_quantity_to_pick,
    pickedQuantity: model.picked_quantity,
    remainingQuantity: model.remaining_quantity,
    createdAt: model.created_at,
    updatedAt: model.updated_at,
    completedAt: model.completed_at ?? null,
    lines: mapPickListLines(model.lines),
  };
}

export function mapPickListLines(
  lines?: KitPickListDetailSchema_b247181_KitPickListLineSchema[] | null,
): PickListLine[] {
  if (!lines || lines.length === 0) {
    return [];
  }

  return lines.map(mapPickListLine);
}

export function mapPickListLine(line: KitPickListDetailSchema_b247181_KitPickListLineSchema): PickListLine {
  return {
    id: line.id,
    status: line.status,
    quantityToPick: line.quantity_to_pick,
    pickedAt: line.picked_at ?? null,
    inventoryChangeId: line.inventory_change_id ?? null,
    kitContent: mapPickListLineContent(line.kit_content),
    location: mapPickListLineLocation(line.location),
  };
}

function mapPickListLineContent(
  content: KitPickListDetailSchema_b247181_PickListLineContentSchema,
): PickListLineContent {
  const description = typeof content.part_description === 'string' && content.part_description.trim().length > 0
    ? content.part_description
    : `Part ${content.part_key}`;

  return {
    id: content.id,
    partId: content.part_id,
    partKey: content.part_key,
    description,
    manufacturerCode: null,
  };
}

function mapPickListLineLocation(
  location: KitPickListDetailSchema_b247181_PickListLineLocationSchema,
): PickListLocation {
  return {
    id: location.id,
    boxNo: location.box_no,
    locNo: location.loc_no,
  };
}

export function groupPickListLines(lines: PickListLine[]): PickListLineGroup[] {
  if (lines.length === 0) {
    return [];
  }

  const groups: PickListLineGroup[] = [];
  const byKitContentId = new Map<number, PickListLineGroup>();

  for (const line of lines) {
    const kitContentId = line.kitContent.id;
    let group = byKitContentId.get(kitContentId);

    if (!group) {
      group = {
        kitContentId,
        partId: line.kitContent.partId,
        partKey: line.kitContent.partKey,
        description: line.kitContent.description,
        manufacturerCode: line.kitContent.manufacturerCode,
        lines: [],
        lineCount: 0,
        openLineCount: 0,
        completedLineCount: 0,
        totalQuantityToPick: 0,
        openQuantityToPick: 0,
        pickedQuantity: 0,
      };
      groups.push(group);
      byKitContentId.set(kitContentId, group);
    }

    group.lines.push(line);
    group.lineCount += 1;
    group.totalQuantityToPick += line.quantityToPick;

    if (line.status === 'completed') {
      group.completedLineCount += 1;
      group.pickedQuantity += line.quantityToPick;
    } else {
      group.openLineCount += 1;
      group.openQuantityToPick += line.quantityToPick;
    }
  }

  return groups;
}

export function buildLocationKey(boxNo: number, locNo: number): string {
  return `${boxNo}:${locNo}`;
}

export function mapAvailabilityResponse(
  partKey: string,
  response: PartLocationResponseSchemaList_a9993e3 | undefined,
): PickListPartLocationAvailability {
  const locations = (response ?? []).map(mapAvailabilityLocation);

  const byLocationKey = new Map<string, number>();
  let totalQuantity = 0;

  for (const location of locations) {
    totalQuantity += location.quantity;
    byLocationKey.set(buildLocationKey(location.boxNo, location.locNo), location.quantity);
  }

  return {
    partKey,
    locations,
    totalQuantity,
    byLocationKey,
  };
}

function mapAvailabilityLocation(
  location: PartLocationResponseSchemaList_a9993e3_PartLocationResponseSchema,
): PickListAvailabilityLocation {
  return {
    boxNo: location.box_no,
    locNo: location.loc_no,
    quantity: location.qty,
  };
}

export function createAvailabilityErrorDetails(
  entries: Array<[string, unknown]>,
): PickListAvailabilityErrorDetail[] {
  if (entries.length === 0) {
    return [];
  }

  return entries.map(([partKey, error]) => ({
    partKey,
    message: error instanceof Error ? error.message : String(error),
  }));
}

export function buildPickListDetailSearch(params: PickListDetailSearchParams): PickListDetailSearchParams {
  const result: PickListDetailSearchParams = {};

  if (typeof params.kitId === 'number' && Number.isFinite(params.kitId) && params.kitId > 0) {
    result.kitId = Math.trunc(params.kitId);
  }

  if (params.status === 'active' || params.status === 'archived') {
    result.status = params.status;
  }

  if (typeof params.search === 'string') {
    const trimmed = params.search.trim();
    if (trimmed.length > 0) {
      result.search = trimmed;
    }
  }

  return result;
}

export interface PickListDetailMetrics {
  lineCount: number;
  openLineCount: number;
  completedLineCount: number;
  totalQuantityToPick: number;
  pickedQuantity: number;
  remainingQuantity: number;
}

export interface PickListLineStatusPatchOptions {
  pickedAt?: string | null;
  inventoryChangeId?: number | null;
  updatedAt?: string;
  completedAt?: string | null;
}

export function computePickListDetailMetrics(
  lines: KitPickListDetailSchema_b247181_KitPickListLineSchema[] | null | undefined,
): PickListDetailMetrics {
  if (!lines?.length) {
    return {
      lineCount: 0,
      openLineCount: 0,
      completedLineCount: 0,
      totalQuantityToPick: 0,
      pickedQuantity: 0,
      remainingQuantity: 0,
    };
  }

  let openLineCount = 0;
  let pickedQuantity = 0;
  let totalQuantityToPick = 0;

  for (const line of lines) {
    const quantity = typeof line.quantity_to_pick === 'number' && Number.isFinite(line.quantity_to_pick)
      ? line.quantity_to_pick
      : 0;
    totalQuantityToPick += quantity;

    if (line.status === 'completed') {
      pickedQuantity += quantity;
    } else {
      openLineCount += 1;
    }
  }

  const lineCount = lines.length;
  const completedLineCount = lineCount - openLineCount;
  const remainingQuantity = totalQuantityToPick - pickedQuantity;

  return {
    lineCount,
    openLineCount,
    completedLineCount,
    totalQuantityToPick,
    pickedQuantity,
    remainingQuantity,
  };
}

export function applyPickListLineStatusPatch(
  detail: KitPickListDetailSchema_b247181,
  lineId: number,
  nextStatus: PickListLineStatus,
  options?: PickListLineStatusPatchOptions,
): KitPickListDetailSchema_b247181 {
  if (!detail.lines?.length) {
    return detail;
  }

  const updatedAt = options?.updatedAt ?? new Date().toISOString();
  let lineMatched = false;
  const nextLines = detail.lines.map(line => {
    if (line.id !== lineId) {
      return line;
    }
    lineMatched = true;

    const pickedAt =
      options && 'pickedAt' in options
        ? options.pickedAt ?? null
        : nextStatus === 'completed'
          ? updatedAt
          : null;

    const inventoryChangeId =
      options && 'inventoryChangeId' in options
        ? options.inventoryChangeId ?? null
        : nextStatus === 'completed'
          ? line.inventory_change_id ?? null
          : null;

    return {
      ...line,
      status: nextStatus,
      picked_at: pickedAt,
      inventory_change_id: inventoryChangeId,
    };
  });

  if (!lineMatched) {
    return detail;
  }

  const metrics = computePickListDetailMetrics(nextLines);
  const nextStatusSummary: PickListStatus = metrics.openLineCount === 0 ? 'completed' : 'open';
  const completedAt =
    nextStatusSummary === 'completed'
      ? options?.completedAt ?? detail.completed_at ?? updatedAt
      : null;

  return {
    ...detail,
    lines: nextLines,
    line_count: metrics.lineCount,
    open_line_count: metrics.openLineCount,
    completed_line_count: metrics.completedLineCount,
    total_quantity_to_pick: metrics.totalQuantityToPick,
    picked_quantity: metrics.pickedQuantity,
    remaining_quantity: metrics.remainingQuantity,
    status: nextStatusSummary,
    completed_at: completedAt,
    updated_at: updatedAt,
  };
}
