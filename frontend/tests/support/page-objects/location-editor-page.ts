import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base-page';

export class LocationEditorPage extends BasePage {
  readonly root: Locator;
  readonly emptyState: Locator;
  readonly addLocationButton: Locator;
  readonly addRow: Locator;
  readonly addRowBoxSelector: Locator;
  readonly addRowLocationInput: Locator;
  readonly addRowQuantityInput: Locator;
  readonly addRowSaveButton: Locator;
  readonly addRowCancelButton: Locator;

  // Adjust Stock Dialog
  readonly adjustStockDialog: Locator;
  readonly adjustStockInput: Locator;
  readonly adjustStockSubmit: Locator;
  readonly adjustStockCurrentQty: Locator;
  readonly adjustStockPreview: Locator;

  // Merge Dialog
  readonly mergeDialog: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId('parts.locations');
    this.emptyState = page.getByTestId('parts.locations.empty-state');
    this.addLocationButton = page.getByTestId('parts.locations.add-location');
    this.addRow = page.getByTestId('parts.locations.add-row');
    this.addRowBoxSelector = page.getByTestId('parts.locations.box-selector');
    this.addRowLocationInput = page.getByTestId('parts.locations.location-input');
    this.addRowQuantityInput = page.getByTestId('parts.locations.quantity-add');
    this.addRowSaveButton = page.getByTestId('parts.locations.add-save');
    this.addRowCancelButton = page.getByTestId('parts.locations.add-cancel');

    // Adjust Stock Dialog
    this.adjustStockDialog = page.getByTestId('parts.locations.adjust-stock-dialog');
    this.adjustStockInput = page.getByTestId('parts.locations.adjust-stock-dialog.input');
    this.adjustStockSubmit = page.getByTestId('parts.locations.adjust-stock-dialog.submit');
    this.adjustStockCurrentQty = page.getByTestId('parts.locations.adjust-stock-dialog.current');
    this.adjustStockPreview = page.getByTestId('parts.locations.adjust-stock-dialog.preview');

