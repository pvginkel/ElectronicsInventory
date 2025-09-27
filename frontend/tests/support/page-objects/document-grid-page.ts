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

  async waitForAttachmentCount(expectedCount: number): Promise<void> {
    const tiles = this.gridRoot.locator('[data-document-tile]');
    await expect(tiles).toHaveCount(expectedCount);
  }

  async createLinkDocument(
    url: string,
    name: string,
    options?: { partKey?: string }
  ): Promise<void> {
    const pendingResponses: Array<Promise<unknown>> = [];

    if (options?.partKey) {
      pendingResponses.push(
        this.page.waitForResponse(response => {
          return response.request().method() === 'POST'
            && response.url().includes(`/api/parts/${options.partKey}/attachments`);
        })
      );
    }

    await this.modalUrl.fill(url);
    await this.modalName.fill(name);

    await Promise.all([
      this.modalSubmit.click(),
      ...pendingResponses,
    ]);

    await expect(this.modal).toBeHidden();
  }

  async deleteDocument(
    attachmentId: number | string,
    options?: { partKey?: string }
  ): Promise<void> {
    const tile = this.documentTileById(attachmentId);
    await expect(tile).toBeVisible();
    const pendingResponses: Array<Promise<unknown>> = [];

    if (options?.partKey) {
      pendingResponses.push(
        this.page.waitForResponse(response => {
          const request = response.request();
          return request.method() === 'DELETE'
            && response.url().includes(`/api/parts/${options.partKey}/attachments/`)
            && response.url().endsWith(`/${attachmentId}`);
        })
      );
      pendingResponses.push(
        this.page.waitForResponse(response => {
          const request = response.request();
          return request.method() === 'GET'
            && response.url().includes(`/api/parts/${options.partKey}/attachments`);
        })
      );
    }

    await tile.getByTitle('Delete').click();
    const dialog = this.page.getByRole('dialog', { name: /delete document/i });
    await expect(dialog).toBeVisible();
    await Promise.all([
      dialog.getByRole('button', { name: 'Delete' }).click(),
      ...pendingResponses,
    ]);
    await expect(tile).toBeHidden();
  }

  async setAsCover(
    attachmentId: number | string,
    options?: { partKey?: string }
  ): Promise<void> {
    const tile = this.documentTileById(attachmentId);
    await expect(tile).toBeVisible();
    const pendingResponses: Array<Promise<unknown>> = [];

    if (options?.partKey) {
      pendingResponses.push(
        this.page.waitForResponse(response => {
          return response.request().method() === 'PUT'
            && response.url().includes(`/api/parts/${options.partKey}/cover`);
        })
      );
      pendingResponses.push(
        this.page.waitForResponse(response => {
          const request = response.request();
          return request.method() === 'GET'
            && response.url().includes(`/api/parts/${options.partKey}/attachments`);
        })
      );
    }

    await Promise.all([
      tile.getByTitle(/cover/i).click(),
      ...pendingResponses,
    ]);
  }
}
