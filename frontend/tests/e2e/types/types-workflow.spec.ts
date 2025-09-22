import { test, expect } from '../../support/fixtures';

test.describe('Types - Complete Workflow', () => {
  test.skip('complete E2E workflow: create, edit, and delete attempt', async ({ testData, types }) => {
    await types.goto();

    // Step 1: Create a new type
    const initialName = testData.types.randomTypeName();
    await types.createType(initialName);

    // Verify type appears in the list
    await expect(types.cardByName(initialName)).toBeVisible();

    // Step 2: Edit the type
    const updatedName = testData.types.randomTypeName();
    await types.editType(initialName, updatedName);

    // Verify old name is gone and new name is present
    await expect(types.cardByName(initialName)).toHaveCount(0);
    await expect(types.cardByName(updatedName)).toBeVisible();

    // Step 3: Create a part using this type (for blocked delete test)
    const type = await testData.types.findByName(updatedName);
    await testData.parts.create({ typeId: type.id });

    // Step 4: Attempt to delete (should be blocked)
    await types.deleteButtonForCard(updatedName).click();

    // Confirm dialog appears
    const confirmDialog = types.page.getByRole('dialog', { name: /delete type/i });
    await expect(confirmDialog).toBeVisible();

    // Attempt deletion
    await confirmDialog.getByRole('button', { name: 'Delete' }).click();
    await expect(confirmDialog).toBeHidden();

    // Verify deletion was blocked
    await expect(types.toast(/cannot delete|in use/i)).toBeVisible();
    await expect(types.cardByName(updatedName)).toBeVisible();
  });

  test('workflow with multiple types', async ({ testData, types }) => {
    await types.goto();

    // Create multiple types
    const type1Name = testData.types.randomTypeName();
    const type2Name = testData.types.randomTypeName();
    const type3Name = testData.types.randomTypeName();

    // Create first type
    await types.createType(type1Name);
    await expect(types.cardByName(type1Name)).toBeVisible();

    // Create second type
    await types.createType(type2Name);
    await expect(types.cardByName(type2Name)).toBeVisible();

    // Create third type
    await types.createType(type3Name);
    await expect(types.cardByName(type3Name)).toBeVisible();

    // Verify all types are visible
    const cardCount = await types.cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(3);

    // Search for the second type
    await types.search(type2Name);
    await expect(types.cardByName(type1Name)).toHaveCount(0);
    await expect(types.cardByName(type2Name)).toBeVisible();
    await expect(types.cardByName(type3Name)).toHaveCount(0);

    // Clear search
    await types.searchInput.clear();

    // Edit the first type
    const newType1Name = testData.types.randomTypeName();
    await types.editType(type1Name, newType1Name);
    await expect(types.cardByName(type1Name)).toHaveCount(0);
    await expect(types.cardByName(newType1Name)).toBeVisible();

    // Delete the second type
    await types.deleteType(type2Name);
    await expect(types.cardByName(type2Name)).toHaveCount(0);

    // Final verification
    await expect(types.cardByName(newType1Name)).toBeVisible();
    await expect(types.cardByName(type3Name)).toBeVisible();
  });

  test('create and immediately edit type', async ({ testData, types }) => {
    await types.goto();

    // Create a type
    const originalName = testData.types.randomTypeName();
    await types.createType(originalName);

    // Immediately edit it
    const newName = testData.types.randomTypeName();
    await types.editType(originalName, newName);

    // Verify the change
    await expect(types.cardByName(originalName)).toHaveCount(0);
    await expect(types.cardByName(newName)).toBeVisible();
  });

  test('bulk operations with search filtering', async ({ testData, types }) => {
    // Create types with specific naming patterns
    const resistorType = `Resistor ${testData.types.randomTypeName()}`;
    const capacitorType = `Capacitor ${testData.types.randomTypeName()}`;
    const inductorType = `Inductor ${testData.types.randomTypeName()}`;

    await testData.types.create({ name: resistorType });
    await testData.types.create({ name: capacitorType });
    await testData.types.create({ name: inductorType });

    await types.goto();

    // Verify all types are present
    await expect(types.cardByName(resistorType)).toBeVisible();
    await expect(types.cardByName(capacitorType)).toBeVisible();
    await expect(types.cardByName(inductorType)).toBeVisible();

    // Search for "Resistor" pattern
    await types.search('Resistor');
    await expect(types.cardByName(resistorType)).toBeVisible();
    await expect(types.cardByName(capacitorType)).toHaveCount(0);
    await expect(types.cardByName(inductorType)).toHaveCount(0);

    // Clear and search for "Capacitor" pattern
    await types.searchInput.clear();
    await types.search('Capacitor');
    await expect(types.cardByName(resistorType)).toHaveCount(0);
    await expect(types.cardByName(capacitorType)).toBeVisible();
    await expect(types.cardByName(inductorType)).toHaveCount(0);

    // Clear search and delete capacitor type
    await types.searchInput.clear();
    await types.deleteType(capacitorType);

    // Verify deletion
    await expect(types.cardByName(resistorType)).toBeVisible();
    await expect(types.cardByName(capacitorType)).toHaveCount(0);
    await expect(types.cardByName(inductorType)).toBeVisible();
  });

  test('handles rapid consecutive operations', async ({ testData, types }) => {
    await types.goto();

    // Create, edit, and delete types in quick succession
    const type1 = testData.types.randomTypeName();
    const type2 = testData.types.randomTypeName();
    const type3 = testData.types.randomTypeName();

    // Rapid creation
    await types.createType(type1);
    await types.createType(type2);

    // Rapid edit
    const newType1 = testData.types.randomTypeName();
    await types.editType(type1, newType1);

    // Create another one
    await types.createType(type3);

    // Delete one
    await types.deleteType(type2);

    // Verify final state
    await expect(types.cardByName(newType1)).toBeVisible();
    await expect(types.cardByName(type2)).toHaveCount(0);
    await expect(types.cardByName(type3)).toBeVisible();
  });
});