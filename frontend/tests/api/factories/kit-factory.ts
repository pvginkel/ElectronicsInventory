import { createApiClient, apiRequest } from '../client';
import { makeUnique } from '../../support/helpers';
import type { components } from '../../../src/lib/api/generated/types';

type KitCreateSchema = components['schemas']['KitCreateSchema.b98797e'];
type KitResponseSchema = components['schemas']['KitResponseSchema.b98797e'];
type KitContentCreateSchema = components['schemas']['KitContentCreateSchema.b98797e'];
type KitContentDetailSchema = components['schemas']['KitContentDetailSchema.b98797e'];
type KitContentUpdateSchema = components['schemas']['KitContentUpdateSchema.b98797e'];
type KitDetailResponseSchema = components['schemas']['KitDetailResponseSchema.b98797e'];
type KitPickListCreateSchema = components['schemas']['KitPickListCreateSchema.b247181'];
type KitPickListDetailSchema = components['schemas']['KitPickListDetailSchema.b247181'];
type ShortfallAction = components['schemas']['KitPickListCreateSchema.b247181.ShortfallAction'];
type KitShoppingListRequestSchema = components['schemas']['KitShoppingListRequestSchema.b98797e'];
type KitShoppingListLinkResponseSchema = components['schemas']['KitShoppingListLinkResponseSchema.b98797e'];

export interface PickListShortfallHandling {
  [partKey: string]: { action: ShortfallAction };
}

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

  async createWithContents(options: KitCreateOptions & {
    contents: Array<{ partId: number; requiredPerUnit: number; note?: string | null }>;
  }): Promise<{ kit: KitResponseSchema; contents: KitContentDetailSchema[] }> {
    const kit = await this.create(options);
    const createdContents: KitContentDetailSchema[] = [];
    for (const content of options.contents) {
      const row = await this.addContent(kit.id, content);
      createdContents.push(row);
    }
    return { kit, contents: createdContents };
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

  /**
   * Update a specific content row using optimistic locking.
   */
  async updateContent(
    kitId: number,
    contentId: number,
    options: { requiredPerUnit?: number; note?: string | null; version: number }
  ): Promise<KitContentDetailSchema> {
    const payload: KitContentUpdateSchema = {
      required_per_unit: options.requiredPerUnit ?? null,
      note: options.note ?? null,
      version: options.version,
    };

    return apiRequest(() =>
      this.client.PATCH('/api/kits/{kit_id}/contents/{content_id}', {
        params: { path: { kit_id: kitId, content_id: contentId } },
        body: payload,
      })
    );
  }

  /**
   * Remove a content row from the specified kit.
   */
  async deleteContent(kitId: number, contentId: number): Promise<void> {
    await apiRequest(() =>
      this.client.DELETE('/api/kits/{kit_id}/contents/{content_id}', {
        params: { path: { kit_id: kitId, content_id: contentId } },
      })
    );
  }

  /**
   * Fetch the kit detail payload for assertions.
   */
  async getDetail(kitId: number): Promise<KitDetailResponseSchema> {
    return apiRequest(() =>
      this.client.GET('/api/kits/{kit_id}', {
        params: { path: { kit_id: kitId } },
      })
    );
  }

  /**
   * Create a pick list for the specified kit and return the detail payload.
   * @param kitId The kit ID to create the pick list for
   * @param options.requestedUnits Number of kit builds to fulfill (defaults to 1)
   * @param options.shortfallHandling Optional map of part keys to shortfall actions
   */
  async createPickList(
    kitId: number,
    options?: {
      requestedUnits?: number;
      shortfallHandling?: PickListShortfallHandling | null;
    }
  ): Promise<KitPickListDetailSchema> {
    const payload: KitPickListCreateSchema = {
      requested_units: options?.requestedUnits ?? 1,
      shortfall_handling: options?.shortfallHandling ?? null,
    };

    return apiRequest(() =>
      this.client.POST('/api/kits/{kit_id}/pick-lists', {
        params: { path: { kit_id: kitId } },
        body: payload,
      })
    );
  }

  /**
   * Fetch pick list detail by identifier.
   */
  async getPickListDetail(pickListId: number): Promise<KitPickListDetailSchema> {
    return apiRequest(() =>
      this.client.GET('/api/pick-lists/{pick_list_id}', {
        params: { path: { pick_list_id: pickListId } },
      })
    );
  }

  /**
   * Link a kit to an existing shopping list by pushing kit contents to the list.
   * Returns the link response containing shopping list details and link metadata.
   */
  async linkShoppingList(kitId: number, listId: number): Promise<KitShoppingListLinkResponseSchema> {
    const payload: KitShoppingListRequestSchema = {
      shopping_list_id: listId,
      honor_reserved: false,
      new_list_name: null,
      new_list_description: null,
      note_prefix: null,
      units: null,
    };

    return apiRequest(() =>
      this.client.POST('/api/kits/{kit_id}/shopping-lists', {
        params: { path: { kit_id: kitId } },
        body: payload,
      })
    );
  }

  /**
   * Create a kit and link it to the specified shopping lists in one call.
   * Useful for deterministic test setup when you need a kit with shopping list associations.
   */
  async createWithShoppingListLinks(
    options: KitCreateOptions & { shoppingListIds: number[] }
  ): Promise<KitResponseSchema> {
    const kit = await this.create(options);

    for (const listId of options.shoppingListIds) {
      await this.linkShoppingList(kit.id, listId);
    }

    return kit;
  }

  randomKitName(prefix = 'Test Kit'): string {
    return makeUnique(prefix);
  }

  randomKitDescription(): string {
    return `Kit generated for tests (${makeUnique('kit-desc')})`;
  }
}
