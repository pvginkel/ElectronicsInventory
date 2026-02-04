import type { components } from '@/lib/api/generated/types';
import type {
  AIPartAnalysisResultSchema,
  DocumentSuggestionSchema,
  DuplicateMatchEntry,
  DuplicatePartEntry,
  TransformedAIPartAnalysisResult,
} from '@/types/ai-parts';

/**
 * Deduplicate documents by URL to prevent duplicate downloads and storage
 */
export function deduplicateDocuments(documents: DocumentSuggestionSchema[]): DocumentSuggestionSchema[] {
  const urlMap = new Map<string, DocumentSuggestionSchema>();

  for (const document of documents) {
    if (!urlMap.has(document.url)) {
      urlMap.set(document.url, document);
    }
  }

  return Array.from(urlMap.values());
}

/**
 * Transform duplicate match entries from snake_case API to camelCase frontend model
 */
function transformDuplicateEntries(entries: DuplicateMatchEntry[]): DuplicatePartEntry[] {
  return entries
    .filter(e => e != null)
    .map(entry => ({
      partKey: entry.part_key,
      confidence: entry.confidence,
      reasoning: entry.reasoning,
    }));
}

/**
 * Transform API response data for frontend use.
 * Handles nested analysis_result and duplicate_parts structure from backend.
 */
export function transformAIPartAnalysisResult(
  result: AIPartAnalysisResultSchema
): TransformedAIPartAnalysisResult {
  // Backend contract: at least one of analysis_result, duplicate_parts, or analysis_failure_reason must be populated
  if (!result.analysis_result && !result.duplicate_parts && !result.analysis_failure_reason) {
    throw new Error(
      `Invalid analysis result: at least one of analysis_result, duplicate_parts, or analysis_failure_reason must be populated. ` +
      `Received: ${JSON.stringify({
        hasAnalysis: !!result.analysis_result,
        hasDuplicates: !!result.duplicate_parts,
        hasFailureReason: !!result.analysis_failure_reason
      })}`
    );
  }

  // Extract nested analysis fields if present
  const analysis = result.analysis_result;

  // Build transformed result
  const transformed: TransformedAIPartAnalysisResult = {
    // Analysis fields (optional, present when analysis_result populated)
    description: analysis?.description ?? undefined,
    manufacturer: analysis?.manufacturer ?? undefined,
    manufacturerCode: analysis?.manufacturer_code ?? undefined,
    type: analysis?.type ?? undefined,
    typeIsExisting: analysis?.type_is_existing ?? undefined,
    existingTypeId: analysis?.existing_type_id ?? undefined,
    tags: analysis?.tags ?? undefined,
    documents: analysis?.documents ? deduplicateDocuments(analysis.documents) : undefined,
    // Additional analysis fields
    dimensions: analysis?.dimensions ?? undefined,
    voltageRating: analysis?.voltage_rating ?? undefined,
    mountingType: analysis?.mounting_type ?? undefined,
    package: analysis?.package ?? undefined,
    pinCount: analysis?.pin_count ?? undefined,
    pinPitch: analysis?.pin_pitch ?? undefined,
    series: analysis?.series ?? undefined,
    inputVoltage: analysis?.input_voltage ?? undefined,
    outputVoltage: analysis?.output_voltage ?? undefined,
    productPageUrl: analysis?.product_page ?? undefined,
    seller: analysis?.seller ?? undefined,
    sellerIsExisting: analysis?.seller_is_existing ?? undefined,
    existingSellerId: analysis?.existing_seller_id ?? undefined,
    sellerLink: analysis?.seller_link ?? undefined,
  };

  // Add duplicate parts if present
  if (result.duplicate_parts && result.duplicate_parts.length > 0) {
    transformed.duplicateParts = transformDuplicateEntries(result.duplicate_parts);
  }

  // Add analysis failure reason if present (trim to only include non-whitespace content)
  if (result.analysis_failure_reason) {
    transformed.analysisFailureReason = result.analysis_failure_reason.trim() || undefined;
  }

  return transformed;
}

/**
 * Transform frontend data back to API schema for part creation
 */
export function transformToCreateSchema(data: {
  description: string;
  manufacturer?: string | null;
  manufacturerCode?: string | null;
  typeId?: number | null;
  tags: string[];
  documents: DocumentSuggestionSchema[];
  dimensions?: string | null;
  voltageRating?: string | null;
  mountingType?: string | null;
  package?: string | null;
  pinCount?: number | null;
  pinPitch?: string | null;
  series?: string | null;
  inputVoltage?: string | null;
  outputVoltage?: string | null;
  productPageUrl?: string | null;
  sellerId?: number | null;
  sellerLink?: string | null;
}): components['schemas']['AIPartCreateSchema.63ff6da'] {
  return {
    description: data.description,
    manufacturer: data.manufacturer ?? null,
    manufacturer_code: data.manufacturerCode ?? null,
    type_id: data.typeId ?? null,
    tags: data.tags,
    documents: data.documents,
    dimensions: data.dimensions ?? null,
    voltage_rating: data.voltageRating ?? null,
    mounting_type: data.mountingType ?? null,
    package: data.package ?? null,
    pin_count: data.pinCount ?? null,
    pin_pitch: data.pinPitch ?? null,
    series: data.series ?? null,
    input_voltage: data.inputVoltage ?? null,
    output_voltage: data.outputVoltage ?? null,
    product_page: data.productPageUrl ?? null,
    seller_id: data.sellerId ?? null,
    seller_link: data.sellerLink ?? null
  };
}

