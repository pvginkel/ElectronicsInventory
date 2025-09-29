import { test, expect } from '../../support/fixtures';
import { getBackendUrl } from '../../support/backend-url';

const backendUrl = getBackendUrl();

async function createAttachment(partKey: string, title: string) {
  const formData = new FormData();
  const filename = `${title.toLowerCase().replace(/\s+/g, '-')}.pdf`;
  const pdfBytes = Buffer.from(
    'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlIC9DYXRhbG9nL1BhZ2VzIDIgMCBSID4+CmVuZG9iagoyIDAgb2JqCjw8L1R5cGUgL1BhZ2VzL0tpZHMgWyAzIDAgUiBdL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwvVHlwZSAvUGFnZS9NZWRpYUJveCBbMCAwIDYxMiA3OTJdL1BhcmVudCAyIDAgUiA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNzAgMDAwMDAgbiAKMDAwMDAwMDEyNiAwMDAwMCBuIAp0cmFpbGVyCjw8L1Jvb3QgMSAwIFIvSW5mbyA0IDAgUi9TaXplIDQgPj4Kc3RhcnR4cmVmCjE4NQolJUVPRgo=',
    'base64'
  );
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });

  formData.set('title', title);
  formData.set('file', blob, filename);

  const response = await fetch(`${backendUrl}/api/parts/${encodeURIComponent(partKey)}/attachments`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to create attachment: ${response.status}`);
  }

  return response.json();
}

test.describe('Parts - Duplication', () => {
  test('duplicates part along with attachments', async ({ parts, partsDocuments, testData, apiClient }) => {
    const typeName = testData.types.randomTypeName('Sensors');
    const type = await testData.types.create({ name: typeName });
    const { part } = await testData.parts.create({
      overrides: {
        description: 'Temperature Sensor Module',
        manufacturer_code: 'TMP-001',
        type_id: type.id,
      },
    });

    await createAttachment(part.key, 'Datasheet');
    await createAttachment(part.key, 'Application Note');

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
    await partsDocuments.waitForAttachmentCount(2);
  });
});
