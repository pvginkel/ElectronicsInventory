import { createApiClient } from '../client';
import { generateRandomId } from '../../support/helpers';
import type { components } from '../../../src/lib/api/generated/types';

type TypeCreateSchema = components['schemas']['TypeCreateSchema.50492c8'];
type TypeResponseSchema = components['schemas']['TypeResponseSchema.50492c8'];

/**
 * Factory for creating test Types via the API
 */
export class TypeTestFactory {
  private client: ReturnType<typeof createApiClient>;

  constructor(client?: ReturnType<typeof createApiClient>) {
    this.client = client || createApiClient();
  }

  /**
   * Creates a new type with optional overrides
   * @param overrides - Partial values to override the default type creation
   * @returns The created type from the API
   */
  async create(overrides?: Partial<TypeCreateSchema>): Promise<TypeResponseSchema> {
    const typeName = overrides?.name || this.randomTypeName();

    const { data, error, response } = await this.client.POST('/api/types', {
      body: {
        name: typeName,
        ...overrides,
      },
    });

    if (error) {
      throw new Error(`Failed to create type: ${response.status} ${response.statusText}`);
    }

    if (!data) {
      throw new Error('Failed to create type: no data returned');
    }

    return data;
  }

  /**
   * Generates a unique type name with optional prefix
   * @param prefix - Optional prefix for the type name (defaults to 'Type')
   * @returns A unique type name
   */
  randomTypeName(prefix: string = 'Type'): string {
    return generateRandomId(prefix);
  }
}