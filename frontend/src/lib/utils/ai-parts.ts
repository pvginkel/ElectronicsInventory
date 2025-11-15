import type { components } from '@/lib/api/generated/types';
import type { DuplicatePartEntry, TransformedAIPartAnalysisResult } from '@/types/ai-parts';

type DocumentSuggestionSchema = components['schemas']['AIPartCreateSchema.63ff6da.DocumentSuggestionSchema'];
type AIPartAnalysisResultSchema = components['schemas']['AIPartAnalysisTaskResultSchema.63ff6da.AIPartAnalysisResultSchema'];
type DuplicateMatchEntry = components['schemas']['AIPartAnalysisTaskResultSchema.63ff6da.DuplicateMatchEntry'];

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
    seller: null, // Seller info not provided by AI analysis
    sellerLink: null, // Must be provided by user
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