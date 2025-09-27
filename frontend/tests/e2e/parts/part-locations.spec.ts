import { test, expect } from '../../support/fixtures';

test.describe('Parts - Location Management', () => {
  test('adds, updates, and removes stock locations', async ({ parts, partsLocations, testData }) => {
    const box = await testData.boxes.create({ overrides: { description: 'Primary Storage' } });
    const { part } = await testData.parts.create({
      overrides: {
        description: 'Logic Level Converter',
      },
    });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openCardByKey(part.key);

    await partsLocations.expectEmpty();

    await parts.detailRoot.getByRole('button', { name: /add stock/i }).click();
    await expect(partsLocations.addRow).toBeVisible();
    await partsLocations.fillAddLocation({ boxNo: box.box_no, locNo: 12, quantity: 5 });
    await partsLocations.saveNewLocation(part.key);

    await expect(partsLocations.root).toBeVisible();
    await partsLocations.waitForTotal(5);
    await expect(partsLocations.row(box.box_no, 12)).toBeVisible();

    await partsLocations.editQuantity(box.box_no, 12, 8, part.key);
    await partsLocations.waitForTotal(8);

    await partsLocations.increment(box.box_no, 12, part.key);
    await partsLocations.waitForTotal(9);

    await partsLocations.decrement(box.box_no, 12, part.key);
    await partsLocations.waitForTotal(8);

    await partsLocations.remove(box.box_no, 12, part.key);
    await partsLocations.expectEmpty();
  });
});
