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

test.describe('Parts - Duplication', () => {
  test('duplicates part along with attachments', async ({ parts, partsDocuments, testData, apiClient }) => {
    const type = await testData.types.create({ name: 'Sensors' });
    const { part } = await testData.parts.create({
      overrides: {
        description: 'Temperature Sensor Module',
        manufacturer_code: 'TMP-001',
        type_id: type.id,
      },
    });

    await createAttachment(part.key, 'Datasheet', 'https://example.com/datasheet.pdf');
    await createAttachment(part.key, 'Application Note', 'https://example.com/app-note.pdf');

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openCardByKey(part.key);

    await expect(parts.detailRoot).toBeVisible();
    await expect(parts.detailDocumentsCard).toContainText('Documents');

    await parts.duplicateCurrentPart();
    await expect(parts.formRoot).toBeVisible();

    await parts.submitForm();

    await expect(parts.detailRoot).toBeVisible();
    await parts.expectDetailHeading('Temperature Sensor Module');

    const currentUrl = await parts.getUrl();
    const newUrl = new URL(currentUrl);
    const newKey = newUrl.pathname.split('/').pop();
    expect(newKey).toBeTruthy();
    expect(newKey).not.toBe(part.key);

    const { data } = await apiClient.GET('/api/parts/{part_key}/attachments', {
      params: { path: { part_key: newKey! } },
    });

    expect(data).toBeTruthy();
    expect(data).toHaveLength(2);
    const titles = data!.map(doc => doc.title).sort();
    expect(titles).toEqual(['Application Note', 'Datasheet']);

    await expect(partsDocuments.gridRoot).toBeVisible();
    await expect(partsDocuments.gridRoot.locator('[data-document-tile]')).toHaveCount(2);
  });
});
