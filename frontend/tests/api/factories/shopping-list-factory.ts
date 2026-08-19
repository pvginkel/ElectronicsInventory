import { expect } from '@playwright/test';
import { createApiClient, apiRequest } from '../client';
import { makeUnique } from '../../support/helpers';
import type { components } from '../../../src/lib/api/generated/types';

type ShoppingListCreateSchema = components['schemas']['ShoppingListCreateSchema.46f0cf6'];
type ShoppingListResponseSchema = components['schemas']['ShoppingListResponseSchema.46f0cf6'];
type ShoppingListLineResponseSchema = components['schemas']['ShoppingListLineResponseSchema.d9ccce0'];
type ShoppingListLineUpdateSchema = components['schemas']['ShoppingListLineUpdateSchema.d9ccce0'];
type ShoppingListSellerGroupSchema = components['schemas']['ShoppingListSellerGroupSchema.46f0cf6'];
type ShoppingListSellerGroupCreateSchema = components['schemas']['ShoppingListSellerGroupCreateSchema.57ff967'];
type ShoppingListSellerGroupUpdateSchema = components['schemas']['ShoppingListSellerGroupUpdateSchema.57ff967'];
type PartShoppingListMembershipSchema = components['schemas']['PartShoppingListMembershipSchema.d085feb'];
type ShoppingListLineReceiveSchema = components['schemas']['ShoppingListLineReceiveSchema.d9ccce0'];
type ShoppingListLineCompleteSchema = components['schemas']['ShoppingListLineCompleteSchema.d9ccce0'];
type KitShoppingListRequestSchema = components['schemas']['KitShoppingListRequestSchema.b98797e'];
type KitShoppingListLinkResponseSchema = components['schemas']['KitShoppingListLinkResponseSchema.b98797e'];

interface CreateListWithLinesOptions {
  listOverrides?: Partial<ShoppingListCreateSchema>;
  lines?: Array<{
    partKey: string;
    needed?: number;
    sellerId?: number | null;
    note?: string | null;
  }>;
}

/**
 * Factory for creating shopping lists, lines, and seller groups via the real API.
 */
export class ShoppingListTestFactory {
  private client: ReturnType<typeof createApiClient>;

  constructor(client?: ReturnType<typeof createApiClient>) {
    this.client = client || createApiClient();
  }

  randomListName(prefix: string = 'Shopping List'): string {
    return makeUnique(prefix);
  }

  async createList(overrides?: Partial<ShoppingListCreateSchema>): Promise<ShoppingListResponseSchema> {
    const body: ShoppingListCreateSchema = {
      name: overrides?.name ?? this.randomListName(),
      description: overrides?.description ?? null,
    };

    const list = await apiRequest(() =>
      this.client.POST('/api/shopping-lists', {
        body,
      })
    );

    return list;
  }

  async getListDetail(listId: number): Promise<ShoppingListResponseSchema> {
    return await apiRequest(() =>
      this.client.GET('/api/shopping-lists/{list_id}', {
        params: { path: { list_id: listId } },
      })
    );
  }

  async createLine(
    listId: number,
    options: {
      partKey: string;
      needed?: number;
      sellerId?: number | null;
      note?: string | null;
    }
  ): Promise<ShoppingListLineResponseSchema> {
    const membership = await apiRequest<PartShoppingListMembershipSchema>(() =>
      this.client.POST('/api/parts/{part_key}/shopping-list-memberships', {
        params: { path: { part_key: options.partKey } },
        body: {
          shopping_list_id: listId,
          needed: options.needed ?? 1,
          seller_id: options.sellerId ?? null,
          note: options.note ?? null,
        },
      })
    );

    const detail = await this.getListDetail(listId);
    const line =
      detail.lines.find(existing => existing.id === membership.line_id) ??
      detail.lines.find(existing => existing.part.key === options.partKey);

    if (!line) {
      throw new Error(`Failed to resolve shopping list line for part ${options.partKey}`);
    }

    return line;
  }

  async createListWithLines(options: CreateListWithLinesOptions = {}): Promise<ShoppingListResponseSchema> {
    const list = await this.createList(options.listOverrides);

    if (options.lines?.length) {
      for (const line of options.lines) {
        await this.createLine(list.id, line);
      }
    }

    return await this.getListDetail(list.id);
  }

  // ---------------------------------------------------------------------------
  // Line update -- sets ordered, seller, needed, note via PUT
  // ---------------------------------------------------------------------------

