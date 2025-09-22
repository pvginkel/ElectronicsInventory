import { test, expect } from '../../support/fixtures';

test.describe('Types - CRUD Operations', () => {
  test('edits an existing type', async ({ testData, types }) => {
    const existingName = testData.types.randomTypeName();
    const existing = await testData.types.create({ name: existingName });

    await types.goto();
    const newName = testData.types.randomTypeName();
    await types.editType(existing.name, newName);

    await expect(types.cardByName(existing.name)).toHaveCount(0);
    await expect(types.cardByName(newName)).toBeVisible();
  });

  test('deletes a type', async ({ testData, types }) => {
    const existingName = testData.types.randomTypeName();
    const existing = await testData.types.create({ name: existingName });

    await types.goto();
    await types.deleteType(existing.name);

    await expect(types.cardByName(existing.name)).toHaveCount(0);
  });

  test('handles validation errors', async ({ types }) => {
    await types.goto();
    await types.createButton.click();

    await types.submitButton().click();

    await expect(types.modal()).toBeVisible();
    await expect(types.page.getByText(/required/i)).toBeVisible();
  });

  test('blocked delete shows error when type has parts', async ({ testData, types }) => {
    const typeName = testData.types.randomTypeName();
    const type = await testData.types.create({ name: typeName });
    await testData.parts.create({ typeId: type.id });

    await types.goto();

    // Attempt to delete the type - should fail
    await types.deleteButtonForCard(type.name).click();

    // Confirm dialog appears
    const confirmDialog = types.page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible();

    // Click the Delete button in the confirm dialog
    await confirmDialog.getByRole('button', { name: 'Delete' }).click();

    // Wait for the toast error to appear (the API returns a 409 error)
    await expect(types.toast()).toBeVisible();

    // Dialog should close after error
    await expect(confirmDialog).toBeHidden();

    // Type should still be visible, delete was blocked
    await expect(types.cardByName(type.name)).toBeVisible();
  });

  test('validates duplicate type names', async ({ testData, types }) => {
    const existingName = testData.types.randomTypeName();
    await testData.types.create({ name: existingName });

    await types.goto();
    await types.createButton.click();
    await expect(types.createModal()).toBeVisible();

    await types.nameInput().fill(existingName);
    await types.submitButton().click();

    // Should show error toast and modal should remain open (server error doesn't close the modal)
    await expect(types.toast(/already exists|duplicate/i)).toBeVisible();
    await expect(types.createModal()).toBeVisible();

    // Can close the modal
    await types.cancelButton().click();
    await expect(types.createModal()).toBeHidden();
  });

  test('handles whitespace in type names', async ({ testData, types }) => {
    await types.goto();
    await types.createButton.click();
    await expect(types.createModal()).toBeVisible();

    const typeName = `  ${testData.types.randomTypeName()}  `;
    await types.nameInput().fill(typeName);
    await types.submitButton().click();

    // Modal should close and type should be created with trimmed name
    await expect(types.createModal()).toBeHidden();
    await expect(types.cardByName(typeName.trim())).toBeVisible();
  });

  test('searches for types', async ({ testData, types }) => {
    // Create multiple types
    const type1Name = testData.types.randomTypeName();
    const type2Name = testData.types.randomTypeName();
    const type3Name = testData.types.randomTypeName();

    await testData.types.create({ name: type1Name });
    await testData.types.create({ name: type2Name });
    await testData.types.create({ name: type3Name });

    await types.goto();

    // All types should be visible initially
    await expect(types.cardByName(type1Name)).toBeVisible();
    await expect(types.cardByName(type2Name)).toBeVisible();
    await expect(types.cardByName(type3Name)).toBeVisible();

    // Search for a specific type
    await types.search(type2Name);

    // Only the searched type should be visible
    await expect(types.cardByName(type1Name)).toHaveCount(0);
    await expect(types.cardByName(type2Name)).toBeVisible();
    await expect(types.cardByName(type3Name)).toHaveCount(0);

    // Clear search
    await types.searchInput.clear();

    // All types should be visible again
    await expect(types.cardByName(type1Name)).toBeVisible();
    await expect(types.cardByName(type2Name)).toBeVisible();
    await expect(types.cardByName(type3Name)).toBeVisible();
  });

  test('cancels edit operation', async ({ testData, types }) => {
    const existingName = testData.types.randomTypeName();
    const existing = await testData.types.create({ name: existingName });

    await types.goto();

    // Start editing
    await types.editButtonForCard(existing.name).click();
    await expect(types.editModal()).toBeVisible();

    // Change the name but cancel
    const newName = testData.types.randomTypeName();
    await types.nameInput().clear();
    await types.nameInput().fill(newName);
    await types.cancelButton().click();

    // Modal should close and name should not be changed
    await expect(types.editModal()).toBeHidden();
    await expect(types.cardByName(existing.name)).toBeVisible();
    await expect(types.cardByName(newName)).toHaveCount(0);
  });

  test('handles maximum length validation', async ({ types }) => {
    await types.goto();
    await types.createButton.click();
    await expect(types.createModal()).toBeVisible();

    // Try to enter a very long name (over 255 characters)
    const longName = 'A'.repeat(260);
    await types.nameInput().fill(longName);

    // Input should be limited to 255 characters
    const inputValue = await types.nameInput().inputValue();
    expect(inputValue.length).toBeLessThanOrEqual(255);
  });
});