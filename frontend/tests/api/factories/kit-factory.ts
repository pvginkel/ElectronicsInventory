import { createApiClient, apiRequest } from '../client';
import { makeUnique } from '../../support/helpers';
import type { components } from '../../../src/lib/api/generated/types';

type KitCreateSchema = components['schemas']['KitCreateSchema.b98797e'];
type KitResponseSchema = components['schemas']['KitResponseSchema.b98797e'];
type KitContentCreateSchema = components['schemas']['KitContentCreateSchema.b98797e'];
type KitContentDetailSchema = components['schemas']['KitContentDetailSchema.b98797e'];

interface KitCreateOptions {
  overrides?: Partial<KitCreateSchema>;
  archived?: boolean;
}

/**
 * Factory for creating kits via the real backend API.
 */
export class KitTestFactory {
  private readonly client: ReturnType<typeof createApiClient>;

  constructor(client?: ReturnType<typeof createApiClient>) {
    this.client = client ?? createApiClient();
  }

  /**
   * Create a kit with optional overrides. Pass `archived: true` to archive immediately.
   */
  async create(options?: KitCreateOptions): Promise<KitResponseSchema> {
    const base: KitCreateSchema = {
      name: this.randomKitName(),
      description: this.randomKitDescription(),
      build_target: 1,
    };

    const requestBody: KitCreateSchema = {
      ...base,
      ...(options?.overrides ?? {}),
    };

    const kit = await apiRequest(() =>
      this.client.POST('/api/kits', {
        body: requestBody,
      })
    );

    if (options?.archived) {
      return this.archive(kit.id);
    }

    return kit;
  }

  /**
   * Archive the specified kit.
   */
  async archive(kitId: number): Promise<KitResponseSchema> {
    return apiRequest(() =>
      this.client.POST('/api/kits/{kit_id}/archive', {
        params: { path: { kit_id: kitId } },
      })
    );
  }

  /**
   * Unarchive the specified kit.
   */
  async unarchive(kitId: number): Promise<KitResponseSchema> {
    return apiRequest(() =>
      this.client.POST('/api/kits/{kit_id}/unarchive', {
        params: { path: { kit_id: kitId } },
      })
    );
  }

  /**
   * Create multiple kits using shared options.
   */
  async createMany(count: number, options?: KitCreateOptions): Promise<KitResponseSchema[]> {
    const kits: KitResponseSchema[] = [];
    for (let index = 0; index < count; index += 1) {
      const overrides: Partial<KitCreateSchema> = {
        ...options?.overrides,
        name: options?.overrides?.name ?? this.randomKitName(`Test Kit ${index + 1}`),
      };
      const kit = await this.create({
        ...options,
        overrides,
      });
      kits.push(kit);
    }
    return kits;
  }

  /**
   * Add a content row to the specified kit.
   */
  async addContent(
    kitId: number,
    options: { partId: number; requiredPerUnit: number; note?: string | null }
  ): Promise<KitContentDetailSchema> {
    const payload: KitContentCreateSchema = {
      part_id: options.partId,
      required_per_unit: options.requiredPerUnit,
      note: options.note ?? null,
    };

    const { data, error, response } = await this.client.POST('/api/kits/{kit_id}/contents', {
      params: { path: { kit_id: kitId } },
      body: payload,
    });

    if (error || !response?.ok || !data) {
      const detail =
        (error && typeof error === 'object' && 'detail' in error && error.detail) ||
        (error && typeof error === 'object' && 'message' in error && error.message) ||
        JSON.stringify(error);
      const reason = detail && detail !== '{}' ? detail : response?.statusText ?? 'Unknown error';
      throw new Error(
        `Failed to add kit content (kitId=${kitId}, partId=${options.partId}, requiredPerUnit=${options.requiredPerUnit}): ${reason}`
      );
    }

    return data;
  }

  randomKitName(prefix = 'Test Kit'): string {
    return makeUnique(prefix);
  }

  randomKitDescription(): string {
    return `Kit generated for tests (${makeUnique('kit-desc')})`;
  }
}
