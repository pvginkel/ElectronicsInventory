import type { components } from '@/lib/api/generated/types';

type DocumentSuggestionSchema = components['schemas']['AIPartCreateSchema.63ff6da.DocumentSuggestionSchema'];

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
