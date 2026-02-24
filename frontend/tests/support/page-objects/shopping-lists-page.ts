import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base-page';
import { waitForListLoading, waitForUiState, expectConsoleError } from '../helpers';
import { SellerSelectorHarness } from './seller-selector-harness';
import type { ListLoadingTestEvent, UiStateTestEvent } from '@/lib/test/test-events';

export class ShoppingListsPage extends BasePage {
  readonly overviewRoot: Locator;
  readonly overviewHeader: Locator;
  readonly overviewContent: Locator;
  readonly overviewSearch: Locator;
  readonly overviewCreateButton: Locator;
  readonly overviewTabs: Locator;
  readonly overviewActiveTab: Locator;
  readonly overviewCompletedTab: Locator;
  readonly overviewSummary: Locator;
  readonly detailLayout: Locator;
  readonly detailHeader: Locator;
  /** @deprecated The concept/ready split no longer exists. Use detailContent. */
  readonly detailContentConcept: Locator;
  /** @deprecated The concept/ready split no longer exists. Use detailContent. */
  readonly detailContentReady: Locator;
  readonly detailActions: Locator;
  readonly detailKitChips: Locator;
  readonly conceptToolbar: Locator;
  readonly conceptTable: Locator;
  readonly readyToolbar: Locator;
  readonly updateStockDialog: Locator;
  readonly updateStockForm: Locator;

  constructor(page: Page) {
    super(page);
    this.overviewRoot = page.getByTestId('shopping-lists.overview');
    this.overviewHeader = page.getByTestId('shopping-lists.overview.header');
    this.overviewContent = page.getByTestId('shopping-lists.overview.content');
    this.overviewSearch = page.getByTestId('shopping-lists.overview.search.input');
    this.overviewCreateButton = page.getByTestId('shopping-lists.overview.create');
    this.overviewTabs = page.getByTestId('shopping-lists.overview.tabs');
    this.overviewActiveTab = page.getByTestId('shopping-lists.overview.tabs.active');
    this.overviewCompletedTab = page.getByTestId('shopping-lists.overview.tabs.completed');
    this.overviewSummary = page.getByTestId('shopping-lists.overview.summary');
    this.detailLayout = page.getByTestId('shopping-lists.detail.layout');
    this.detailHeader = page.getByTestId('shopping-lists.detail.header');
    // Legacy locators -- concept/ready split is gone; both point at the Kanban content area
    this.detailContentConcept = page.getByTestId('shopping-lists.detail.content');
    this.detailContentReady = page.getByTestId('shopping-lists.detail.content');
    this.detailActions = page.getByTestId('shopping-lists.detail.actions');
    this.detailKitChips = page.getByTestId('shopping-lists.concept.body.kits');
    this.conceptToolbar = page.getByTestId('shopping-lists.concept.toolbar');
    this.conceptTable = page.getByTestId('shopping-lists.concept.table');
    this.readyToolbar = page.getByTestId('shopping-lists.ready.toolbar');
    this.updateStockDialog = page.getByTestId('shopping-lists.ready.update-stock.dialog');
    this.updateStockForm = page.getByTestId('shopping-lists.ready.update-stock.form');
  }

  async gotoOverview(): Promise<void> {
    await expectConsoleError(this.page, /Outdated Optimize Dep/);
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
    const target = this.overviewTab(tab);
    await target.click();
    const event = await this.waitForOverviewFiltersReady();
    await expect(target).toHaveAttribute('aria-selected', 'true');
    return event;
  }

  async expectOverviewTab(tab: 'active' | 'completed'): Promise<void> {
    const target = this.overviewTab(tab);
    await expect(target).toHaveAttribute('aria-selected', 'true');
  }

  overviewTab(tab: 'active' | 'completed'): Locator {
    const label = tab === 'active' ? 'Active' : 'Completed';
    return this.overviewTabs.getByRole('tab', { name: new RegExp(label, 'i') });
  }

  async overviewTabCount(tab: 'active' | 'completed'): Promise<number> {
    const tabLocator = this.overviewTab(tab);
    const countLocator = tabLocator.locator('span').nth(1);
    const countText = (await countLocator.innerText()).trim();
    const match = countText.match(/[\d,]+/);
    if (!match) {
      throw new Error(`Failed to parse ${tab} tab count from "${countText}"`);
    }
    return Number(match[0].replace(/,/g, ''));
  }

  async expectOverviewTabCounts(counts: { active: number; completed: number }): Promise<void> {
    await expect(this.overviewTab('active')).toContainText(new RegExp(`${counts.active.toLocaleString()}`));
    await expect(this.overviewTab('completed')).toContainText(new RegExp(`${counts.completed.toLocaleString()}`));
  }

  async expectOverviewSummary(text: string): Promise<void> {
    await expect(this.overviewSummary).toHaveText(text);
  }

