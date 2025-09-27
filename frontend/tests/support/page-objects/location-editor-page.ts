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

  async editQuantity(boxNo: number, locNo: number, newQuantity: number, partKey?: string): Promise<void> {
    const row = this.row(boxNo, locNo);
    await expect(row).toBeVisible();
    const quantityButton = row.getByTestId('parts.locations.quantity');
    const targetText = String(newQuantity);
    await quantityButton.click();
    const quantityInput = row.getByTestId('parts.locations.quantity-input');
    await quantityInput.fill(String(newQuantity));
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
      row.getByRole('button', { name: 'Save' }).click(),
      ...pendingResponses,
    ]);
    await expect(row.getByTestId('parts.locations.quantity')).toHaveText(targetText);
  }

  async increment(boxNo: number, locNo: number, partKey?: string): Promise<void> {
    const row = this.row(boxNo, locNo);
    const current = await row.getByTestId('parts.locations.quantity').textContent();
    const next = current ? String(Number(current.trim()) + 1) : undefined;
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
      row.getByRole('button', { name: 'Increase quantity' }).click(),
      ...pendingResponses,
    ]);
    if (next) {
      await expect(row.getByTestId('parts.locations.quantity')).toHaveText(next);
    }
  }

  async decrement(boxNo: number, locNo: number, partKey?: string): Promise<void> {
    const row = this.row(boxNo, locNo);
    const current = await row.getByTestId('parts.locations.quantity').textContent();
    const next = current ? Math.max(Number(current.trim()) - 1, 0) : undefined;
    const pendingResponses: Array<Promise<unknown>> = [];

    if (partKey) {
      pendingResponses.push(
        this.page.waitForResponse(response => {
          const method = response.request().method();
          return (method === 'DELETE' || method === 'POST')
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
      row.getByRole('button', { name: 'Decrease quantity' }).click(),
      ...pendingResponses,
    ]);
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
}
