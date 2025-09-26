import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base-page';

export class DocumentGridPage extends BasePage {
  readonly gridRoot: Locator;
  readonly modal: Locator;
  readonly modalUrl: Locator;
  readonly modalName: Locator;
  readonly modalSubmit: Locator;
  readonly modalCancel: Locator;

  constructor(page: Page) {
    super(page);
    this.gridRoot = page.getByTestId('parts.documents.grid');
    this.modal = page.getByTestId('parts.documents.modal');
    this.modalUrl = page.getByTestId('parts.documents.modal.url');
    this.modalName = page.getByTestId('parts.documents.modal.name');
    this.modalSubmit = page.getByTestId('parts.documents.modal.submit');
    this.modalCancel = page.getByTestId('parts.documents.modal.cancel');
  }

  documentTileById(attachmentId: number | string): Locator {
    return this.page.locator(`[data-document-tile][data-document-id="${attachmentId}"]`);
  }

  documentTileByTitle(title: string): Locator {
    return this.page.locator('[data-document-tile]').filter({ hasText: title });
  }

  async waitForTile(attachmentId: number | string): Promise<void> {
    await expect(this.documentTileById(attachmentId)).toBeVisible();
  }

  async openModal(): Promise<void> {
    await expect(this.modal).toBeVisible();
  }

  async createLinkDocument(url: string, name: string): Promise<void> {
    await this.modalUrl.fill(url);
    await this.modalName.fill(name);
    await this.modalSubmit.click();
    await expect(this.modal).toBeHidden();
  }

  async deleteDocument(attachmentId: number | string): Promise<void> {
    const tile = this.documentTileById(attachmentId);
    await expect(tile).toBeVisible();
    await tile.getByTitle('Delete').click();
    const dialog = this.page.getByRole('dialog', { name: /delete document/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(tile).toBeHidden();
  }

  async setAsCover(attachmentId: number | string): Promise<void> {
    const tile = this.documentTileById(attachmentId);
    await expect(tile).toBeVisible();
    await tile.getByTitle(/cover/i).click();
  }
}