/**
 * AI Part Cleanup utility functions
 */

/**
 * Normalize field value for comparison - coerces empty string and undefined to null
 */
export function normalizeFieldValue(value: string | number | null | undefined | string[]): string | number | null | string[] {
  // Handle arrays (like tags) separately
  if (Array.isArray(value)) {
    return value;
  }
  // Coerce empty string and undefined to null
  if (value === '' || value === undefined) {
    return null;
  }
  return value;
}

/**
 * Transform cleanup result from backend snake_case to frontend camelCase
 */
export function transformCleanupResult(backendResult: {
  cleaned_part: {
    key: string;
    description: string | null;
    manufacturer_code: string | null;
    manufacturer: string | null;
    product_page: string | null;
    seller_link: string | null;
    dimensions: string | null;
    package: string | null;
    pin_count: number | null;
    pin_pitch: string | null;
    mounting_type: string | null;
    series: string | null;
    voltage_rating: string | null;
    input_voltage: string | null;
    output_voltage: string | null;
    type: string | null;
    type_is_existing: boolean;
    existing_type_id: number | null;
    seller: string | null;
    seller_is_existing: boolean;
    existing_seller_id: number | null;
    tags: string[];
  };
}): import('@/types/ai-parts').TransformedCleanupResult {
  const cleaned = backendResult.cleaned_part;
  return {
    cleanedPart: {
      key: cleaned.key,
      description: cleaned.description,
      manufacturerCode: cleaned.manufacturer_code,
      manufacturer: cleaned.manufacturer,
      productPage: cleaned.product_page,
      sellerLink: cleaned.seller_link,
      dimensions: cleaned.dimensions,
      package: cleaned.package,
      pinCount: cleaned.pin_count,
      pinPitch: cleaned.pin_pitch,
      mountingType: cleaned.mounting_type,
      series: cleaned.series,
      voltageRating: cleaned.voltage_rating,
      inputVoltage: cleaned.input_voltage,
      outputVoltage: cleaned.output_voltage,
      type: cleaned.type,
      typeIsExisting: cleaned.type_is_existing,
      existingTypeId: cleaned.existing_type_id,
      seller: cleaned.seller,
      sellerIsExisting: cleaned.seller_is_existing,
      existingSellerId: cleaned.existing_seller_id,
      tags: cleaned.tags
    }
  };
}

/**
 * Transform cleanup changes to PATCH payload (camelCase to snake_case)
 */
export function transformToUpdatePayload(changes: {
  description?: string | null;
  manufacturerCode?: string | null;
  manufacturer?: string | null;
  productPage?: string | null;
  sellerLink?: string | null;
  dimensions?: string | null;
  package?: string | null;
  pinCount?: number | null;
  pinPitch?: string | null;
  mountingType?: string | null;
  series?: string | null;
  voltageRating?: string | null;
  inputVoltage?: string | null;
  outputVoltage?: string | null;
  typeId?: number | null;
  sellerId?: number | null;
  tags?: string[];
}): Record<string, string | number | null | string[]> {
  const payload: Record<string, string | number | null | string[]> = {};

  if (changes.description !== undefined) payload.description = changes.description;
  if (changes.manufacturerCode !== undefined) payload.manufacturer_code = changes.manufacturerCode;
  if (changes.manufacturer !== undefined) payload.manufacturer = changes.manufacturer;
  if (changes.productPage !== undefined) payload.product_page = changes.productPage;
  if (changes.sellerLink !== undefined) payload.seller_link = changes.sellerLink;
  if (changes.dimensions !== undefined) payload.dimensions = changes.dimensions;
  if (changes.package !== undefined) payload.package = changes.package;
  if (changes.pinCount !== undefined) payload.pin_count = changes.pinCount;
  if (changes.pinPitch !== undefined) payload.pin_pitch = changes.pinPitch;
  if (changes.mountingType !== undefined) payload.mounting_type = changes.mountingType;
  if (changes.series !== undefined) payload.series = changes.series;
  if (changes.voltageRating !== undefined) payload.voltage_rating = changes.voltageRating;
  if (changes.inputVoltage !== undefined) payload.input_voltage = changes.inputVoltage;
  if (changes.outputVoltage !== undefined) payload.output_voltage = changes.outputVoltage;
  if (changes.typeId !== undefined) payload.type_id = changes.typeId;
  if (changes.sellerId !== undefined) payload.seller_id = changes.sellerId;
  if (changes.tags !== undefined) payload.tags = changes.tags;

  return payload;
}