    // Merge Dialog
    this.mergeDialog = page.getByTestId('parts.locations.merge-dialog');
  }

  row(boxNo: number, locNo: number): Locator {
    return this.page.locator(
      `[data-testid="parts.locations.row"][data-box="${boxNo}"][data-location="${locNo}"]`
    );
  }

  async expectEmpty(): Promise<void> {
    await expect(this.emptyState).toBeVisible();
  }

  async openAddLocation(): Promise<void> {
    await this.addLocationButton.click();
    await expect(this.addRow).toBeVisible();
  }

  async fillAddLocation(options: { boxNo: number; locNo: number; quantity: number }): Promise<void> {
    await this.addRowBoxSelector.selectOption(String(options.boxNo));
    await this.addRowLocationInput.fill(String(options.locNo));
    await this.addRowQuantityInput.fill(String(options.quantity));
  }

  async waitForTotal(quantity: number | RegExp): Promise<void> {
    const total = this.root.getByTestId('parts.locations.total');
    await expect(total).toContainText(typeof quantity === 'number' ? String(quantity) : quantity);
  }

  async saveNewLocation(partKey?: string): Promise<void> {
    const pendingResponses: Array<Promise<unknown>> = [];

    if (partKey) {
      pendingResponses.push(
        this.page.waitForResponse(response => {
          const request = response.request();
          return ['POST'].includes(request.method())
            && response.url().includes(`/api/inventory/parts/${partKey}/stock`);
        })
      );
      pendingResponses.push(
        this.page.waitForResponse(response => {
          return response.request().method() === 'GET'
            && response.url().includes(`/api/parts/${partKey}/locations`);
        })
      );
    }

    await Promise.all([
      this.addRowSaveButton.click(),
      ...pendingResponses,
    ]);
  }

  /**
   * Edit a location's details using inline edit mode.
   * Clicks the pencil button to enter edit mode, modifies fields, and saves.
   */
  async editLocation(
    boxNo: number,
    locNo: number,
    updates: { newBoxNo?: number; newLocNo?: number; newQuantity?: number },
    partKey?: string
  ): Promise<void> {
    const row = this.row(boxNo, locNo);
    await expect(row).toBeVisible();

    // Click pencil button to enter edit mode
    await row.getByTestId('parts.locations.edit').click();

    // Wait for edit mode (edit save button becomes visible)
    // Use page-level locators since after clicking edit, the row transforms
    const editBoxSelector = this.page.getByTestId('parts.locations.edit-box-selector');
    const editLocationInput = this.page.getByTestId('parts.locations.edit-location-input');
    const editQuantityInput = this.page.getByTestId('parts.locations.edit-quantity-input');
    const editSaveButton = this.page.getByTestId('parts.locations.edit-save');

    await expect(editSaveButton).toBeVisible();

    // Update fields as needed
    if (updates.newBoxNo !== undefined) {
      await editBoxSelector.selectOption(String(updates.newBoxNo));
    }
    if (updates.newLocNo !== undefined) {
      await editLocationInput.fill(String(updates.newLocNo));
    }
    if (updates.newQuantity !== undefined) {
      await editQuantityInput.fill(String(updates.newQuantity));
    }

    const pendingResponses: Array<Promise<unknown>> = [];

    if (partKey) {
      pendingResponses.push(
        this.page.waitForResponse(response => {
          const method = response.request().method();
          return (method === 'POST' || method === 'DELETE')
            && response.url().includes(`/api/inventory/parts/${partKey}/stock`);
        })
      );
      pendingResponses.push(
        this.page.waitForResponse(response => {
          return response.request().method() === 'GET'
            && response.url().includes(`/api/parts/${partKey}/locations`);
        })
      );
    }

    await Promise.all([
      editSaveButton.click(),
      ...pendingResponses,
    ]);
  }

  /**
   * Edit only the quantity of a location using inline edit mode.
   * This is a convenience wrapper around editLocation.
   */
  async editQuantity(boxNo: number, locNo: number, newQuantity: number, partKey?: string): Promise<void> {
    await this.editLocation(boxNo, locNo, { newQuantity }, partKey);
    const row = this.row(boxNo, locNo);
    await expect(row.getByTestId('parts.locations.quantity')).toHaveText(String(newQuantity));
  }

  /**
   * Adjust stock using the Adjust Stock dialog.
   * Opens the dialog, enters a delta value (positive or negative), and submits.
   */
  async adjustStock(boxNo: number, locNo: number, delta: number, partKey?: string): Promise<void> {
    const row = this.row(boxNo, locNo);
    await expect(row).toBeVisible();

    // Click Adjust Stock button
    await row.getByTestId('parts.locations.adjust-stock').click();
    await expect(this.adjustStockDialog).toBeVisible();

    // Enter adjustment value (with sign for negative)
    const adjustment = delta >= 0 ? String(delta) : String(delta);
    await this.adjustStockInput.fill(adjustment);

    const pendingResponses: Array<Promise<unknown>> = [];

    if (partKey) {
      pendingResponses.push(
        this.page.waitForResponse(response => {
          const method = response.request().method();
          return (method === 'POST' || method === 'DELETE')
            && response.url().includes(`/api/inventory/parts/${partKey}/stock`);
        })
      );
      pendingResponses.push(
        this.page.waitForResponse(response => {
          return response.request().method() === 'GET'
            && response.url().includes(`/api/parts/${partKey}/locations`);
        })
      );
    }

    await Promise.all([
      this.adjustStockSubmit.click(),
      ...pendingResponses,
    ]);

    await expect(this.adjustStockDialog).toBeHidden();
  }

  /**
   * Increment stock by 1 using the Adjust Stock dialog.
   * @deprecated Prefer using adjustStock(boxNo, locNo, 1, partKey) directly
   */
  async increment(boxNo: number, locNo: number, partKey?: string): Promise<void> {
    const row = this.row(boxNo, locNo);
    const current = await row.getByTestId('parts.locations.quantity').textContent();
    const next = current ? String(Number(current.trim()) + 1) : undefined;

    await this.adjustStock(boxNo, locNo, 1, partKey);

    if (next) {
      await expect(row.getByTestId('parts.locations.quantity')).toHaveText(next);
    }
  }

  /**
   * Decrement stock by 1 using the Adjust Stock dialog.
   * @deprecated Prefer using adjustStock(boxNo, locNo, -1, partKey) directly
   */
  async decrement(boxNo: number, locNo: number, partKey?: string): Promise<void> {
    const row = this.row(boxNo, locNo);
    const current = await row.getByTestId('parts.locations.quantity').textContent();
    const next = current ? Math.max(Number(current.trim()) - 1, 0) : undefined;

    await this.adjustStock(boxNo, locNo, -1, partKey);

    if (next !== undefined) {
      await expect(row.getByTestId('parts.locations.quantity')).toHaveText(String(next));
    }
  }

  async remove(boxNo: number, locNo: number, partKey?: string): Promise<void> {
    const row = this.row(boxNo, locNo);
    const pendingResponses: Array<Promise<unknown>> = [];

    if (partKey) {
      pendingResponses.push(
        this.page.waitForResponse(response => {
          return response.request().method() === 'DELETE'
            && response.url().includes(`/api/inventory/parts/${partKey}/stock`);
        })
      );
      pendingResponses.push(
        this.page.waitForResponse(response => {
          return response.request().method() === 'GET'
            && response.url().includes(`/api/parts/${partKey}/locations`);
        })
      );
    }

    await Promise.all([
      row.getByTestId('parts.locations.remove').click(),
      ...pendingResponses,
    ]);
    await expect(row).toBeHidden();
  }

  /**
   * Get the undo button from toast for a removed location.
   */
  undoButton(boxNo: number, locNo: number): Locator {
    return this.page.getByTestId(`parts.locations.toast.undo.${boxNo}-${locNo}`);
  }

  /**
   * Undo a location removal by clicking the undo button in the toast.
   */
  async undoRemove(boxNo: number, locNo: number, partKey?: string): Promise<void> {
    const undoButton = this.undoButton(boxNo, locNo);
    await expect(undoButton).toBeVisible();

    const pendingResponses: Array<Promise<unknown>> = [];

    if (partKey) {
      pendingResponses.push(
        this.page.waitForResponse(response => {
          return response.request().method() === 'POST'
            && response.url().includes(`/api/inventory/parts/${partKey}/stock`);
        })
      );
      pendingResponses.push(
        this.page.waitForResponse(response => {
          return response.request().method() === 'GET'
            && response.url().includes(`/api/parts/${partKey}/locations`);
        })
      );
    }

    await Promise.all([
      undoButton.click(),
      ...pendingResponses,
    ]);

    // Wait for the row to reappear
    await expect(this.row(boxNo, locNo)).toBeVisible();
  }
}
