import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base-page';
import { waitForListLoading } from '../helpers';

type KitTab = 'active' | 'archived';

export class KitsPage extends BasePage {
  readonly overviewRoot: Locator;
  readonly overviewHeader: Locator;
  readonly overviewContent: Locator;
  readonly overviewSearch: Locator;
  readonly overviewSearchInput: Locator;
  readonly overviewSearchClear: Locator;
  readonly overviewTabs: Locator;
  readonly overviewActiveTab: Locator;
  readonly overviewArchivedTab: Locator;
  readonly overviewCounts: Locator;
  readonly newKitButton: Locator;
  readonly createDialog: Locator;
  readonly createForm: Locator;
  readonly createNameField: Locator;
  readonly createDescriptionField: Locator;
  readonly createBuildTargetField: Locator;
  readonly createSubmitButton: Locator;
  readonly createCancelButton: Locator;
  readonly detailLayout: Locator;
  readonly detailHeader: Locator;
  readonly detailContent: Locator;
  readonly detailTitle: Locator;
  readonly detailStatusBadge: Locator;
  readonly detailDescription: Locator;
  readonly detailBuildTargetBadge: Locator;
  readonly detailLinksSection: Locator;
  readonly detailOrderButton: Locator;
  readonly detailOrderDialog: Locator;
  readonly detailOrderForm: Locator;
  readonly detailOrderUnitsField: Locator;
  readonly detailOrderSelector: Locator;
  readonly detailOrderSubmit: Locator;
  readonly detailOrderCancel: Locator;
  readonly detailEditButton: Locator;
  readonly detailEditWrapper: Locator;
  readonly detailEditTooltip: Locator;
  readonly detailMenuButton: Locator;
  readonly detailArchiveMenuItem: Locator;
  readonly detailUnarchiveMenuItem: Locator;
  readonly detailDeleteMenuItem: Locator;
  readonly detailCreatePickListDialog: Locator;
  readonly detailCreatePickListForm: Locator;
  readonly detailCreatePickListRequestedUnits: Locator;
  readonly detailCreatePickListSubmit: Locator;
  readonly detailCreatePickListCancel: Locator;
  readonly detailCreatePickListContinue: Locator;
  readonly detailCreatePickListBack: Locator;
  readonly detailCreatePickListStepUnits: Locator;
  readonly detailCreatePickListStepShortfall: Locator;
  readonly detailEditDisabledWrapper: Locator;
  readonly detailSummary: Locator;
  readonly detailTable: Locator;
  readonly detailEmptyState: Locator;
  readonly detailAddPartButton: Locator;
  readonly detailCreateEditor: Locator;
  readonly detailCreateSubmit: Locator;
  readonly detailCreateCancel: Locator;
  readonly detailDeleteDialog: Locator;
  readonly detailDeleteConfirm: Locator;
  readonly detailDeleteCancel: Locator;
  readonly detailMetadataDialog: Locator;
  readonly detailMetadataForm: Locator;
  readonly detailMetadataNameField: Locator;
  readonly detailMetadataDescriptionField: Locator;
  readonly detailMetadataBuildTargetField: Locator;
  readonly detailMetadataSubmit: Locator;
  readonly detailMetadataCancel: Locator;
  readonly unlinkConfirmDialog: Locator;
  readonly pickListPanel: Locator;
  readonly pickListPanelAddButton: Locator;
  readonly pickListPanelOpenSection: Locator;
  readonly pickListPanelCompletedToggle: Locator;