  async getOverviewHeaderRect(): Promise<{ top: number; bottom: number; height: number }> {
    return this.overviewHeader.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height };
    });
  }

  /** Returns the detail content area. The concept/ready argument is accepted for backward compatibility but ignored. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  detailContent(_view?: 'concept' | 'ready'): Locator {
    return this.page.getByTestId('shopping-lists.detail.content');
  }

  async getDetailHeaderRect(): Promise<{ top: number; bottom: number; height: number }> {
    return this.detailHeader.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height };
    });
  }

  kitChip(kitId: number): Locator {
    return this.page.getByTestId(`shopping-lists.concept.body.kits.${kitId}`);
  }

  async getToolbarRect(view: 'concept' | 'ready'): Promise<{ top: number; bottom: number; height: number }> {
    const target = view === 'concept' ? this.conceptToolbar : this.readyToolbar;
    return target.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height };
    });
  }

  async scrollDetailContent(view: 'concept' | 'ready', target: number | 'bottom' = 'bottom'): Promise<void> {
    const container = this.detailContent(view);
    await container.evaluate((element, value) => {
      if (value === 'bottom') {
        element.scrollTo({ top: element.scrollHeight });
        return;
      }
      element.scrollTo({ top: value });
    }, target);
  }

  async detailContentScrollTop(view: 'concept' | 'ready'): Promise<number> {
    return this.detailContent(view).evaluate((element) => element.scrollTop);
  }

  async scrollOverviewContent(target: number | 'bottom' = 'bottom'): Promise<void> {
    await this.overviewContent.evaluate((element, value) => {
      if (value === 'bottom') {
        element.scrollTo({ top: element.scrollHeight });
        return;
      }

      element.scrollTo({ top: value });
    }, target);
  }

  async overviewContentScrollTop(): Promise<number> {
    return this.overviewContent.evaluate((element) => element.scrollTop);
  }

  async setOverviewTabsWidth(width: number): Promise<void> {
    await this.overviewTabs.evaluate((element, nextWidth) => {
      element.style.width = `${nextWidth}px`;
    }, width);
  }

  async getOverviewTabsScroll(): Promise<number> {
    return this.overviewTabs.evaluate((element) => element.scrollLeft);
  }

  async resetOverviewTabsScroll(): Promise<void> {
    await this.overviewTabs.evaluate((element) => {
      element.scrollLeft = 0;
    });
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

  /**
   * Navigate to a shopping list detail view (Kanban board).
   * Legacy alias -- the concept/ready split no longer exists; every list
   * opens the Kanban board.
   */
  async gotoConcept(listId: number): Promise<ListLoadingTestEvent> {
    return this.gotoKanban(listId);
  }

  /**
   * Navigate to a shopping list detail view (Kanban board).
   * Legacy alias kept for backward-compatibility with existing tests.
   */
  async gotoReady(listId: number): Promise<ListLoadingTestEvent> {
    return this.gotoKanban(listId);
  }

  /**
   * Wait for the shopping list detail (Kanban) to finish loading.
   * Legacy alias -- delegates to waitForKanbanReady().
   */
  async waitForConceptReady(): Promise<ListLoadingTestEvent> {
    return this.waitForKanbanReady();
  }

  /**
   * Wait for the shopping list detail (Kanban) to finish loading.
   * Legacy alias -- delegates to waitForKanbanReady().
   */
  async waitForReadyView(): Promise<ListLoadingTestEvent> {
    return this.waitForKanbanReady();
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

  readyLineAction(part: string | RegExp, action: 'mark-ordered' | 'adjust-ordered' | 'update-stock' | 'revert' | 'edit'): Locator {
    if (action === 'update-stock') {
      return this.readyLineRow(part).getByTestId(/\.update-stock$/);
    }
    if (action === 'adjust-ordered') {
      return this.readyLineRow(part).getByTestId(/\.ordered\.edit$/);
    }
    return this.readyLineRow(part).getByTestId(new RegExp(`actions\\.${action}$`));
  }

  conceptStatusBadge(part: string | RegExp): Locator {
    return this.conceptRowByPart(part).getByTestId(/\.status\.badge$/);
  }

  conceptSellerBadge(part: string | RegExp): Locator {
    return this.conceptRowByPart(part).getByTestId(/\.seller\.badge$/);
  }

  conceptBadge(badge: 'total' | 'new' | 'ordered' | 'done'): Locator {
    return this.page.getByTestId(`shopping-lists.concept.header.badge.${badge}`);
  }

  conceptToolbarLineCount(): Locator {
    return this.conceptToolbar.getByTestId('shopping-lists.concept.toolbar.line-count');
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

  readyGroupEditButton(seller: string | RegExp): Locator {
    return this.readyGroupBySeller(seller).getByRole('button', { name: /edit group/i });
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
    await confirmDialog.getByRole('button', { name: /complete list|mark as completed/i }).click();
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
    await row.getByTestId(/\.edit$/).click();

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
    await row.getByTestId(/actions\.edit$/).click();

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
    await row.getByTestId(/\.delete$/).click();
    await this.waitForConceptReady();
  }

  async markReady(): Promise<void> {
    const button = this.page.getByTestId('shopping-lists.concept.toolbar.mark-ready');
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

  async addAllocationRow(): Promise<void> {
    await this.updateStockDialog.getByTestId('shopping-lists.ready.update-stock.add-allocation').click();
  }

  async setExistingAllocationReceive(index: number, receive: number): Promise<void> {
    const row = this.updateStockDialog.locator(
      `[data-testid^="shopping-lists.ready.update-stock.row."][data-allocation-type="existing"]`,
    ).nth(index);
    await row.getByTestId(/\.receive$/).fill(String(receive));
  }

  async setNewAllocationRow(index: number, values: { box?: number; location?: number; receive?: number }): Promise<void> {
    const row = this.updateStockDialog.locator(
      `[data-testid^="shopping-lists.ready.update-stock.row."][data-allocation-type="new"]`,
    ).nth(index);
    if (values.box !== undefined) {
      await row.getByTestId(/\.box$/).selectOption(String(values.box));
    }
    if (values.location !== undefined) {
      await row.getByTestId(/\.location$/).fill(String(values.location));
    }
    if (values.receive !== undefined) {
      await row.getByTestId(/\.receive$/).fill(String(values.receive));
    }
  }

  async removeNewAllocationRow(index: number): Promise<void> {
    const row = this.updateStockDialog.locator(
      `[data-testid^="shopping-lists.ready.update-stock.row."][data-allocation-type="new"]`,
    ).nth(index);
    await row.getByTestId(/\.remove$/).click();
  }

  async submitReceiveForm(): Promise<void> {
    await this.updateStockDialog.getByTestId('shopping-lists.ready.update-stock.submit').click();
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
    const markButton = row.getByTestId(/actions\.mark-ordered$/);
    if (await markButton.count()) {
      await markButton.click();
    } else {
      await row.getByTestId(/\.ordered\.edit$/).click();
    }

    const dialog = this.page.getByTestId('shopping-lists.ready.order-line.dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('shopping-lists.ready.order-line.field.orderedQuantity').fill(String(quantity));
    await dialog.getByTestId('shopping-lists.ready.order-line.submit').click();
    await this.waitForReadyView();
  }

  async revertLine(part: string | RegExp): Promise<void> {
    const row = this.readyLineRow(part);
    await expect(row).toBeVisible();
    const revertButton = row.getByTestId(/actions\.revert$/);
    if (await revertButton.count()) {
      await revertButton.click();
      await this.waitForReadyView();
      return;
    }

    // Fallback: adjust ordered quantity to zero when revert control unavailable.
    const adjustButton = row.getByTestId(/\.ordered\.edit$/);
    await expect(adjustButton).toBeVisible();
    await adjustButton.click();
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

  // =========================================================================
  // Kanban Board helpers
  // =========================================================================

  /** Navigate to the Kanban detail view and wait for loading. */
  async gotoKanban(listId: number): Promise<ListLoadingTestEvent> {
    await this.goto(`/shopping-lists/${listId}`);
    return this.waitForKanbanReady();
  }

  /** Wait for the Kanban board to finish loading. */
  async waitForKanbanReady(): Promise<ListLoadingTestEvent> {
    const event = await waitForListLoading(this.page, 'shoppingLists.kanban', 'ready');
    await expect(this.detailLayout).toBeVisible();
    return event;
  }

  /** The Kanban board root container. */
  get kanbanBoard(): Locator {
    return this.page.getByTestId('shopping-lists.kanban.board');
  }

  /** The Kanban content wrapper (includes kit chips + board). */
  get kanbanContent(): Locator {
    return this.page.getByTestId('shopping-lists.kanban.content');
  }

  /** Locate a Kanban column by its group key (seller ID or 'ungrouped'). */
  kanbanColumn(groupKey: string): Locator {
    return this.page.getByTestId(`shopping-lists.kanban.column.${groupKey}`);
  }

  /** Locate a Kanban column by filtering on seller name text. */
  kanbanColumnBySeller(sellerName: string | RegExp): Locator {
    return this.page
      .locator('[data-testid^="shopping-lists.kanban.column."]')
      .filter({ hasText: sellerName })
      .first();
  }

  /** The skeleton column for creating new seller groups. */
  get kanbanSkeletonColumn(): Locator {
    return this.page.getByTestId('shopping-lists.kanban.skeleton-column');
  }

  /** Locate a Kanban card by line ID. */
  kanbanCard(lineId: number): Locator {
    return this.page.getByTestId(`shopping-lists.kanban.card.${lineId}`);
  }

  /**
   * Locate card root elements inside a specific column by group key.
   * Uses a regex to match only "shopping-lists.kanban.card.<digits>" and
   * exclude nested sub-elements (field, delete, receive, seller-link).
   */
  kanbanColumnCards(groupKey: string): Locator {
    return this.kanbanColumn(groupKey).locator(
      'css=[data-testid^="shopping-lists.kanban.card."]:not([data-testid*=".field."]):not([data-testid$=".delete"]):not([data-testid$=".receive"]):not([data-testid$=".seller-link"])',
    );
  }

  /** Get the card count in a specific column. */
  async kanbanColumnCardCount(groupKey: string): Promise<number> {
    return this.kanbanColumnCards(groupKey).count();
  }

  /**
   * Get all column group keys from the board.
   * Matches only column root elements (not nested header/button sub-elements).
   */
  async kanbanColumnKeys(): Promise<string[]> {
    const columns = this.page.locator(
      'css=[data-testid^="shopping-lists.kanban.column."]:not([data-testid*=".header"]):not([data-testid*=".add-part"]):not([data-testid*=".menu"]):not([data-testid*=".complete"]):not([data-testid*=".order-note"])',
    );
    const count = await columns.count();
    const keys: string[] = [];
    for (let i = 0; i < count; i++) {
      const testId = await columns.nth(i).getAttribute('data-testid');
      if (testId) {
        const prefix = 'shopping-lists.kanban.column.';
        keys.push(testId.startsWith(prefix) ? testId.slice(prefix.length) : testId);
      }
    }
    return keys;
  }

  /** Click the "Add Part" button in a column header. */
  async kanbanAddPart(groupKey: string): Promise<void> {
    await this.page.getByTestId(`shopping-lists.kanban.column.${groupKey}.add-part`).click();
  }

  /** Click the "Complete" button on a seller column header. */
  async kanbanCompleteGroup(groupKey: string): Promise<void> {
    await this.page.getByTestId(`shopping-lists.kanban.column.${groupKey}.complete`).click();
  }

  /** Open the overflow menu on a seller column header. */
  async kanbanOpenColumnMenu(groupKey: string): Promise<void> {
    await this.page.getByTestId(`shopping-lists.kanban.column.${groupKey}.menu`).click();
  }

  /** Click the delete button (trash) on a card. */
  async kanbanDeleteCard(lineId: number): Promise<void> {
    await this.page.getByTestId(`shopping-lists.kanban.card.${lineId}.delete`).click();
  }

  /** Click the receive button on a card. Waits for the button to appear, then clicks. */
  async kanbanReceiveCard(lineId: number): Promise<void> {
    const receiveButton = this.page.getByTestId(`shopping-lists.kanban.card.${lineId}.receive`);
    await expect(receiveButton).toBeVisible();
    await receiveButton.click({ force: true });
  }

  /** The delete seller group confirmation dialog. */
  get kanbanDeleteGroupDialog(): Locator {
    return this.page.getByTestId('shopping-lists.kanban.delete-group-dialog');
  }

  /** The order note edit dialog. */
  get kanbanOrderNoteDialog(): Locator {
    return this.page.getByTestId('shopping-lists.kanban.order-note-dialog');
  }

  /** The DnD move confirmation dialog (for ordered > 0 moves). */
  get kanbanMoveConfirmDialog(): Locator {
    return this.page.getByTestId('shopping-lists.kanban.move-confirm-dialog');
  }

  /**
   * Perform a drag-and-drop from a source element to a target element.
   *
   * Uses a manual pointer event sequence (down -> multiple moves -> up) that
   * reliably triggers @dnd-kit's PointerSensor (8px activation constraint).
   * Playwright's built-in `dragTo` doesn't always generate enough intermediate
   * pointermove events.
   */
  async kanbanDragCard(source: Locator, target: Locator): Promise<void> {
    const sourceBounds = await source.boundingBox();
    const targetBounds = await target.boundingBox();
    if (!sourceBounds || !targetBounds) {
      throw new Error('Cannot determine bounding box for drag source or target');
    }

    const srcX = sourceBounds.x + sourceBounds.width / 2;
    const srcY = sourceBounds.y + sourceBounds.height / 2;
    const tgtX = targetBounds.x + targetBounds.width / 2;
    const tgtY = targetBounds.y + targetBounds.height / 2;

    // Step count high enough to exceed the 8px activation distance
    const steps = 20;

    await this.page.mouse.move(srcX, srcY);
    await this.page.mouse.down();

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = srcX + (tgtX - srcX) * t;
      const y = srcY + (tgtY - srcY) * t;
      await this.page.mouse.move(x, y);
    }

    await this.page.mouse.up();
  }
}
