import type { components } from '@/lib/api/generated/types';

type DocumentSuggestionSchema = components['schemas']['AIPartCreateSchema.63ff6da.DocumentSuggestionSchema'];

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
 * Transform API response data for frontend use
 */
export function transformAIPartAnalysisResult(
  result: components['schemas']['AIPartAnalysisTaskResultSchema.63ff6da.AIPartAnalysisResultSchema']
) {
  return {
    description: result.description,
    manufacturer: result.manufacturer,
    manufacturerCode: result.manufacturer_code,
    type: result.type,
    typeIsExisting: result.type_is_existing,
    existingTypeId: result.existing_type_id,
    tags: result.tags || [],
    documents: deduplicateDocuments(result.documents || []),
    // Additional fields
    dimensions: result.dimensions,
    voltageRating: result.voltage_rating,
    mountingType: result.mounting_type,
    package: result.package,
    pinCount: result.pin_count,
    pinPitch: result.pin_pitch,
    series: result.series,
    inputVoltage: result.input_voltage,
    outputVoltage: result.output_voltage,
    productPageUrl: result.product_page,
    seller: null, // Seller info not provided by AI analysis
    sellerLink: null, // Must be provided by user
  };
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
  seller?: string | null;
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
    seller: data.seller ?? null,
    seller_link: data.sellerLink ?? null
  };
}