  constructor(page: Page) {
    super(page);
    this.overviewRoot = page.getByTestId('kits.overview');
    this.overviewHeader = page.getByTestId('kits.overview.header');
    this.overviewContent = page.getByTestId('kits.overview.content');
    this.overviewSearch = page.getByTestId('kits.overview.search');
    this.overviewSearchInput = page.getByTestId('kits.overview.search.input');
    this.overviewSearchClear = page.getByTestId('kits.overview.search.clear');
    this.overviewTabs = page.getByTestId('kits.overview.tabs');
    this.overviewActiveTab = page.getByTestId('kits.overview.tabs.active');
    this.overviewArchivedTab = page.getByTestId('kits.overview.tabs.archived');
    this.overviewCounts = page.getByTestId('list-screen.counts');
    this.newKitButton = page.getByTestId('kits.overview.new');
    this.createDialog = page.getByTestId('kits.overview.create.dialog');
    this.createForm = page.getByTestId('kits.overview.create.form');
    this.createNameField = page.getByTestId('kits.overview.create.field.name');
    this.createDescriptionField = page.getByTestId('kits.overview.create.field.description');
    this.createBuildTargetField = page.getByTestId('kits.overview.create.field.build-target');
    this.createSubmitButton = page.getByTestId('kits.overview.create.submit');
    this.createCancelButton = page.getByTestId('kits.overview.create.cancel');
    this.detailLayout = page.getByTestId('kits.detail.layout');
    this.detailHeader = page.getByTestId('kits.detail.header');
    this.detailContent = page.getByTestId('kits.detail.content');
    this.detailTitle = page.getByTestId('kits.detail.header.name');
    this.detailStatusBadge = page.getByTestId('kits.detail.header.status');
    this.detailDescription = page.getByTestId('kits.detail.header.description');
    this.detailBuildTargetBadge = page.getByTestId('kits.detail.badge.build-target');
    this.detailLinksSection = page.getByTestId('kits.detail.body.links');
    this.detailOrderButton = page.getByTestId('kits.detail.actions.order-stock');
    this.detailOrderDialog = page.getByTestId('kits.detail.shopping-list.dialog');
    this.detailOrderForm = page.getByTestId('kits.detail.shopping-list.form');
    this.detailOrderUnitsField = page.getByTestId('kits.detail.shopping-list.units');
    this.detailOrderSelector = page.getByTestId('kits.detail.shopping-list.selector');
    this.detailOrderSubmit = page.getByTestId('kits.detail.shopping-list.submit');
    this.detailOrderCancel = page.getByTestId('kits.detail.shopping-list.cancel');
    this.detailEditButton = page.getByTestId('kits.detail.actions.edit');
    this.detailEditWrapper = page.getByTestId('kits.detail.actions.edit.wrapper');
    this.detailEditTooltip = page.getByTestId('kits.detail.actions.edit.tooltip');
    this.detailMenuButton = page.getByTestId('kits.detail.actions.menu');
    this.detailArchiveMenuItem = page.getByTestId('kits.detail.actions.archive');
    this.detailUnarchiveMenuItem = page.getByTestId('kits.detail.actions.unarchive');
    this.detailDeleteMenuItem = page.getByTestId('kits.detail.actions.delete');
    this.detailCreatePickListDialog = page.getByTestId('kits.detail.pick-list.create.dialog');
    this.detailCreatePickListForm = page.getByTestId('kits.detail.pick-list.create.form');
    this.detailCreatePickListRequestedUnits = page.getByTestId('kits.detail.pick-list.create.field.requested-units');
    this.detailCreatePickListSubmit = page.getByTestId('kits.detail.pick-list.create.submit');
    this.detailCreatePickListCancel = page.getByTestId('kits.detail.pick-list.create.cancel');
    this.detailCreatePickListContinue = page.getByTestId('kits.detail.pick-list.create.continue');
    this.detailCreatePickListBack = page.getByTestId('kits.detail.pick-list.create.back');
    this.detailCreatePickListStepUnits = page.getByTestId('kits.detail.pick-list.create.step.units');
    this.detailCreatePickListStepShortfall = page.getByTestId('kits.detail.pick-list.create.step.shortfall');
    this.detailEditDisabledWrapper = page.getByTestId('kits.detail.actions.edit.disabled-wrapper');
    this.detailSummary = page.getByTestId('kits.detail.table.summary');
    this.detailTable = page.getByTestId('kits.detail.table');
    this.detailEmptyState = page.getByTestId('kits.detail.table.empty');
    this.detailAddPartButton = page.getByTestId('kits.detail.table.add');
    this.detailCreateEditor = page.getByTestId('kits.detail.table.editor.create');
    this.detailCreateSubmit = page.getByTestId('kits.detail.table.editor.create.submit');
    this.detailCreateCancel = page.getByTestId('kits.detail.table.editor.create.cancel');
    this.detailDeleteDialog = page.getByTestId('kits.detail.table.delete.dialog');
    this.detailDeleteConfirm = page.getByTestId('kits.detail.table.delete.confirm');
    this.detailDeleteCancel = page.getByTestId('kits.detail.table.delete.cancel');
    this.detailMetadataDialog = page.getByTestId('kits.detail.metadata.dialog');
    this.detailMetadataForm = page.getByTestId('kits.detail.metadata.form');
    this.detailMetadataNameField = page.getByTestId('kits.detail.metadata.field.name');
    this.detailMetadataDescriptionField = page.getByTestId('kits.detail.metadata.field.description');
    this.detailMetadataBuildTargetField = page.getByTestId('kits.detail.metadata.field.build-target');
    this.detailMetadataSubmit = page.getByTestId('kits.detail.metadata.submit');
    this.detailMetadataCancel = page.getByTestId('kits.detail.metadata.cancel');
    this.unlinkConfirmDialog = page.getByTestId('kits.detail.shopping-list.unlink.dialog');
    this.pickListPanel = page.getByTestId('kits.detail.pick-lists.panel');
    this.pickListPanelAddButton = page.getByTestId('kits.detail.pick-lists.add');
    this.pickListPanelOpenSection = page.getByTestId('kits.detail.pick-lists.open');
    this.pickListPanelCompletedToggle = page.getByTestId('kits.detail.pick-lists.completed.toggle');
  }

