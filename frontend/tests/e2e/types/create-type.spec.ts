import { test, expect } from '../../support/fixtures';

test.describe('Types - Create', () => {
  test('creates a new type', async ({ testData, types }) => {
    await types.goto();

    const typeName = testData.types.randomTypeName();
    await types.createType(typeName);  // includes toast assertion
  });

  test('validates required fields', async ({ types }) => {
    await types.goto();
    await types.createButton.click();
    await expect(types.modal()).toBeVisible();

    await types.submitButton().click();

    await expect(types.modal()).toBeVisible();
    await expect(types.page.getByText(/required/i)).toBeVisible();
  });
});