  /**
   * Update a shopping list line (ordered, seller, needed, or note).
   * Wraps PUT /api/shopping-list-lines/{line_id}.
   */
  async updateLine(
    lineId: number,
    updates: {
      needed?: number | null;
      ordered?: number | null;
      sellerId?: number | null;
      note?: string | null;
    }
  ): Promise<ShoppingListLineResponseSchema> {
    const body: ShoppingListLineUpdateSchema = {
      needed: updates.needed ?? null,
      ordered: updates.ordered ?? null,
      seller_id: updates.sellerId ?? null,
      note: updates.note ?? null,
    };

    return await apiRequest(() =>
      this.client.PUT('/api/shopping-list-lines/{line_id}', {
        params: { path: { line_id: lineId } },
        body,
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Seller group CRUD
  // ---------------------------------------------------------------------------

  /**
   * Create a seller group column on a shopping list.
   * Wraps POST /api/shopping-lists/{list_id}/seller-groups.
   */
  async createSellerGroup(
    listId: number,
    sellerId: number
  ): Promise<ShoppingListSellerGroupSchema> {
    const body: ShoppingListSellerGroupCreateSchema = {
      seller_id: sellerId,
    };

    return await apiRequest(() =>
      this.client.POST('/api/shopping-lists/{list_id}/seller-groups', {
        params: { path: { list_id: listId } },
        body,
      })
    );
  }

  /**
   * Update a seller group (note and/or status).
   * Wraps PUT /api/shopping-lists/{list_id}/seller-groups/{seller_id}.
   */
  async updateSellerGroup(
    listId: number,
    sellerId: number,
    updates: { note?: string | null; status?: 'active' | 'ordered' | null }
  ): Promise<ShoppingListSellerGroupSchema> {
    const body: ShoppingListSellerGroupUpdateSchema = {
      note: updates.note ?? null,
      status: updates.status ?? null,
    };

    return await apiRequest(() =>
      this.client.PUT('/api/shopping-lists/{list_id}/seller-groups/{seller_id}', {
        params: { path: { list_id: listId, seller_id: sellerId } },
        body,
      })
    );
  }

  /**
   * Convenience: set a seller group status to "ordered" (place order).
   */
  async orderSellerGroup(
    listId: number,
    sellerId: number
  ): Promise<ShoppingListSellerGroupSchema> {
    return this.updateSellerGroup(listId, sellerId, { status: 'ordered' });
  }

  /**
   * Convenience: set a seller group status back to "active" (reopen).
   */
  async reopenSellerGroup(
    listId: number,
    sellerId: number
  ): Promise<ShoppingListSellerGroupSchema> {
    return this.updateSellerGroup(listId, sellerId, { status: 'active' });
  }

  /**
   * Delete a seller group from a shopping list.
   * Lines are returned to the unassigned bucket.
   * Wraps DELETE /api/shopping-lists/{list_id}/seller-groups/{seller_id}.
   */
  async deleteSellerGroup(
    listId: number,
    sellerId: number
  ): Promise<void> {
    // DELETE returns 204 No Content -- apiRequest expects data, so we handle manually
    const { error, response } = await this.client.DELETE(
      '/api/shopping-lists/{list_id}/seller-groups/{seller_id}',
      {
        params: { path: { list_id: listId, seller_id: sellerId } },
      }
    );

    if (error || !response.ok) {
      const statusInfo = `${response.status} ${response.statusText}`;
      throw new Error(`Failed to delete seller group: ${statusInfo}`);
    }
  }

  // ---------------------------------------------------------------------------
  // List status
  // ---------------------------------------------------------------------------

  async markDone(listId: number): Promise<ShoppingListResponseSchema> {
    await apiRequest(() =>
      this.client.PUT('/api/shopping-lists/{list_id}/status', {
        params: { path: { list_id: listId } },
        body: { status: 'done' },
      })
    );

    return await this.getListDetail(listId);
  }

  // ---------------------------------------------------------------------------
  // Line receive / complete
  // ---------------------------------------------------------------------------

  async receiveLine(
    _listId: number,
    lineId: number,
    input: { receiveQuantity: number; allocations: Array<{ boxNo: number; locNo: number; quantity: number }> }
  ): Promise<ShoppingListLineResponseSchema> {
    const body: ShoppingListLineReceiveSchema = {
      receive_qty: input.receiveQuantity,
      allocations: input.allocations.map(allocation => ({
        box_no: allocation.boxNo,
        loc_no: allocation.locNo,
        qty: allocation.quantity,
      })),
    };

    return await apiRequest(() =>
      this.client.POST('/api/shopping-list-lines/{line_id}/receive', {
        params: { path: { line_id: lineId } },
        body,
      })
    );
  }

  async completeLine(
    _listId: number,
    lineId: number,
    mismatchReason: string | null = null
  ): Promise<ShoppingListLineResponseSchema> {
    const body: ShoppingListLineCompleteSchema = {
      mismatch_reason: mismatchReason,
    };

    return await apiRequest(() =>
      this.client.POST('/api/shopping-list-lines/{line_id}/complete', {
        params: { path: { line_id: lineId } },
        body,
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Kit linking
  // ---------------------------------------------------------------------------

  /**
   * Link this shopping list to a kit by pushing kit contents to the list.
   * Convenience wrapper for the kit -> shopping list linking endpoint.
   * Returns the link response containing list details and link metadata.
   */
  async linkToKit(listId: number, kitId: number): Promise<KitShoppingListLinkResponseSchema> {
    const payload: KitShoppingListRequestSchema = {
      shopping_list_id: listId,
      honor_reserved: false,
      new_list_name: null,
      new_list_description: null,
      note_prefix: null,
      units: null,
    };

    return await apiRequest(() =>
      this.client.POST('/api/kits/{kit_id}/shopping-lists', {
        params: { path: { kit_id: kitId } },
        body: payload,
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Assertions
  // ---------------------------------------------------------------------------

  async expectActiveMembership(options: { listId: number; partKey: string; needed?: number; noteIncludes?: string }): Promise<void> {
    const detail = await this.getListDetail(options.listId);
    expect(detail.status).toBe('active');

    const line = detail.lines.find(existing => existing.part.key === options.partKey);
    expect(line, `Expected active membership for part ${options.partKey} on list ${options.listId}`).toBeDefined();

    if (options.needed !== undefined) {
      expect(line?.needed).toBe(options.needed);
    }

    if (options.noteIncludes) {
      expect(line?.note ?? '').toContain(options.noteIncludes);
    }
  }
}