  async gotoOverview(): Promise<void> {
    await this.goto('/kits');
    await expect(this.overviewRoot).toBeVisible();
    await this.waitForOverviewReady();
  }

  async waitForOverviewReady(): Promise<void> {
    await waitForListLoading(this.page, 'kits.overview', 'ready');
  }

  async openCreateDialog(): Promise<void> {
    await this.newKitButton.click();
    await expect(this.createDialog).toBeVisible();
  }

  async fillCreateForm(fields: { name?: string; description?: string; buildTarget?: number | string }): Promise<void> {
    if (fields.name !== undefined) {
      await this.createNameField.fill(fields.name);
    }
    if (fields.description !== undefined) {
      await this.createDescriptionField.fill(fields.description);
    }
    if (fields.buildTarget !== undefined) {
      await this.createBuildTargetField.fill(String(fields.buildTarget));
    }
  }

  async submitCreateForm(): Promise<void> {
    await this.createSubmitButton.click();
  }

  tabLocator(tab: KitTab): Locator {
    return tab === 'archived' ? this.overviewArchivedTab : this.overviewActiveTab;
  }

  gridLocator(tab: KitTab = 'active'): Locator {
    return this.page.getByTestId(`kits.overview.grid.${tab}`);
  }

  cardById(kitId: number, tab: KitTab = 'active'): Locator {
    return this.gridLocator(tab).getByTestId(`kits.overview.card.${kitId}`);
  }

  cardDetailLink(kitId: number, tab: KitTab = 'active'): Locator {
    return this.cardById(kitId, tab);
  }

  cardByName(name: string | RegExp, tab: KitTab = 'active'): Locator {
    return this.gridLocator(tab)
      .locator('[data-testid^="kits.overview.card."]')
      .filter({ hasText: name })
      .first();
  }

  activityRow(kitId: number, tab: KitTab = 'active'): Locator {
    return this.cardById(kitId, tab).getByTestId(`kits.overview.card.${kitId}.activity`);
  }

  shoppingIndicator(kitId: number, tab: KitTab = 'active'): Locator {
    return this.cardById(kitId, tab).getByTestId(`kits.overview.card.${kitId}.shopping-indicator`);
  }

  shoppingIndicatorTooltip(kitId: number): Locator {
    return this.page.getByTestId(`kits.overview.card.${kitId}.shopping-indicator.tooltip`);
  }

  pickIndicator(kitId: number, tab: KitTab = 'active'): Locator {
    return this.cardById(kitId, tab).getByTestId(`kits.overview.card.${kitId}.pick-indicator`);
  }

  pickIndicatorTooltip(kitId: number): Locator {
    return this.page.getByTestId(`kits.overview.card.${kitId}.pick-indicator.tooltip`);
  }

  archiveButton(kitId: number): Locator {
    return this.page.getByTestId(`kits.overview.controls.archive.${kitId}`);
  }

  unarchiveButton(kitId: number): Locator {
    return this.page.getByTestId(`kits.overview.controls.unarchive.${kitId}`);
  }

  async selectTab(tab: KitTab): Promise<void> {
    const target = this.tabLocator(tab);
    await target.click();
    await expect(target).toHaveAttribute('aria-selected', 'true');
  }

  async expectTabActive(tab: KitTab): Promise<void> {
    const target = this.tabLocator(tab);
    await expect(target).toHaveAttribute('aria-selected', 'true');
  }

  async search(term: string): Promise<void> {
    await this.overviewSearchInput.fill(term);
  }

  async clearSearch(): Promise<void> {
    await this.overviewSearchClear.waitFor({ state: 'attached' }).catch(() => {});
    if (await this.overviewSearchClear.isVisible()) {
      await this.overviewSearchClear.click();
    } else {
      await this.overviewSearchInput.fill('');
    }
  }

  async openDetailFromCard(kitId: number, tab: KitTab = 'active'): Promise<void> {
    const detailLink = this.cardDetailLink(kitId, tab);
    await detailLink.click();
    await expect(this.detailLayout).toBeVisible();
  }

  shoppingLinkChip(listId: number): Locator {
    return this.page.getByTestId(`kits.detail.links.shopping.${listId}`);
  }

  shoppingLinkChipByName(name: string | RegExp): Locator {
    return this.page
      .locator('[data-testid^="kits.detail.links.shopping."]')
      .filter({ hasText: name })
      .first();
  }

  shoppingLinkUnlinkButton(listId: number): Locator {
    return this.page.getByTestId(`kits.detail.links.shopping.unlink.${listId}`);
  }

