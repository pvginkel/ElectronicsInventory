import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base-page';
import { waitForListLoading, waitForUiState, expectConsoleError } from '../helpers';
import { SellerSelectorHarness } from './seller-selector-harness';
import type { ListLoadingTestEvent, UiStateTestEvent } from '@/types/test-events';

export class ShoppingListsPage extends BasePage {
  readonly overviewRoot: Locator;
  readonly overviewSearch: Locator;
  readonly overviewCreateButton: Locator;
  readonly overviewTabs: Locator;
  readonly overviewActiveTab: Locator;
  readonly overviewCompletedTab: Locator;
  readonly overviewSummary: Locator;
  readonly conceptRoot: Locator;
  readonly conceptTable: Locator;
  readonly readyRoot: Locator;
  readonly readyToolbar: Locator;
  readonly updateStockDialog: Locator;
  readonly updateStockForm: Locator;

  constructor(page: Page) {
    super(page);
    this.overviewRoot = page.getByTestId('shopping-lists.overview');
    this.overviewSearch = page.getByTestId('shopping-lists.overview.search');
    this.overviewCreateButton = page.getByTestId('shopping-lists.overview.create');
    this.overviewTabs = page.getByTestId('shopping-lists.overview.tabs');
    this.overviewActiveTab = page.getByTestId('shopping-lists.overview.tabs.active');
    this.overviewCompletedTab = page.getByTestId('shopping-lists.overview.tabs.completed');
    this.overviewSummary = page.getByTestId('shopping-lists.overview.summary');
    this.conceptRoot = page.getByTestId('shopping-lists.concept.page');
    this.conceptTable = page.getByTestId('shopping-lists.concept.table');
    this.readyRoot = page.getByTestId('shopping-lists.ready.page');
    this.readyToolbar = page.getByTestId('shopping-lists.ready.toolbar');
    this.updateStockDialog = page.getByTestId('shopping-lists.ready.update-stock.dialog');
    this.updateStockForm = page.getByTestId('shopping-lists.ready.update-stock.form');
  }

  async gotoOverview(): Promise<void> {
    await this.goto('/shopping-lists');
    await expect(this.overviewRoot).toBeVisible();
    await this.waitForOverviewReady();
  }

  async waitForOverviewReady(): Promise<void> {
    await waitForListLoading(this.page, 'shoppingLists.overview', 'ready');
  }

  async waitForOverviewFiltersReady() {
    return waitForUiState(this.page, 'shoppingLists.overview.filters', 'ready');
  }

  async selectOverviewTab(tab: 'active' | 'completed'): Promise<UiStateTestEvent> {
    const target = tab === 'active' ? this.overviewActiveTab : this.overviewCompletedTab;
    await target.click();
    const event = await this.waitForOverviewFiltersReady();
    await expect(target).toHaveAttribute('aria-selected', 'true');
    return event;
  }

  async expectOverviewTab(tab: 'active' | 'completed'): Promise<void> {
    const target = tab === 'active' ? this.overviewActiveTab : this.overviewCompletedTab;
    await expect(target).toHaveAttribute('aria-selected', 'true');
  }

  overviewGrid(tab: 'active' | 'completed' = 'active'): Locator {
    return this.page.getByTestId(`shopping-lists.overview.grid.${tab}`);
  }

  overviewCardByName(name: string | RegExp, tab: 'active' | 'completed' = 'active'): Locator {
    return this.overviewGrid(tab)
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
    await this.openConceptListByName(name);
    const deleteButton = this.page.getByTestId('shopping-lists.concept.header.delete');
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    const confirmDialog = this.page.getByTestId('shopping-lists.detail.delete-dialog');
    await expect(confirmDialog).toBeVisible();
    await expectConsoleError(this.page, /404 \(NOT FOUND\)/);
    await confirmDialog.getByRole('button', { name: /delete/i }).click();
    await this.waitForOverviewReady();
  }

  async openConceptListByName(name: string, tab: 'active' | 'completed' = 'active'): Promise<void> {
    const card = this.overviewCardByName(name, tab);
    await expect(card).toBeVisible();
    await card.click();
    await this.waitForConceptReady();
  }

  async gotoConcept(listId: number): Promise<ListLoadingTestEvent> {
    await this.goto(`/shopping-lists/${listId}`);
    return this.waitForConceptReady();
  }

  async gotoReady(listId: number): Promise<ListLoadingTestEvent> {
    await this.goto(`/shopping-lists/${listId}`);
    return this.waitForReadyView();
  }

  async waitForConceptReady(): Promise<ListLoadingTestEvent> {
    const event = await waitForListLoading(this.page, 'shoppingLists.list', 'ready');
    if (event.metadata?.view) {
      expect(event.metadata.view).toBe('concept');
    }
    await expect(this.conceptRoot).toBeVisible();
    return event;
  }

