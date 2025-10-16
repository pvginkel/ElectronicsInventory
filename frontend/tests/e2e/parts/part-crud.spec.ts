import { test, expect } from '../../support/fixtures';

test.describe('Parts - Create & Edit', () => {
  test('creates a new part and navigates to detail view', async ({ parts, testData }) => {
    const typeName = testData.types.randomTypeName('Voltage Regulator');
    const type = await testData.types.create({ name: typeName });

    await parts.gotoList();
    await parts.openNewPartForm();

    await parts.formDescription.fill('LM7805 Voltage Regulator');
    await parts.formManufacturerCode.fill('LM7805');
    await parts.selectType(type.name);

    await parts.submitForm();

    await expect(parts.detailRoot).toBeVisible();
    await parts.expectDetailHeading('LM7805 Voltage Regulator');
    await expect(parts.detailRoot).toContainText('LM7805');
  });

  test('edits an existing part and persists changes', async ({ parts, testData }) => {
    const typeName = testData.types.randomTypeName('Microcontroller');
    const type = await testData.types.create({ name: typeName });
    const { part } = await testData.parts.create({
      overrides: {
        description: 'ESP32 Dev Board',
        manufacturer_code: 'ESP32-DEV',
        type_id: type.id,
      },
    });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openCardByKey(part.key);

    await parts.editPartButton.click();
    await expect(parts.formRoot).toBeVisible();

    await parts.formDescription.fill('ESP32 Dev Board v2');
    await parts.formManufacturerCode.fill('ESP32-DEV-02');

    await parts.submitForm();
    await expect(parts.detailRoot).toBeVisible();
    await parts.expectDetailHeading('ESP32 Dev Board v2');
    await expect(parts.detailRoot).toContainText('ESP32-DEV-02');
  });

  test('edit form keeps header and footer fixed while fields scroll', async ({ parts, testData }) => {
    const { part } = await testData.parts.create({
      overrides: {
        description: 'Scrolling Edit Part',
        manufacturer_code: 'SCROLL-01',
      },
    });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openCardByKey(part.key);

    await parts.editPartButton.click();
    await expect(parts.detailEditLayout).toBeVisible();

    const headerBefore = await parts.getDetailEditHeaderRect();
    const footerBefore = await parts.getDetailEditFooterRect();

    await parts.scrollDetailEditContent('bottom');
    await expect.poll(() => parts.detailEditContentScrollTop()).toBeGreaterThan(0);

    const headerAfter = await parts.getDetailEditHeaderRect();
    const footerAfter = await parts.getDetailEditFooterRect();

    expect(Math.abs(headerAfter.top - headerBefore.top)).toBeLessThan(1);
    expect(Math.abs(footerAfter.bottom - footerBefore.bottom)).toBeLessThan(1);
  });
});
