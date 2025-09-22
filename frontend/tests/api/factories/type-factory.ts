import { createApiClient, apiRequest } from '../client';
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
    // Use nullish coalescing to allow falsy overrides (like empty strings for validation testing)
    const typeName = overrides?.name ?? this.randomTypeName();

    return apiRequest(() =>
      this.client.POST('/api/types', {
        body: {
          name: typeName,
          ...overrides,
        },
      })
    );
  }

  /**
   * Generates a unique type name with optional prefix
   * @param prefix - Optional prefix for the type name (defaults to 'Type')
   * @returns A unique type name
   */
  randomTypeName(prefix: string = 'Type'): string {
    return generateRandomId(prefix);
  }

  /**
   * Finds a type by name
   * @param name - The name of the type to find
   * @returns The type if found, otherwise throws an error
   */
  async findByName(name: string): Promise<TypeResponseSchema> {
    const response = await apiRequest(() =>
      this.client.GET('/api/types', {})
    );

    const type = response.find(t => t.name === name);
    if (!type) {
      throw new Error(`Type with name "${name}" not found`);
    }
    return type;
  }
}