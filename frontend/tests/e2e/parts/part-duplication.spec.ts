import { test, expect } from '../../support/fixtures';

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

    await testData.attachments.createBinary(part.key, {
      title: 'Datasheet',
      filename: 'datasheet.pdf',
    });
    await testData.attachments.createBinary(part.key, {
      title: 'Application Note',
      filename: 'application-note.pdf',
    });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openCardByKey(part.key);

    await parts.waitForDetailReady();
    await expect(parts.detailDocumentsCard).toContainText('Documents');

    await parts.duplicateCurrentPart();
    await expect(parts.formLayout).toBeVisible();

    await parts.submitForm();

    await parts.waitForDetailReady();
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
