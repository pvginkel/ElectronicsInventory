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

    // Verify cover is set by checking the cover endpoint
    await expect.poll(async () => {
      const cover = await testData.attachments.getCover(coveredPart.key);
      return cover.cover_attachment_id;
    }).toBe(coverAttachment.id);

    // Verify cover_url is populated for covered part
    await expect.poll(async () => {
      const detail = await testData.parts.getDetail(coveredPart.key);
      return detail.cover_url;
    }).toBeTruthy();

    // Verify cover_url is null for uncovered part
    const uncoveredDetail = await testData.parts.getDetail(uncoveredPart.key);
    expect(uncoveredDetail.cover_url).toBeNull();

    await parts.gotoList();
    await parts.waitForCards();

    await expect(parts.cardByKey(coveredPart.key)).toBeVisible();
    await expect(parts.cardByKey(uncoveredPart.key)).toBeVisible();

    // Cover image should display using CAS URL
    await expect(parts.coverImage(coveredPart.key)).toBeVisible();
    await expect(parts.coverPlaceholder(uncoveredPart.key)).toBeVisible();

    const currentCover = await testData.attachments.getCover(coveredPart.key);
    expect(currentCover.cover_attachment_id).toBe(coverAttachment.id);
    // Note: The new AttachmentSetCoverSchema only has cover_attachment_id and cover_url,
    // not the full attachment object. Use cover_url to verify the cover is set.
    expect(currentCover.cover_url).toBeTruthy();
  });
});
