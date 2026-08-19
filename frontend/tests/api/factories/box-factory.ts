import { createApiClient, apiRequest } from '../client';
import { makeUnique } from '../../support/helpers';
import type { components } from '../../../src/lib/api/generated/types';

type BoxCreateSchema = components['schemas']['BoxCreateSchema.6d5ef0b'];
type BoxResponseSchema = components['schemas']['BoxResponseSchema.6d5ef0b'];

interface BoxCreateOptions {
  overrides?: Partial<BoxCreateSchema>;
  withLocations?: boolean;
  locationCount?: number;
}

/**
 * Factory for creating test Boxes via the API
 */
export class BoxTestFactory {
  private client: ReturnType<typeof createApiClient>;

  constructor(client?: ReturnType<typeof createApiClient>) {
    this.client = client || createApiClient();
  }

  /**
   * Creates a new box with optional overrides
   * @param options - Configuration for creating the box
   * @returns The created box
   */
  async create(options?: BoxCreateOptions): Promise<BoxResponseSchema> {
    // Build the request body with defaults and overrides
    const boxData: BoxCreateSchema = {
      capacity: options?.overrides?.capacity ?? this.defaultCapacity(),
      description: options?.overrides?.description ?? this.randomBoxDescription(),
      ...options?.overrides,
    };

    const box = await apiRequest(() =>
      this.client.POST('/api/boxes', {
        body: boxData,
      })
    );

    return box;
  }

  /**
   * Creates a box with pre-populated locations
   * @param locationCount - Number of locations to seed
   * @param options - Additional options for box creation
   * @returns The created box with location metadata
   */
  async createWithLocations(
    locationCount: number = 5,
    options?: BoxCreateOptions
  ): Promise<{
    box: BoxResponseSchema;
    locations: Array<{ position: string; description: string }>;
  }> {
    const box = await this.create({
      ...options,
      overrides: {
        ...options?.overrides,
        capacity: options?.overrides?.capacity ?? Math.max(locationCount * 2, 20),
      },
    });

    // Generate location metadata
    const locations = Array.from({ length: locationCount }, (_, i) => ({
      position: `A${i + 1}`,
      description: `Test location ${i + 1}`,
    }));

    return { box, locations };
  }

  /**
   * Creates multiple boxes for testing
   * @param count - Number of boxes to create
   * @param options - Options to apply to all boxes
   * @returns Array of created boxes
   */
  async createMany(count: number, options?: BoxCreateOptions): Promise<BoxResponseSchema[]> {
    const boxes: BoxResponseSchema[] = [];

    for (let i = 0; i < count; i++) {
      const box = await this.create({
        ...options,
        overrides: {
          ...options?.overrides,
          description: options?.overrides?.description ?? `${this.randomBoxDescription()} ${i + 1}`,
        },
      });
      boxes.push(box);
    }

    return boxes;
  }

  /**
   * Generates a random box description
   * @param prefix - Optional prefix for the description
   * @returns A unique box description
  */
  randomBoxDescription(prefix: string = 'Test Box'): string {
    return makeUnique(prefix);
  }

  /**
   * Generates a random box code (for display purposes only)
   * @returns A unique box code
   */
  randomBoxCode(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const prefix = Array.from(
      { length: 2 },
      () => letters[Math.floor(Math.random() * letters.length)]
    ).join('');
    const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${suffix}`;
  }

  /**
   * Returns default capacity for test boxes
   * @returns Default capacity value
   */
  defaultCapacity(): number {
    return 20; // Reasonable default for testing
  }

  /**
   * Creates a box with specific capacity utilization
   * @param usedSlots - Number of slots to mark as used
   * @param totalCapacity - Total capacity of the box
   * @param options - Additional options
   * @returns Box with utilization metadata
   */
  async createWithUtilization(
    usedSlots: number,
    totalCapacity: number = 20,
    options?: BoxCreateOptions
  ): Promise<{
    box: BoxResponseSchema;
    utilization: {
      used: number;
      total: number;
      percentage: number;
    };
  }> {
    const box = await this.create({
      ...options,
      overrides: {
        ...options?.overrides,
        capacity: totalCapacity,
      },
    });

    const utilization = {
      used: usedSlots,
      total: totalCapacity,
      percentage: Math.round((usedSlots / totalCapacity) * 100),
    };

    return { box, utilization };
  }
}
