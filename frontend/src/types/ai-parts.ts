import type { components } from '@/lib/api/generated/types';

export type DocumentSuggestionSchema = components['schemas']['AIPartCreateSchema.63ff6da.DocumentSuggestionSchema'];

/**
 * Raw API types for AI part analysis SSE results.
 * These schemas are delivered via SSE (not REST), so they're not in the OpenAPI spec.
 * Defined here to match the backend schema structure (snake_case).
 */

/**
 * Raw duplicate match entry from API (snake_case)
 */
export interface DuplicateMatchEntry {
  part_key: string;
  confidence: 'high' | 'medium';
  reasoning: string;
}

/**
 * Raw part analysis details from API (snake_case)
 */
export interface PartAnalysisDetailsSchema {
  manufacturer_code: string | null;
  type: string | null;
  description: string | null;
  tags: string[];
  manufacturer: string | null;
  product_page: string | null;
  package: string | null;
  pin_count: number | null;
  pin_pitch: string | null;
  voltage_rating: string | null;
  input_voltage: string | null;
  output_voltage: string | null;
  mounting_type: string | null;
  series: string | null;
  dimensions: string | null;
  documents: DocumentSuggestionSchema[];
  seller: string | null;
  seller_link: string | null;
  type_is_existing: boolean;
  existing_type_id: number | null;
  seller_is_existing: boolean;
  existing_seller_id: number | null;
}

/**
 * Raw AI analysis result from API (snake_case)
 * This is what comes through SSE after the analysis task completes.
 */
export interface AIPartAnalysisResultSchema {
  analysis_result: PartAnalysisDetailsSchema | null;
  duplicate_parts: DuplicateMatchEntry[] | null;
  analysis_failure_reason: string | null;
}

/**
 * Frontend TypeScript types for AI part analysis duplicate detection.
 * These types represent the camelCase transformed versions of the API schemas.
 */

/**
 * Single duplicate match entry (camelCase frontend model)
 */
export interface DuplicatePartEntry {
  partKey: string; // 4-char part key
  confidence: 'high' | 'medium';
  reasoning: string; // LLM explanation
}

/**
 * Extended result type for transformed AI analysis including duplicates
 */
export interface TransformedAIPartAnalysisResult {
  // Analysis fields (present when analysis_result populated)
  description?: string;
  manufacturer?: string;
  manufacturerCode?: string;
  type?: string;
  typeIsExisting?: boolean;
  existingTypeId?: number;
  tags?: string[];
  documents?: DocumentSuggestionSchema[];
  dimensions?: string;
  voltageRating?: string;
  mountingType?: string;
  package?: string;
  pinCount?: number;
  pinPitch?: string;
  series?: string;
  inputVoltage?: string;
  outputVoltage?: string;
  productPageUrl?: string;
  seller?: string;
  sellerIsExisting?: boolean;
  existingSellerId?: number;
  sellerLink?: string;

  // Duplicate detection field (present when duplicate_parts populated)
  duplicateParts?: DuplicatePartEntry[];

  // Analysis failure reason (present when AI cannot fulfill the request)
  analysisFailureReason?: string;
}

/**
 * AI Part Cleanup types - for cleaning up existing part data
 */

/**
 * Cleaned part data from backend (camelCase frontend model)
 */
export interface CleanedPartData {
  key: string;
  description: string | null;
  manufacturerCode: string | null;
  manufacturer: string | null;
  productPage: string | null;
  sellerLink: string | null;
  dimensions: string | null;
  package: string | null;
  pinCount: number | null;
  pinPitch: string | null;
  mountingType: string | null;
  series: string | null;
  voltageRating: string | null;
  inputVoltage: string | null;
  outputVoltage: string | null;
  type: string | null;
  typeIsExisting: boolean;
  existingTypeId: number | null;
  seller: string | null;
  sellerIsExisting: boolean;
  existingSellerId: number | null;
  tags: string[];
}

/**
 * Transformed cleanup result wrapper
 */
export interface TransformedCleanupResult {
  cleanedPart: CleanedPartData;
}

/**
 * Single field change in cleanup merge view
 */
export interface CleanupFieldChange {
  fieldName: string;
  fieldLabel: string;
  oldValue: string | null;
  newValue: string | null;
  isChecked: boolean;
}
