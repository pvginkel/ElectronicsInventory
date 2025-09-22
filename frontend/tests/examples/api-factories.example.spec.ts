import { test, expect } from '../support/fixtures';

/**
 * Example test demonstrating how to use API factories for test data setup.
 * This shows the patterns that Phase 4 tests should follow for creating
 * prerequisite data before touching the UI.
 */

test.describe('API Factories Example', () => {
  test('should create a type via API and then edit it in the UI', async ({
    page,
    testData,
    frontendUrl
  }) => {
    // Create a type via API before touching the UI
    const existingType = await testData.types.create({
      name: testData.types.randomTypeName('Capacitor'),
    });

    // Now navigate to the Types page to edit the existing type
    await page.goto(`${frontendUrl}/types`);

    // Find and edit the type we created via API
    await page.getByText(existingType.name).click();

    // This is where the edit flow would continue...
    // The important point is that the type was created via API,
    // not through clicking through the UI
  });

  test('should create a part with a type and verify it exists', async ({
    page,
    testData,
    frontendUrl
  }) => {
    // Create a type first
    const type = await testData.types.create();

    // Create a part associated with that type with unique description
    const { part } = await testData.parts.create({
      typeId: type.id,
      overrides: {
        description: testData.parts.randomPartDescription('High-precision resistor'),
        manufacturer_code: testData.parts.randomManufacturerCode(),
      },
    });

    // Navigate to Parts page
    await page.goto(`${frontendUrl}/parts`);

    // Verify the part exists in the UI (created via API)
    await expect(page.getByText(part.description)).toBeVisible();
    if (part.manufacturer_code) {
      await expect(page.getByText(part.manufacturer_code)).toBeVisible();
    }
  });

  test('should create multiple parts for delete flow testing', async ({
    page,
    testData,
    frontendUrl
  }) => {
    // Create several parts via API for a bulk delete scenario
    const partsToDelete = await Promise.all([
      testData.parts.create(),
      testData.parts.create(),
      testData.parts.create(),
    ]);

    // Navigate to Parts page
    await page.goto(`${frontendUrl}/parts`);

    // Now you have 3 parts ready for testing delete operations
    // without having to click through the create flow 3 times
    for (const { part } of partsToDelete) {
      await expect(page.getByText(part.description)).toBeVisible();
    }

    // Delete flow would continue here...
  });

  test('should demonstrate using random helpers directly', async ({ testData }) => {
    // You can use the random helpers for consistent naming patterns
    const typeName = testData.types.randomTypeName('Microcontroller');
    const partDesc = testData.parts.randomPartDescription('Arduino');
    const mfgCode = testData.parts.randomManufacturerCode();

    // Create entities with these names
    const type = await testData.types.create({ name: typeName });
    const { part } = await testData.parts.create({
      typeId: type.id,
      overrides: {
        description: partDesc,
        manufacturer_code: mfgCode,
      },
    });

    // Verify the random names follow expected patterns
    expect(type.name).toContain('Microcontroller');
    expect(part.description).toContain('Arduino');
    expect(part.manufacturer_code).toMatch(/^(TEST|DEMO|SAMPLE)-\d{4}$/);
  });
});