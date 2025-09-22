import { createApiClient } from '../client';
import { generateRandomId } from '../../support/helpers';
import { TypeTestFactory } from './type-factory';
import type { components } from '../../../src/lib/api/generated/types';

type PartCreateSchema = components['schemas']['PartCreateSchema.1a46b79'];
type PartResponseSchema = components['schemas']['PartResponseSchema.1a46b79'];
type TypeResponseSchema = components['schemas']['TypeResponseSchema.50492c8'];

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
   * @returns Object containing the created part and its type reference
   */
  async create(options?: PartCreateOptions): Promise<{
    part: PartResponseSchema;
    type: TypeResponseSchema | null;
  }> {
    let type: TypeResponseSchema | null = null;
    let typeId = options?.typeId;

    // Create a new type if no typeId is provided
    if (!typeId) {
      type = await this.typeFactory.create();
      typeId = type.id;
    }

    // Build the request body with defaults and overrides
    const partData: PartCreateSchema = {
      description: options?.overrides?.description || this.randomPartDescription(),
      manufacturer_code: options?.overrides?.manufacturer_code || this.randomManufacturerCode(),
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

    const { data, error, response } = await this.client.POST('/api/parts', {
      body: partData,
    });

    if (error) {
      throw new Error(`Failed to create part: ${response.status} ${response.statusText}`);
    }

    if (!data) {
      throw new Error('Failed to create part: no data returned');
    }

    return {
      part: data,
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
}