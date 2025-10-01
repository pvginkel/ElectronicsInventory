import { test, expect } from '../../support/fixtures';

const COVER_TITLE = 'Mock Cover Image';
const PLACEHOLDER_TITLE = 'Sensor Without Cover';

test.describe('Cover presence flag', () => {
  test('skips cover fetch when flag is false and loads when true', async ({ page, parts, testData }) => {
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
    await expect.poll(async () => {
      const list = await testData.parts.listWithLocations();
      return list.find(item => item.key === coveredPart.key)?.has_cover_attachment ?? false;
    }).toBe(true);

    const uncoveredDetail = await testData.parts.getDetail(uncoveredPart.key);
    expect(uncoveredDetail.cover_attachment_id).toBeNull();

    const coverRequests: Record<string, number> = {};
    page.on('response', response => {
      if (response.request().method() !== 'GET') {
        return;
      }

      const match = response.url().match(/\/api\/parts\/([^/]+)\/cover$/);
      if (match) {
        const partKey = match[1];
        coverRequests[partKey] = (coverRequests[partKey] ?? 0) + 1;
      }
    });

    await parts.gotoList();
    await parts.waitForCards();

    await expect(parts.cardByKey(coveredPart.key)).toBeVisible();
    await expect(parts.cardByKey(uncoveredPart.key)).toBeVisible();

    await expect(parts.coverImage(coveredPart.key)).toHaveAttribute('alt', COVER_TITLE);
    await expect(parts.coverPlaceholder(uncoveredPart.key)).toBeVisible();

    await expect.poll(() => coverRequests[coveredPart.key] ?? 0).toBeGreaterThan(0);
    expect(coverRequests[uncoveredPart.key]).toBeUndefined();

    const currentCover = await testData.attachments.getCover(coveredPart.key);
    expect(currentCover.attachment_id).toBe(coverAttachment.id);
    expect(currentCover.attachment?.title).toBe(COVER_TITLE);
  });
});