  async waitForReadyView(): Promise<ListLoadingTestEvent> {
    const event = await waitForListLoading(this.page, 'shoppingLists.list', 'ready');
    if (event.metadata?.view) {
      expect(event.metadata.view).toBe('ready');
    }
    await expect(this.readyRoot).toBeVisible();
    return event;
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

  readyLineReceivedCell(part: string | RegExp): Locator {
    return this.readyLineRow(part).getByTestId(/\.received$/);
  }

  readyLineStatusCell(part: string | RegExp): Locator {
    return this.readyLineRow(part).getByTestId(/\.status$/);
  }

  readyLineStatusBadge(part: string | RegExp): Locator {
    return this.readyLineRow(part).getByTestId(/\.status\.badge$/);
  }

  conceptStatusBadge(part: string | RegExp): Locator {
    return this.conceptRowByPart(part).getByTestId(/\.status\.badge$/);
  }

  conceptSellerBadge(part: string | RegExp): Locator {
    return this.conceptRowByPart(part).getByTestId(/\.seller\.badge$/);
  }

  readyGroupTotals(seller: string | RegExp): { needed: Locator; ordered: Locator; received: Locator } {
    const card = this.readyGroupBySeller(seller);
    return {
      needed: card.getByTestId(/totals\.needed$/),
      ordered: card.getByTestId(/totals\.ordered$/),
      received: card.getByTestId(/totals\.received$/),
    };
  }

  readyGroupCardAt(index: number): Locator {
    return this.page.locator('[data-testid^="shopping-lists.ready.group.card."]').nth(index);
  }

  async readyGroupKeys(): Promise<string[]> {
    const cards = this.page.locator('[data-testid^="shopping-lists.ready.group.card."]');
    const count = await cards.count();
    const keys: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const testId = await cards.nth(index).getAttribute('data-testid');
      if (testId) {
        const prefix = 'shopping-lists.ready.group.card.';
        const groupKey = testId.startsWith(prefix) ? testId.slice(prefix.length) : testId;
        keys.push(groupKey);
      }
    }
    return keys;
  }

  readyGroupFilterNote(seller: string | RegExp): Locator {
    const card = this.readyGroupBySeller(seller);
    return card.getByTestId('shopping-lists.ready.group.filter-note');
  }

  get readyMarkDoneButton(): Locator {
    return this.page.getByTestId('shopping-lists.ready.toolbar.mark-done');
  }

  async markListDoneFromReady(): Promise<void> {
    const markDoneButton = this.readyMarkDoneButton;
    await expect(markDoneButton).toBeVisible();
    await markDoneButton.click();

    const confirmDialog = this.page.getByTestId('shopping-lists.ready.archive-dialog');
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: /mark done/i }).click();
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

  async readyReceivedTooltip(part: string | RegExp): Promise<string | null> {
    const cell = this.readyLineReceivedCell(part);
    return cell.locator('span').first().getAttribute('title');
  }

  async openUpdateStock(part: string | RegExp): Promise<void> {
    const row = this.readyLineRow(part);
    await expect(row).toBeVisible();
    await row.getByTestId(/update-stock$/).click();
    await expect(this.updateStockDialog).toBeVisible();
  }

  async setReceiveQuantity(quantity: number): Promise<void> {
    await this.updateStockDialog.getByTestId('shopping-lists.ready.update-stock.field.receive').fill(String(quantity));
  }

  private allocationRow(index: number): Locator {
    return this.updateStockDialog.getByTestId(`shopping-lists.ready.update-stock.allocation.${index}`);
  }

  async addAllocationRow(): Promise<void> {
    await this.updateStockDialog.getByTestId('shopping-lists.ready.update-stock.add-allocation').click();
  }

  async setAllocationRow(index: number, values: { box?: number; location?: number; quantity?: number }): Promise<void> {
    const row = this.allocationRow(index);
    if (values.box !== undefined) {
      await row.getByTestId(/\.box$/).selectOption(String(values.box));
    }
    if (values.location !== undefined) {
      await row.getByTestId(/\.location$/).fill(String(values.location));
    }
    if (values.quantity !== undefined) {
      await row.getByTestId(/\.quantity$/).fill(String(values.quantity));
    }
  }

  async removeAllocationRow(index: number): Promise<void> {
    await this.allocationRow(index).getByTestId(/\.remove$/).click();
  }

  async submitReceiveForm(mode: 'save' | 'saveAndNext'): Promise<void> {
    const buttonTestId = mode === 'save'
      ? 'shopping-lists.ready.update-stock.submit'
      : 'shopping-lists.ready.update-stock.submit-next';
    await this.updateStockDialog.getByTestId(buttonTestId).click();
  }

  async markUpdateStockDone(): Promise<void> {
    await this.updateStockDialog.getByTestId('shopping-lists.ready.update-stock.mark-done').click();
  }

  async confirmMismatch(reason: string): Promise<void> {
    const dialog = this.page.getByTestId('shopping-lists.ready.update-stock.mismatch-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('shopping-lists.ready.update-stock.mismatch-reason').fill(reason);
    await dialog.getByTestId('shopping-lists.ready.update-stock.mismatch-confirm').click();
  }

  async cancelUpdateStock(): Promise<void> {
    await this.updateStockDialog.getByRole('button', { name: /cancel/i }).click();
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
    const revertOption = this.page.getByRole('menuitem', { name: /revert to new/i });
    if (await revertOption.count()) {
      await revertOption.first().click();
      await this.waitForReadyView();
      return;
    }

    // Fallback: adjust ordered quantity to zero when revert option unavailable.
    await this.page.keyboard.press('Escape');
    await row.getByTestId(/ordered\.edit$/).click();
    const dialog = this.page.getByTestId('shopping-lists.ready.order-line.dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('shopping-lists.ready.order-line.field.orderedQuantity').fill('0');
    await dialog.getByTestId('shopping-lists.ready.order-line.submit').click();
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
