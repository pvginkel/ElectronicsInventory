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

  coverToggleButton(attachmentId: number | string): Locator {
    return this.documentTileById(attachmentId).locator('button[title*="cover" i]').first();
  }

  previewImage(attachmentId: number | string): Locator {
    return this.documentTileById(attachmentId).locator('img');
  }

  async expectCoverState(attachmentId: number | string, isCover: boolean): Promise<void> {
    const button = this.coverToggleButton(attachmentId);
    await expect(button).toBeVisible();
    const expected = isCover ? /current cover/i : /set as cover/i;
    await expect(button).toHaveAttribute('title', expected);
  }

  async waitForPreviewImage(attachmentId: number | string): Promise<void> {
    const image = this.previewImage(attachmentId);
    await expect(image).toBeVisible();
    await expect.poll(async () => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }

  async waitForTile(attachmentId: number | string): Promise<void> {
    await expect(this.documentTileById(attachmentId)).toBeVisible();
  }

  async openModal(): Promise<void> {
    await expect(this.modal).toBeVisible();
  }

  async waitForAttachmentCount(expectedCount: number): Promise<void> {
    const tiles = this.gridRoot.locator('[data-document-tile]');
    await expect(tiles).toHaveCount(expectedCount, { timeout: 20000 });
  }

  async createLinkDocument(
    url: string,
    name: string,
    options?: { partKey?: string }
  ): Promise<void> {
    const pendingResponses: Array<Promise<unknown>> = [];

    if (options?.partKey) {
      // Wait for POST to attachment-sets endpoint (frontend uses this for uploads)
      pendingResponses.push(
        this.page.waitForResponse(response => {
          return response.request().method() === 'POST'
            && response.url().includes('/api/attachment-sets/')
            && response.url().includes('/attachments');
        })
      );
      // Wait for the subsequent GET from attachment-sets endpoint (refetch after upload)
      pendingResponses.push(
        this.page.waitForResponse(response => {
          const request = response.request();
          return request.method() === 'GET'
            && response.url().includes('/api/attachment-sets/')
            && response.url().includes('/attachments');
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
      // Wait for DELETE to attachment-sets endpoint (frontend uses this for delete)
      pendingResponses.push(
        this.page.waitForResponse(response => {
          const request = response.request();
          return request.method() === 'DELETE'
            && response.url().includes('/api/attachment-sets/')
            && response.url().endsWith(`/${attachmentId}`);
        })
      );
      // Wait for the subsequent GET to refetch attachments
      pendingResponses.push(
        this.page.waitForResponse(response => {
          const request = response.request();
          return request.method() === 'GET'
            && response.url().includes('/api/attachment-sets/')
            && response.url().includes('/attachments');
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
      // Wait for PUT to attachment-sets cover endpoint (frontend uses attachment-set cover endpoint)
      pendingResponses.push(
        this.page.waitForResponse(response => {
          return response.request().method() === 'PUT'
            && response.url().includes('/api/attachment-sets/')
            && response.url().includes('/cover');
        })
      );
      // Wait for the subsequent GET to refetch attachments
      pendingResponses.push(
        this.page.waitForResponse(response => {
          const request = response.request();
          return request.method() === 'GET'
            && response.url().includes('/api/attachment-sets/')
            && response.url().includes('/attachments');
        })
      );
    }

    await Promise.all([
      tile.getByTitle(/cover/i).click(),
      ...pendingResponses,
    ]);
  }
}
