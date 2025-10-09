import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base-page';
import { waitForListLoading } from '../helpers';
import { SellerSelectorHarness } from './seller-selector-harness';

export class ShoppingListsPage extends BasePage {
  readonly overviewRoot: Locator;
  readonly overviewSearch: Locator;
  readonly overviewCreateButton: Locator;
  readonly conceptRoot: Locator;
  readonly conceptTable: Locator;
  readonly readyRoot: Locator;

  constructor(page: Page) {
    super(page);
    this.overviewRoot = page.getByTestId('shopping-lists.overview');
    this.overviewSearch = page.getByTestId('shopping-lists.overview.search');
    this.overviewCreateButton = page.getByTestId('shopping-lists.overview.create');
    this.conceptRoot = page.getByTestId('shopping-lists.concept.page');
    this.conceptTable = page.getByTestId('shopping-lists.concept.table');
    this.readyRoot = page.getByTestId('shopping-lists.ready.page');
  }

  async gotoOverview(): Promise<void> {
    await this.goto('/shopping-lists');
    await expect(this.overviewRoot).toBeVisible();
    await this.waitForOverviewReady();
  }

  async waitForOverviewReady(): Promise<void> {
    await waitForListLoading(this.page, 'shoppingLists.overview', 'ready');
  }

  overviewCardByName(name: string | RegExp): Locator {
    return this.page
      .locator('[data-testid^="shopping-lists.overview.card."]')
      .filter({ hasText: name })
      .first();
  }

  async createConceptList(options: { name: string; description?: string }): Promise<void> {
    await this.overviewCreateButton.click();
    const dialog = this.page.getByRole('dialog', { name: /create shopping list/i });
    await expect(dialog).toBeVisible();

    await dialog.getByTestId('ShoppingListCreate:concept.field.name').fill(options.name);
    if (options.description !== undefined) {
      await dialog.getByTestId('ShoppingListCreate:concept.field.description').fill(options.description);
    }

    await dialog.getByTestId('ShoppingListCreate:concept.submit').click();
  }

