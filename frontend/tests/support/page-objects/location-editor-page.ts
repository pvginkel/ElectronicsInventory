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

  async saveNewLocation(): Promise<void> {
    await this.addRowSaveButton.click();
  }

  async editQuantity(boxNo: number, locNo: number, newQuantity: number): Promise<void> {
    const row = this.row(boxNo, locNo);
    await expect(row).toBeVisible();
    const quantityButton = row.getByTestId('parts.locations.quantity');
    const targetText = String(newQuantity);
    await quantityButton.click();
    const quantityInput = row.getByTestId('parts.locations.quantity-input');
    await quantityInput.fill(String(newQuantity));
    await row.getByRole('button', { name: 'Save' }).click();
    await expect(row.getByTestId('parts.locations.quantity')).toHaveText(targetText);
  }

  async increment(boxNo: number, locNo: number): Promise<void> {
    const row = this.row(boxNo, locNo);
    const current = await row.getByTestId('parts.locations.quantity').textContent();
    const next = current ? String(Number(current.trim()) + 1) : undefined;
    await row.getByRole('button', { name: 'Increase quantity' }).click();
    if (next) {
      await expect(row.getByTestId('parts.locations.quantity')).toHaveText(next);
    }
  }

  async decrement(boxNo: number, locNo: number): Promise<void> {
    const row = this.row(boxNo, locNo);
    const current = await row.getByTestId('parts.locations.quantity').textContent();
    const next = current ? Math.max(Number(current.trim()) - 1, 0) : undefined;
    await row.getByRole('button', { name: 'Decrease quantity' }).click();
    if (next !== undefined) {
      await expect(row.getByTestId('parts.locations.quantity')).toHaveText(String(next));
    }
  }

  async remove(boxNo: number, locNo: number): Promise<void> {
    const row = this.row(boxNo, locNo);
    await row.getByTestId('parts.locations.remove').click();
    await expect(row).toBeHidden();
  }
}
