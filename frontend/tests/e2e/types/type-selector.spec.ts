import { test, expect } from '../../support/fixtures';

test.describe('TypeSelector - Part form integration', () => {
  test('supports inline creation of a new type when creating a part', async ({ page, testData }) => {
    const newTypeName = testData.types.randomTypeName('InlineType');

    await page.goto('/parts/new');

    const typeInput = page.getByPlaceholder('Search or create type...');
    await expect(typeInput).toBeVisible();

    await typeInput.fill(newTypeName);
    await page.getByRole('button', { name: new RegExp(`Create type "${newTypeName}"`, 'i') }).click();

    const dialog = page.getByRole('dialog', { name: 'Create New Type' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).toBeHidden();

    await expect(typeInput).toHaveValue(newTypeName);

    const createdType = await testData.types.findByName(newTypeName);
    expect(createdType.name).toBe(newTypeName);
  });

  test('allows switching types when editing an existing part', async ({ page, testData }) => {
    const primaryType = await testData.types.create({ name: testData.types.randomTypeName('Primary') });
    const alternateType = await testData.types.create({ name: testData.types.randomTypeName('Alternate') });
    const { part } = await testData.parts.create({ typeId: primaryType.id });

    await page.goto(`/parts/${part.key}`);
    await page.getByRole('button', { name: /edit part/i }).click();

    const typeInput = page.getByPlaceholder('Search or create type...');
    await expect(typeInput).toHaveValue(primaryType.name);

    await typeInput.click();
    await typeInput.fill('');
    await typeInput.type(alternateType.name);
    const option = page.getByRole('option', { name: new RegExp(alternateType.name, 'i') });
    await expect(option).toBeVisible({ timeout: 15000 });
    await option.click();
    await expect(typeInput).toHaveValue(alternateType.name);

    await page.getByTestId('parts.form.submit').click();
    await expect(page.getByRole('button', { name: /edit part/i })).toBeVisible();

    const detailInformationCard = page.getByTestId('parts.detail.information');
    await expect(detailInformationCard.getByText(alternateType.name)).toBeVisible();
    await expect(detailInformationCard.getByText(primaryType.name)).toHaveCount(0);
  });
});

test.describe('TypeSelector - AI review flow', () => {
  test('reuses options and supports inline creation during AI review', async ({
    page,
    testData,
    aiAnalysisMock,
    deploymentSse,
  }) => {
    const existingType = await testData.types.create({ name: testData.types.randomTypeName('AIExisting') });
    const alternateType = await testData.types.create({ name: testData.types.randomTypeName('AIFallback') });
    const newTypeName = testData.types.randomTypeName('AINew');

    await page.goto('/parts');

    // Establish SSE connection before creating mock session
    await deploymentSse.resetRequestId();
    await deploymentSse.ensureConnected();

    const aiSession = aiAnalysisMock({
      analysisOverrides: {
        description: 'AI generated part',
        manufacturer: 'Acme AI',
        manufacturer_code: 'AI-001',
        type: existingType.name,
        type_is_existing: true,
        existing_type_id: existingType.id,
        tags: ['ai', 'suggested'],
        documents: [],
        dimensions: null,
        voltage_rating: null,
        mounting_type: null,
        package: null,
        pin_count: null,
        pin_pitch: null,
        series: null,
        input_voltage: null,
        output_voltage: null,
        product_page: null,
        seller_link: null,
      },
    });

    await page.getByRole('button', { name: /add part with ai/i }).click();

    const input = page.getByLabel('Part Number or Description');
    await input.fill('AI powered component');
    await page.getByRole('button', { name: /analyze part/i }).click();

    await aiSession.emitStarted();
    await aiSession.emitCompleted();

    await expect(page.getByRole('heading', { name: 'Review & Edit Part Details' })).toBeVisible();

    const typeInput = page.getByPlaceholder('Search or create type...');
    await expect(typeInput).toHaveValue(existingType.name);

    await typeInput.click();
    await typeInput.fill('');
    await typeInput.type(alternateType.name);
    const alternateOption = page.getByRole('option', { name: new RegExp(alternateType.name, 'i') });
    await expect(alternateOption).toBeVisible({ timeout: 15000 });
    await alternateOption.click();
    await expect(typeInput).toHaveValue(alternateType.name);

    await typeInput.fill(newTypeName);
    await page.getByRole('button', { name: new RegExp(`Create type "${newTypeName}"`, 'i') }).click();

    const dialog = page.getByRole('dialog', { name: 'Create New Type' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).toBeHidden();

    await expect(typeInput).toHaveValue(newTypeName);

    const createdType = await testData.types.findByName(newTypeName);
    expect(createdType.name).toBe(newTypeName);

    await page.keyboard.press('Escape');
  });
});
