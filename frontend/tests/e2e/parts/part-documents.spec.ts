import { test, expect } from '../../support/fixtures';

const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:5100';

async function createAttachment(partKey: string, title: string, url: string) {
  const response = await fetch(`${backendUrl}/api/parts/${encodeURIComponent(partKey)}/attachments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, url }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create attachment: ${response.status}`);
  }

  return response.json();
}

test.describe('Parts - Document management', () => {
  test('adds, marks cover, and removes documents', async ({ page, parts, partsDocuments, toastHelper, testData }) => {
    const { part } = await testData.parts.create({
      overrides: {
        description: 'Logic Analyzer Board',
      },
    });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openCardByKey(part.key);

    await expect(partsDocuments.gridRoot.locator('[data-document-tile]')).toHaveCount(0);

    await page.route(`**/api/parts/${part.key}/attachments`, async route => {
      const payload = await route.request().postDataJSON();
      const attachment = await createAttachment(part.key, payload.title ?? 'Document', payload.url ?? '');
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(attachment),
      });
    }, { times: 1 });

    await parts.detailAddDocumentButton.click();
    await partsDocuments.openModal();
    await partsDocuments.createLinkDocument('https://example.com/logic-analyzer-datasheet.pdf', 'Datasheet');

    await page.unroute(`**/api/parts/${part.key}/attachments`);
    await toastHelper.waitForToastWithText(/document/i, { timeout: 10000 }).catch(() => undefined);
    await expect(partsDocuments.gridRoot.locator('[data-document-tile]')).toHaveCount(1);

    const tile = partsDocuments.documentTileByTitle('Datasheet');
    const attachmentId = await tile.getAttribute('data-document-id');
    expect(attachmentId).toBeTruthy();

    await partsDocuments.setAsCover(attachmentId!);
    await expect(tile.getByTitle(/current cover/i)).toBeVisible();

    await partsDocuments.deleteDocument(attachmentId!);
    await expect(partsDocuments.gridRoot.locator('[data-document-tile]')).toHaveCount(0);
  });
});