  async selectShoppingListInDialog(name: string | RegExp): Promise<void> {
    const combobox = this.detailOrderSelector.getByRole('combobox');
    await combobox.click();
    await this.page.getByRole('option', { name }).click();
  }

  async typeShoppingListSearch(term: string): Promise<void> {
    const combobox = this.detailOrderSelector.getByRole('combobox');
    await combobox.click();
    await combobox.fill(term);
  }
  get detailLinksEmpty(): Locator {
    return this.page.getByTestId('kits.detail.links.empty');
  }

  detailSummaryBadge(kind: 'total' | 'shortfall'): Locator {
    return this.page.getByTestId(`kits.detail.table.summary.${kind}`);
  }

  pickListPanelOpenItem(pickListId: number): Locator {
    return this.page.getByTestId(`kits.detail.pick-lists.open.item.${pickListId}`);
  }

  pickListPanelCompletedSection(): Locator {
    return this.page.getByTestId('kits.detail.pick-lists.completed');
  }

  pickListPanelCompletedItem(pickListId: number): Locator {
    return this.page.getByTestId(`kits.detail.pick-lists.completed.item.${pickListId}`);
  }

  detailTableRow(contentId: number): Locator {
    return this.page.getByTestId(`kits.detail.table.row.${contentId}`);
  }

  detailReservationTrigger(contentId: number): Locator {
    return this.page.getByTestId(`kits.detail.table.row.${contentId}.reservations`);
  }

  detailReservationTooltip(contentId: number): Locator {
    return this.page.getByTestId(`kits.detail.table.row.${contentId}.reservations.tooltip`);
  }

  detailRowEditButton(contentId: number): Locator {
    return this.page.getByTestId(`kits.detail.table.row.${contentId}.edit`);
  }

  detailRowDeleteButton(contentId: number): Locator {
    return this.page.getByTestId(`kits.detail.table.row.${contentId}.delete`);
  }

  detailEditor(mode: 'create'): Locator;
  detailEditor(mode: 'edit', rowId: number): Locator;
  detailEditor(mode: 'create' | 'edit', rowId?: number): Locator {
    if (mode === 'create') {
      return this.detailCreateEditor;
    }
    const id = rowId ?? 'active';
    return this.page.getByTestId(`kits.detail.table.editor.edit.${id}`);
  }

  detailEditorQuantity(mode: 'create'): Locator;
  detailEditorQuantity(mode: 'edit', rowId: number): Locator;
  detailEditorQuantity(mode: 'create' | 'edit', rowId?: number): Locator {
    const suffix = mode === 'create' ? 'create' : `edit.${rowId ?? 'active'}`;
    return this.page.getByTestId(`kits.detail.table.editor.${suffix}.quantity`);
  }

  detailEditorNote(mode: 'create'): Locator;
  detailEditorNote(mode: 'edit', rowId: number): Locator;
  detailEditorNote(mode: 'create' | 'edit', rowId?: number): Locator {
    const suffix = mode === 'create' ? 'create' : `edit.${rowId ?? 'active'}`;
    return this.page.getByTestId(`kits.detail.table.editor.${suffix}.note`);
  }

  detailEditorSubmit(mode: 'create'): Locator;
  detailEditorSubmit(mode: 'edit', rowId: number): Locator;
  detailEditorSubmit(mode: 'create' | 'edit', rowId?: number): Locator {
    const suffix = mode === 'create' ? 'create' : `edit.${rowId ?? 'active'}`;
    return this.page.getByTestId(`kits.detail.table.editor.${suffix}.submit`);
  }

  detailEditorCancel(mode: 'create'): Locator;
  detailEditorCancel(mode: 'edit', rowId: number): Locator;
  detailEditorCancel(mode: 'create' | 'edit', rowId?: number): Locator {
    const suffix = mode === 'create' ? 'create' : `edit.${rowId ?? 'active'}`;
    return this.page.getByTestId(`kits.detail.table.editor.${suffix}.cancel`);
  }

  // --- Pick List Shortfall Handling ---

  /**
   * Returns the locator for a shortfall row in the pick list creation dialog.
   * @param partKey The part key identifying the shortfall row
   */
  detailCreatePickListShortfallRow(partKey: string): Locator {
    return this.page.getByTestId(`kits.detail.pick-list.create.shortfall.row.${partKey}`);
  }

  /**
   * Returns the locator for a shortfall action radio button.
   * @param partKey The part key identifying the shortfall row
   * @param action The action type ('limit' or 'omit')
   */
  detailCreatePickListShortfallRadio(partKey: string, action: 'limit' | 'omit'): Locator {
    return this.page.getByTestId(`kits.detail.pick-list.create.shortfall.row.${partKey}.${action}`);
  }
}
