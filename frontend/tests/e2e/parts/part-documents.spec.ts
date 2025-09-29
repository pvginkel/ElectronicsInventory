import { test, expect } from '../../support/fixtures';
import type { components } from '../../../src/lib/api/generated/types';
import { getBackendUrl } from '../../support/backend-url';

const backendUrl = getBackendUrl();
const fakeAssetUrl = `${backendUrl}/api/testing/fake-image?text=datasheet`;

type AttachmentResponse = components['schemas']['PartAttachmentResponseSchema.f950e1b'];

test.describe('Parts - Document management', () => {
  test('adds, marks cover, and removes documents', async ({ page, parts, partsDocuments, toastHelper, testData }) => {
    const { part } = await testData.parts.create({
      overrides: {
        description: 'Logic Analyzer Board',
      },
    });

    let attachments: AttachmentResponse[] = [];
    let coverAttachmentId: number | null = null;
    const attachmentsRoute = `**/api/parts/${part.key}/attachments`;
    const attachmentItemRoute = `**/api/parts/${part.key}/attachments/*`;
    const coverRoute = `**/api/parts/${part.key}/cover`;
    const attachmentThumbnailRoute = `**/api/parts/${part.key}/attachments/*/thumbnail*`;
    const attachmentPreviewRoute = '**/api/parts/attachment-preview';
    const attachmentPreviewImageRoute = '**/api/parts/attachment-preview/image**';
    const routesToCleanup = [
      attachmentsRoute,
      attachmentItemRoute,
      coverRoute,
      attachmentThumbnailRoute,
      attachmentPreviewRoute,
      attachmentPreviewImageRoute,
    ];
    const placeholderImage = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAnMB9oOZ0gAAAABJRU5ErkJggg==',
      'base64'
    );

    const buildAttachment = (title: string, url: string): AttachmentResponse => {
      const timestamp = new Date().toISOString();
      const nextId = attachments.length > 0 ? attachments[attachments.length - 1]?.id + 1 : 1000;
      const fallbackPartId = Number.parseInt(part.key, 36);
      return {
        id: nextId,
        part_id: Number.isNaN(fallbackPartId) ? nextId : fallbackPartId,
        title,
        url,
        filename: 'test-attachment.png',
        content_type: 'image/png',
        attachment_type: 'url',
        has_preview: true,
        file_size: 2048,
        s3_key: `parts/${part.key}/attachments/${nextId}.png`,
        created_at: timestamp,
        updated_at: timestamp,
      };
    };

    await page.route(attachmentsRoute, async route => {
      const request = route.request();
      if (request.method() === 'POST') {
        const payload = await request.postDataJSON();
        const attachment = buildAttachment(payload.title ?? 'Document', payload.url ?? fakeAssetUrl);
        attachments = [...attachments, attachment];
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(attachment),
        });
        return;
      }

      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(attachments),
        });
        return;
      }

      await route.continue();
    });

    await page.route(attachmentItemRoute, async route => {
      const request = route.request();
      const url = new URL(request.url());
      const id = Number(url.pathname.split('/').pop());

      if (Number.isInteger(id) && request.method() === 'DELETE') {
        attachments = attachments.filter(attachment => attachment.id !== id);
        if (coverAttachmentId === id) {
          coverAttachmentId = null;
        }
        await route.fulfill({ status: 204, body: '' });
        return;
      }

      if (Number.isInteger(id) && request.method() === 'GET') {
        const match = attachments.find(attachment => attachment.id === id);
        await route.fulfill({
          status: match ? 200 : 404,
          headers: { 'content-type': 'application/json' },
          body: match ? JSON.stringify(match) : JSON.stringify({ message: 'Not found' }),
        });
        return;
      }

      await route.continue();
    });

    await page.route(coverRoute, async route => {
      const request = route.request();
      if (request.method() === 'PUT') {
        const payload = await request.postDataJSON();
        coverAttachmentId = payload.attachment_id ?? null;
        const coverAttachment = attachments.find(attachment => attachment.id === coverAttachmentId) ?? null;
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            attachment_id: coverAttachment?.id ?? null,
            attachment: coverAttachment,
          }),
        });
        return;
      }

      if (request.method() === 'GET') {
        const coverAttachment = attachments.find(attachment => attachment.id === coverAttachmentId) ?? null;
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            attachment_id: coverAttachment?.id ?? null,
            attachment: coverAttachment,
          }),
        });
        return;
      }

      if (request.method() === 'DELETE') {
        coverAttachmentId = null;
        await route.fulfill({ status: 204, body: '' });
        return;
      }

      await route.continue();
    });

    await page.route(attachmentThumbnailRoute, async route => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'image/png' },
          body: placeholderImage,
        });
        return;
      }

      await route.continue();
    });

    await page.route(attachmentPreviewRoute, async route => {
      const request = route.request();
      if (request.method() === 'POST') {
        const payload = await request.postDataJSON();
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            content_type: 'image/png',
            image_url: '/api/testing/fake-image?text=preview',
            original_url: payload.url ?? fakeAssetUrl,
            title: payload.title ?? 'Datasheet Preview',
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.route(attachmentPreviewImageRoute, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'image/png' },
          body: placeholderImage,
        });
        return;
      }

      await route.continue();
    });

    try {
      await parts.gotoList();
      await parts.waitForCards();
      await parts.openCardByKey(part.key);

      await expect(partsDocuments.gridRoot.locator('[data-document-tile]')).toHaveCount(0);

      await parts.detailAddDocumentButton.click();
      await partsDocuments.openModal();
      await partsDocuments.createLinkDocument(fakeAssetUrl, 'Datasheet', { partKey: part.key });

      await toastHelper.waitForToastWithText(/document/i, { timeout: 10000 }).catch(() => undefined);
      await partsDocuments.waitForAttachmentCount(1);

      const tile = partsDocuments.documentTileByTitle('Datasheet');
      const attachmentIdAttr = await tile.getAttribute('data-document-id');
      expect(attachmentIdAttr).toBeTruthy();
      const attachmentId = Number(attachmentIdAttr);

      await partsDocuments.setAsCover(attachmentId, { partKey: part.key });
      await expect.poll(() => coverAttachmentId).toBe(attachmentId);

      await partsDocuments.deleteDocument(attachmentId, { partKey: part.key });
      await partsDocuments.waitForAttachmentCount(0);
    } finally {
      for (const pattern of routesToCleanup) {
        try {
          await page.unroute(pattern);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  });
});