  async deleteConceptListByName(name: string): Promise<void> {
    const card = this.overviewCardByName(name);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /delete/i }).click();

    const confirmDialog = this.page.getByTestId('shopping-lists.overview.delete-dialog');
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: /delete/i }).click();
    await this.waitForOverviewReady();
  }

  async openConceptListByName(name: string): Promise<void> {
    const card = this.overviewCardByName(name);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /open list/i }).click();
    await this.waitForConceptReady();
  }

  async gotoConcept(listId: number): Promise<void> {
    await this.goto(`/shopping-lists/${listId}`);
    await this.waitForConceptReady();
  }

  async gotoReady(listId: number): Promise<void> {
    await this.goto(`/shopping-lists/${listId}`);
    await this.waitForReadyView();
  }

  async waitForConceptReady(): Promise<void> {
    const event = await waitForListLoading(this.page, 'shoppingLists.list', 'ready');
    if (event.metadata?.view) {
      expect(event.metadata.view).toBe('concept');
    }
    await expect(this.conceptRoot).toBeVisible();
  }

  async waitForReadyView(): Promise<void> {
    const event = await waitForListLoading(this.page, 'shoppingLists.list', 'ready');
    expect(event.metadata?.view).toBe('ready');
    await expect(this.readyRoot).toBeVisible();
  }

  conceptRowByPart(part: string | RegExp): Locator {
    return this.page
      .locator('[data-testid^="shopping-lists.concept.row."]')
      .filter({ hasText: part })
      .first();
  }

  readyGroupBySeller(name: string | RegExp): Locator {
    return this.page
      .locator('[data-testid^="shopping-lists.ready.group.card."]')
      .filter({ hasText: name })
      .first();
  }

  readyLineRow(part: string | RegExp): Locator {
    return this.page
      .locator('[data-testid^="shopping-lists.ready.line."]')
      .filter({ hasText: part })
      .first();
  }

  async addConceptLine(options: {
    partSearch: string;
    needed?: number;
    sellerName?: string;
    note?: string;
  }): Promise<void> {
    await this.page.getByTestId('shopping-lists.concept.table.add').click();
    const dialog = this.page.getByTestId('ShoppingListLineForm:add.dialog');
    await expect(dialog).toBeVisible();

    await waitForListLoading(this.page, 'parts.selector', 'ready');
    const partInput = dialog.getByTestId('parts.selector.input');
    await partInput.fill(options.partSearch);
    await this.page.getByRole('option', { name: new RegExp(options.partSearch, 'i') }).first().click();

    if (options.needed !== undefined) {
      await dialog.getByTestId('ShoppingListLineForm:add.field.needed').fill(String(options.needed));
    }

    if (options.sellerName) {
      const sellerHarness = new SellerSelectorHarness(this.page, dialog.getByTestId('ShoppingListLineForm:add.field.seller'));
      await sellerHarness.waitForReady();
      await sellerHarness.search(options.sellerName);
      await sellerHarness.selectOption(options.sellerName);
    }

    if (options.note !== undefined) {
      await dialog.getByTestId('ShoppingListLineForm:add.field.note').fill(options.note);
    }

    await dialog.getByTestId('ShoppingListLineForm:add.submit').click();
    await this.waitForConceptReady();
  }

  async editConceptLine(part: string | RegExp, updates: { needed?: number; sellerName?: string | null; note?: string }): Promise<void> {
    const row = this.conceptRowByPart(part);
    await expect(row).toBeVisible();
    await row.getByTestId(/actions$/).click();
    await this.page.getByRole('menuitem', { name: /edit line/i }).click();

    const dialog = this.page.getByRole('dialog', { name: /edit line/i });
    await expect(dialog).toBeVisible();

    if (updates.needed !== undefined) {
      await dialog.locator('input[type="number"]').fill(String(updates.needed));
    }

    if (updates.sellerName !== undefined) {
      const harness = new SellerSelectorHarness(this.page, dialog.locator('[data-testid$="field.seller"]'));
      await harness.waitForReady();
      if (updates.sellerName) {
        await harness.search(updates.sellerName);
        await harness.selectOption(updates.sellerName);
      } else {
        await harness.search('');
        // Clear selection by selecting the empty option if available
        await harness.input.fill('');
        await this.page.keyboard.press('Escape');
      }
    }

    if (updates.note !== undefined) {
      await dialog.locator('textarea').fill(updates.note);
    }

    await dialog.getByRole('button', { name: /save/i }).click();
    await this.waitForConceptReady();
  }

  async editReadyLine(part: string | RegExp, updates: { sellerName?: string | null; needed?: number; note?: string }): Promise<void> {
    const row = this.readyLineRow(part);
    await expect(row).toBeVisible();
    await row.getByTestId(/actions$/).click();
    await this.page.getByTestId(/actions\.edit$/).click();

    const dialog = this.page.getByRole('dialog', { name: /edit line/i });
    await expect(dialog).toBeVisible();

    if (updates.needed !== undefined) {
      await dialog.locator('input[type="number"]').fill(String(updates.needed));
    }

    if (updates.sellerName !== undefined) {
      const harness = new SellerSelectorHarness(this.page, dialog.locator('[data-testid$="field.seller"]'));
      await harness.waitForReady();
      if (updates.sellerName) {
        await harness.search(updates.sellerName);
        await harness.selectOption(updates.sellerName);
      } else {
        await harness.search('');
        await harness.input.fill('');
        await this.page.keyboard.press('Escape');
      }
    }

    if (updates.note !== undefined) {
      await dialog.locator('textarea').fill(updates.note);
    }

    await dialog.getByRole('button', { name: /save/i }).click();
    await this.waitForReadyView();
  }

  async deleteConceptLine(part: string | RegExp): Promise<void> {
    const row = this.conceptRowByPart(part);
    await expect(row).toBeVisible();
    await row.getByTestId(/actions$/).click();
    await this.page.getByRole('menuitem', { name: /delete line/i }).click();

    const dialog = this.page.getByRole('dialog', { name: /delete line/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /delete line/i }).click();
    await this.waitForConceptReady();
  }

  async markReady(): Promise<void> {
    const button = this.page.getByTestId('shopping-lists.concept.mark-ready.button');
    await button.click();
  }

  async expectStatus(label: string | RegExp): Promise<void> {
    await expect(this.page.getByTestId('shopping-lists.concept.header.status')).toHaveText(label);
  }

  async markLineOrdered(part: string | RegExp, quantity: number): Promise<void> {
    const row = this.readyLineRow(part);
    await expect(row).toBeVisible();
    await row.getByTestId(/ordered\.edit$/).click();

    const dialog = this.page.getByTestId('shopping-lists.ready.order-line.dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('shopping-lists.ready.order-line.field.orderedQuantity').fill(String(quantity));
    await dialog.getByTestId('shopping-lists.ready.order-line.submit').click();
    await this.waitForReadyView();
  }

  async revertLine(part: string | RegExp): Promise<void> {
    const row = this.readyLineRow(part);
    await expect(row).toBeVisible();
    await row.getByTestId(/actions$/).click();
    await this.page.getByTestId(/actions\.revert$/).click();
    await this.waitForReadyView();
  }

  async markGroupOrdered(seller: string | RegExp, overrides: Record<string, number>): Promise<void> {
    const card = this.readyGroupBySeller(seller);
    await expect(card).toBeVisible();
    await card.getByTestId(/order-group$/).click();

    const dialog = this.page.getByTestId('shopping-lists.ready.order-group.dialog');
    await expect(dialog).toBeVisible();

    for (const [lineId, quantity] of Object.entries(overrides)) {
      await dialog.getByTestId(`shopping-lists.ready.order-group.field.${lineId}`).fill(String(quantity));
    }

    await dialog.getByTestId('shopping-lists.ready.order-group.submit').click();
    await this.waitForReadyView();
  }

  async backToConcept(): Promise<void> {
    await this.page.getByTestId('shopping-lists.ready.toolbar.back-to-concept').click();
    await this.waitForConceptReady();
  }
}
