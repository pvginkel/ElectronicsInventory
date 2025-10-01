import { createApiClient, apiRequest } from '../client';
import { generateRandomId } from '../../support/helpers';
import { TypeTestFactory } from './type-factory';
import type { components } from '../../../src/lib/api/generated/types';

type PartCreateSchema = components['schemas']['PartCreateSchema.1a46b79'];
type PartResponseSchema = components['schemas']['PartResponseSchema.1a46b79'];
type TypeResponseSchema = components['schemas']['TypeResponseSchema.50492c8'];
type PartWithLocationsSchema = components['schemas']['PartWithTotalAndLocationsSchemaList.a9993e3.PartWithTotalAndLocationsSchema'];

interface PartCreateOptions {
  overrides?: Partial<PartCreateSchema>;
  typeId?: number;
}

/**
 * Factory for creating test Parts via the API
 */
export class PartTestFactory {
  private client: ReturnType<typeof createApiClient>;
  private typeFactory: TypeTestFactory;

  constructor(client?: ReturnType<typeof createApiClient>) {
    this.client = client || createApiClient();
    this.typeFactory = new TypeTestFactory(this.client);
  }

  /**
   * Creates a new part with optional overrides and type
   * @param options - Configuration for creating the part
   * @returns Object containing the created part and its associated type
   */
  async create(options?: PartCreateOptions): Promise<{
    part: PartResponseSchema;
    type: TypeResponseSchema;
  }> {
    let type: TypeResponseSchema;
    let typeId = options?.typeId;

    // Create a new type if no typeId is provided, otherwise fetch the existing type
    if (!typeId) {
      type = await this.typeFactory.create();
      typeId = type.id;
    } else {
      // Fetch the existing type to fulfill the contract
      const finalTypeId = typeId; // TypeScript needs this for type narrowing
      const typeResponse = await apiRequest(() =>
        this.client.GET('/api/types/{type_id}', {
          params: { path: { type_id: finalTypeId } },
        })
      );
      type = typeResponse;
    }

    // Build the request body with defaults and overrides
    // Use nullish coalescing to allow falsy overrides (like empty strings for validation testing)
    const partData: PartCreateSchema = {
      description: options?.overrides?.description ?? this.randomPartDescription(),
      manufacturer_code: options?.overrides?.manufacturer_code ?? this.randomManufacturerCode(),
      type_id: typeId,
      // Set all nullable fields to null by default
      dimensions: null,
      input_voltage: null,
      manufacturer: null,
      mounting_type: null,
      output_voltage: null,
      package: null,
      pin_count: null,
      pin_pitch: null,
      product_page: null,
      seller_id: null,
      seller_link: null,
      series: null,
      tags: null,
      voltage_rating: null,
      // Apply any overrides (will replace the defaults above)
      ...options?.overrides,
    };

    const part = await apiRequest(() =>
      this.client.POST('/api/parts', {
        body: partData,
      })
    );

    return {
      part,
      type,
    };
  }

  /**
   * Generates a random part description
   * @param prefix - Optional prefix for the description
   * @returns A unique part description
   */
  randomPartDescription(prefix: string = 'Test Part'): string {
    return generateRandomId(prefix);
  }

  /**
   * Generates a random manufacturer code
   * @returns A unique manufacturer code
   */
  randomManufacturerCode(): string {
    const prefix = ['TEST', 'DEMO', 'SAMPLE'][Math.floor(Math.random() * 3)];
    const suffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}-${suffix}`;
  }

  /**
   * Creates a part with stock quantity
   * @param quantity - Stock quantity to set
   * @param options - Additional options for part creation
   * @returns Object containing the created part with stock and its type
   */
  async createWithStock(quantity: number, options?: PartCreateOptions): Promise<{
    part: PartResponseSchema;
    type: TypeResponseSchema;
    stockQuantity: number;
  }> {
    const result = await this.create(options);

    // Note: Stock is typically managed through the part's quantity field
    // or through a separate stock endpoint. For now, we'll track it as metadata
    return {
      ...result,
      stockQuantity: quantity,
    };
  }

  /**
   * Creates a part with location information
   * @param location - Location details (box, position, etc.)
   * @param options - Additional options for part creation
   * @returns Object containing the created part with location and its type
   */
  async createWithLocation(
    location: { boxId?: number; position?: string; description?: string },
    options?: PartCreateOptions
  ): Promise<{
    part: PartResponseSchema;
    type: TypeResponseSchema;
    location: typeof location;
  }> {
    const result = await this.create(options);

    // Note: Location management would typically be done through
    // a separate location endpoint after part creation
    return {
      ...result,
      location,
    };
  }

  /**
   * Creates a part with document attachments
   * @param documents - Array of document metadata
   * @param options - Additional options for part creation
   * @returns Object containing the created part with documents and its type
   */
  async createWithDocuments(
    documents: Array<{ name: string; type: 'datasheet' | 'manual' | 'schematic'; url?: string }>,
    options?: PartCreateOptions
  ): Promise<{
    part: PartResponseSchema;
    type: TypeResponseSchema;
    documents: typeof documents;
  }> {
    const result = await this.create(options);

    // Note: Document attachments would typically be added through
    // a separate endpoint after part creation
    return {
      ...result,
      documents,
    };
  }

  /**
   * Creates a complete part with stock, location, and documents
   * @param config - Complete configuration for the part
   * @returns Object containing the fully configured part
   */
  async createComplete(config?: {
    stockQuantity?: number;
    location?: { boxId?: number; position?: string; description?: string };
    documents?: Array<{ name: string; type: 'datasheet' | 'manual' | 'schematic'; url?: string }>;
    overrides?: Partial<PartCreateSchema>;
    typeId?: number;
  }): Promise<{
    part: PartResponseSchema;
    type: TypeResponseSchema;
    stockQuantity?: number;
    location?: { boxId?: number; position?: string; description?: string };
    documents?: Array<{ name: string; type: 'datasheet' | 'manual' | 'schematic'; url?: string }>;
  }> {
    const result = await this.create({
      overrides: config?.overrides,
      typeId: config?.typeId,
    });

    return {
      ...result,
      ...(config?.stockQuantity !== undefined && { stockQuantity: config.stockQuantity }),
      ...(config?.location && { location: config.location }),
      ...(config?.documents && { documents: config.documents }),
    };
  }

  /**
   * Fetches part detail (including cover metadata) from the real backend
   */
  async getDetail(partKey: string): Promise<PartResponseSchema> {
    return apiRequest(() =>
      this.client.GET('/api/parts/{part_key}', {
        params: { path: { part_key: partKey } },
      })
    );
  }

  /**
   * Lists all parts with location metadata; mirrors the grid query used by the app
   */
  async listWithLocations(): Promise<PartWithLocationsSchema[]> {
    return apiRequest(() => this.client.GET('/api/parts/with-locations'));
  }
}
