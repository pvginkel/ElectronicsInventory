import { test, expect } from '../../support/fixtures';

const COVER_TITLE = 'Mock Cover Image';
const PLACEHOLDER_TITLE = 'Sensor Without Cover';

test.describe('Cover presence with CAS URLs', () => {
  test('uses cover_url from part response instead of separate endpoint', async ({ parts, testData }) => {
    const { part: uncoveredPart } = await testData.parts.create({
      overrides: {
        description: PLACEHOLDER_TITLE,
      },
    });

    const { part: coveredPart } = await testData.parts.create({
      overrides: {
        description: 'Amplifier With Cover',
      },
    });

    const coverAttachment = await testData.attachments.createUrl(coveredPart.key, {
      title: COVER_TITLE,
      previewText: 'Cover',
    });

    await testData.attachments.setCover(coveredPart.key, coverAttachment.id);

    await expect.poll(async () => (await testData.parts.getDetail(coveredPart.key)).cover_attachment_id).toBe(coverAttachment.id);

    // Verify cover_url is populated for covered part
    await expect.poll(async () => {
      const detail = await testData.parts.getDetail(coveredPart.key);
      return detail.cover_url;
    }).toBeTruthy();

    // Verify cover_url is null for uncovered part
    const uncoveredDetail = await testData.parts.getDetail(uncoveredPart.key);
    expect(uncoveredDetail.cover_attachment_id).toBeNull();
    expect(uncoveredDetail.cover_url).toBeNull();

    await parts.gotoList();
    await parts.waitForCards();

    await expect(parts.cardByKey(coveredPart.key)).toBeVisible();
    await expect(parts.cardByKey(uncoveredPart.key)).toBeVisible();

    // Cover image should display using CAS URL
    await expect(parts.coverImage(coveredPart.key)).toBeVisible();
    await expect(parts.coverPlaceholder(uncoveredPart.key)).toBeVisible();

    const currentCover = await testData.attachments.getCover(coveredPart.key);
    expect(currentCover.attachment_id).toBe(coverAttachment.id);
    expect(currentCover.attachment?.title).toBe(COVER_TITLE);
  });
});
