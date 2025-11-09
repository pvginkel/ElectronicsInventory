import { test, expect } from '../../support/fixtures';
import { expectConsoleError } from '../../support/helpers';

function deterministicImageUrl(baseUrl: string, text: string): string {
  const url = new URL('/api/testing/content/image', baseUrl);
  url.hostname = '127.0.0.1';
  url.searchParams.set('text', text);
  return url.toString();
}

test.describe('Parts - Document management', () => {
test('adds, marks cover, and removes documents with the real backend', async ({
  page,
  parts,
  partsDocuments,
  toastHelper,
  testData,
  backendUrl,
}) => {
  test.setTimeout(90_000);

  await expectConsoleError(page, /ERR_INCOMPLETE_CHUNKED_ENCODING/);

  const { part } = await testData.parts.create({
      overrides: {
        description: 'Logic Analyzer Board',
      },
    });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openCardByKey(part.key);

    await expect(partsDocuments.gridRoot.locator('[data-document-tile]')).toHaveCount(0);

    await parts.detailAddDocumentButton.click();
    await partsDocuments.openModal();

    const documentUrl = deterministicImageUrl(backendUrl, 'Datasheet');

    await partsDocuments.createLinkDocument(documentUrl, 'Datasheet', { partKey: part.key });

    await toastHelper.waitForToastWithText(/document/i, { timeout: 10000 }).catch(() => undefined);
    await partsDocuments.waitForAttachmentCount(1);

    const tile = partsDocuments.documentTileByTitle('Datasheet');
    await expect(tile).toBeVisible();
    const attachmentIdAttr = await tile.getAttribute('data-document-id');
    expect(attachmentIdAttr).toBeTruthy();
    const attachmentId = Number(attachmentIdAttr);
    expect(Number.isNaN(attachmentId)).toBe(false);

    await partsDocuments.waitForPreviewImage(attachmentId);
    const previewImage = partsDocuments.previewImage(attachmentId);
    await expect(previewImage).toHaveAttribute('alt', /Datasheet/i);
    await expect(previewImage).toHaveAttribute(
      'src',
      new RegExp(`/api/parts/${part.key}/attachments/${attachmentId}/thumbnail`)
    );

    await expect.poll(async () => (await testData.attachments.list(part.key)).length).toBe(1);
    const attachment = await testData.attachments.get(part.key, attachmentId);
    expect(attachment.title).toContain('Datasheet');
    expect(attachment.url).toBe(documentUrl);

    await partsDocuments.setAsCover(attachmentId, { partKey: part.key });
    await partsDocuments.expectCoverState(attachmentId, true);
    await toastHelper.waitForToastWithText(/cover/i, { timeout: 10000 }).catch(() => undefined);

    await expect.poll(async () => {
      try {
        const cover = await testData.attachments.getCover(part.key);
        return cover.attachment_id;
      } catch {
        return null;
      }
    }).toBe(attachmentId);

    await expect.poll(async () => (await testData.parts.getDetail(part.key)).cover_attachment_id).toBe(attachmentId);

    // Capture URL before deletion to verify link doesn't open after confirming deletion
    const urlBefore = page.url();
    await partsDocuments.deleteDocument(attachmentId, { partKey: part.key });
    await toastHelper.waitForToastWithText(/delete|removed|remove/i, { timeout: 10000 }).catch(() => undefined);
    await partsDocuments.waitForAttachmentCount(0);
    // Verify that the link was NOT opened (URL should remain unchanged)
    expect(page.url()).toBe(urlBefore);

    await expect.poll(async () => (await testData.attachments.list(part.key)).length).toBe(0);
    await expect.poll(async () => {
      try {
        const cover = await testData.attachments.getCover(part.key);
        return cover.attachment_id;
      } catch {
        return null;
      }
    }).toBeNull();
    await expect.poll(async () => (await testData.parts.getDetail(part.key)).cover_attachment_id).toBeNull();
  });
});
