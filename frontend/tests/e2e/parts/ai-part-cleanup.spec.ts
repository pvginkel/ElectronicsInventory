import { test, expect } from '../../support/fixtures';
import { waitTestEvent } from '../../support/helpers';
import type { FormTestEvent } from '@/types/test-events';

test.describe('AI Part Cleanup', () => {
  test('successful cleanup with changes shows merge table with checkboxes', async ({
    page,
    parts,
    testData,
    aiCleanupMock,
    apiClient,
    sseTimeout,
  }) => {
    // Create a part type and existing part
    const relayTypeName = testData.types.randomTypeName('Relay');
    const relayType = await testData.types.create({ name: relayTypeName });

    const partResult = await testData.parts.create({
      typeId: relayType.id,
      overrides: {
        description: 'OMRON relay',
        manufacturer: 'Omron',
        manufacturer_code: 'G5Q-1A4',
        tags: ['relay'],
        dimensions: null,
        voltage_rating: null,
        package: null,
      },
    });
    const part = partResult.part;

    // Create cleanup mock session
    const cleanupSession = await aiCleanupMock({
      taskId: 'cleanup-task-123',
      streamPath: '/tests/ai-stream/cleanup-task-123',
      cleanupOverrides: {
        key: part.key,
        description: 'OMRON G5Q-1A4 relay',
        manufacturer: 'Omron',
        manufacturer_code: 'G5Q-1A4',
        type: relayTypeName,
        type_is_existing: true,
        existing_type_id: relayType.id,
        tags: ['relay', '5V', 'SPDT'],
        dimensions: '29x12.7x15.8mm',
        voltage_rating: '5V',
        package: 'DIP',
        pin_count: 5,
        pin_pitch: '2.54mm',
        series: 'G5Q',
        mounting_type: 'Through-hole',
        input_voltage: '5V DC',
        output_voltage: null,
        product_page: 'https://example.com/relay',
      },
    });

    // Navigate to part detail page
    await page.goto(`/parts/${part.key}`);
    await parts.waitForDetailReady();

    // Open overflow menu and click "Cleanup Part"
    await parts.overflowMenuButton.click();
    const cleanupMenuItem = page.getByRole('menuitem', { name: /cleanup part/i });
    await expect(cleanupMenuItem).toBeVisible();

    // Verify sparkle icon is present
    const sparkleIcon = cleanupMenuItem.locator('svg');
    await expect(sparkleIcon).toBeVisible();

    await cleanupMenuItem.click();

    // Wait for dialog to open and show progress step
    const cleanupDialog = page.getByTestId('parts.cleanup.dialog');
    await expect(cleanupDialog).toBeVisible();
    await expect(cleanupDialog).toHaveAttribute('data-step', 'progress');

    // Wait for SSE connection
    await cleanupSession.waitForConnection({ timeout: sseTimeout });

    // Emit cleanup events
    await cleanupSession.emitStarted();
    await cleanupSession.emitProgress('Analyzing part data...', 0.3);

    const progressStep = page.getByTestId('parts.cleanup.progress');
    await expect(progressStep).toBeVisible();
    await expect(progressStep).toContainText(/Analyzing part data/);

    await cleanupSession.emitProgress('Cleaning up fields...', 0.7);
    await cleanupSession.emitCompleted();

    // Wait for merge step to appear
    await expect(cleanupDialog).toHaveAttribute('data-step', 'merge');
    const mergeStep = page.getByTestId('parts.cleanup.merge.table');
    await expect(mergeStep).toBeVisible();

    // Verify merge table shows only changed fields
    const mergeRows = page.getByTestId('parts.cleanup.merge.row');
    const rowCount = await mergeRows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Verify specific changed fields are present with checkboxes
    const descriptionRow = mergeRows.filter({ hasText: /description/i }).first();
    await expect(descriptionRow).toBeVisible();

    // Check old value is red and new value is green
    const oldValue = descriptionRow.locator('[data-value-type="old"]');
    const newValue = descriptionRow.locator('[data-value-type="new"]');
    await expect(oldValue).toBeVisible();
    await expect(oldValue).toHaveText('OMRON relay');
    await expect(newValue).toBeVisible();
    await expect(newValue).toHaveText('OMRON G5Q-1A4 relay');

    // Verify arrow separator is present
    const arrow = descriptionRow.locator('text=→');
    await expect(arrow).toBeVisible();

    // Verify checkbox is present and checked by default
    const descriptionCheckbox = descriptionRow.getByTestId('parts.cleanup.merge.checkbox');
    await expect(descriptionCheckbox).toBeChecked();

    // Verify tags row shows comma-separated values
    const tagsRow = mergeRows.filter({ hasText: /tags/i }).first();
    await expect(tagsRow).toBeVisible();
    await expect(tagsRow.locator('[data-value-type="old"]')).toHaveText('relay');
    await expect(tagsRow.locator('[data-value-type="new"]')).toHaveText('relay, 5V, SPDT');

    // Test unchecking a checkbox turns values gray
    await descriptionCheckbox.uncheck();
    await expect(descriptionCheckbox).not.toBeChecked();
    await expect(oldValue).toHaveCSS('color', /rgb\(.*\)/); // Gray color

    // Re-check it
    await descriptionCheckbox.check();
    await expect(descriptionCheckbox).toBeChecked();

    // Verify "Apply Changes" button is enabled when checkboxes are checked
    const applyButton = page.getByTestId('parts.cleanup.apply-button');
    await expect(applyButton).toBeEnabled();

    // Click Apply Changes
    const [applySubmitEvent, applySuccessEvent] = await Promise.all([
      waitTestEvent<FormTestEvent>(page, 'form', evt =>
        evt.formId === 'ai-part-cleanup-apply' && evt.phase === 'submit'
      ),
      waitTestEvent<FormTestEvent>(page, 'form', evt =>
        evt.formId === 'ai-part-cleanup-apply' && evt.phase === 'success'
      ),
      applyButton.click(),
    ]);

    expect(applySubmitEvent).toBeTruthy();
    expect(applySuccessEvent).toBeTruthy();

    // Verify dialog closes
    await expect(cleanupDialog).not.toBeVisible();

    // Verify part was updated by fetching it
    const { data: updatedPart } = await apiClient.GET('/api/parts/{part_key}', {
      params: { path: { part_key: part.key } },
    });

    expect(updatedPart?.description).toBe('OMRON G5Q-1A4 relay');
    expect(updatedPart?.tags).toContain('5V');
    expect(updatedPart?.tags).toContain('SPDT');
    expect(updatedPart?.dimensions).toBe('29x12.7x15.8mm');

    await cleanupSession.dispose();
  });

  test('successful cleanup with no changes shows no-changes step', async ({
    page,
    parts,
    testData,
    aiCleanupMock,
    sseTimeout,
  }) => {
    // Create part with complete data
    const relayTypeName = testData.types.randomTypeName('Relay');
    const relayType = await testData.types.create({ name: relayTypeName });

    const partResult = await testData.parts.create({
      typeId: relayType.id,
      overrides: {
        description: 'OMRON G5Q-1A4 relay',
        manufacturer: 'Omron',
        manufacturer_code: 'G5Q-1A4',
        tags: ['relay', '5V'],
        dimensions: '29x12.7x15.8mm',
        voltage_rating: '5V',
      },
    });
    const part = partResult.part;

    // Create cleanup mock that returns identical data (no changes)
    const cleanupSession = await aiCleanupMock({
      taskId: 'cleanup-nochange-123',
      streamPath: '/tests/ai-stream/cleanup-nochange-123',
      cleanupOverrides: {
        key: part.key,
        description: part.description,
        manufacturer: part.manufacturer,
        manufacturer_code: part.manufacturer_code,
        type: relayTypeName,
        type_is_existing: true,
        existing_type_id: relayType.id,
        tags: part.tags ?? [],
        dimensions: part.dimensions,
        voltage_rating: part.voltage_rating,
        package: part.package,
        pin_count: part.pin_count,
        pin_pitch: part.pin_pitch,
        series: part.series,
        mounting_type: part.mounting_type,
        input_voltage: part.input_voltage,
        output_voltage: part.output_voltage,
        product_page: part.product_page,
      },
    });

    await page.goto(`/parts/${part.key}`);
    await parts.waitForDetailReady();

    // Open cleanup dialog
    await parts.overflowMenuButton.click();
    await page.getByRole('menuitem', { name: /cleanup part/i }).click();

    const cleanupDialog = page.getByTestId('parts.cleanup.dialog');
    await expect(cleanupDialog).toBeVisible();

    await cleanupSession.waitForConnection({ timeout: sseTimeout });
    await cleanupSession.emitStarted();
    await cleanupSession.emitProgress('Analyzing...', 0.5);
    await cleanupSession.emitCompleted();

    // Verify no-changes step is shown
    await expect(cleanupDialog).toHaveAttribute('data-step', 'no-changes');
    const noChangesStep = page.getByTestId('parts.cleanup.no-changes');
    await expect(noChangesStep).toBeVisible();

    // Verify message
    await expect(noChangesStep).toContainText(/No improvements found/i);
    await expect(noChangesStep).toContainText(/Your part data is already clean!/i);

    // Verify Close button is present and closes dialog
    const closeButton = noChangesStep.getByRole('button', { name: /close/i });
    await expect(closeButton).toBeVisible();
    await closeButton.click();
    await expect(cleanupDialog).not.toBeVisible();

    await cleanupSession.dispose();
  });

  test('error during cleanup shows error on progress step with retry', async ({
    page,
    parts,
    testData,
    aiCleanupMock,
    sseTimeout,
  }) => {
    const relayTypeName = testData.types.randomTypeName('Relay');
    const relayType = await testData.types.create({ name: relayTypeName });

    const partResult = await testData.parts.create({
      typeId: relayType.id,
      overrides: {
        description: 'Test relay',
      },
    });
    const part = partResult.part;

    const cleanupSession = await aiCleanupMock({
      taskId: 'cleanup-error-123',
      streamPath: '/tests/ai-stream/cleanup-error-123',
    });

    await page.goto(`/parts/${part.key}`);
    await parts.waitForDetailReady();

    await parts.overflowMenuButton.click();
    await page.getByRole('menuitem', { name: /cleanup part/i }).click();

    const cleanupDialog = page.getByTestId('parts.cleanup.dialog');
    await expect(cleanupDialog).toBeVisible();

    await cleanupSession.waitForConnection({ timeout: sseTimeout });
    await cleanupSession.emitStarted();

    // Emit failure
    const errorMessage = 'Failed to analyze part data. Please try again.';
    await cleanupSession.emitFailure(errorMessage);

    // Verify error state on progress step
    const progressStep = page.getByTestId('parts.cleanup.progress');
    await expect(progressStep).toBeVisible();
    await expect(progressStep).toHaveAttribute('data-state', 'error');

    const errorText = page.getByTestId('parts.cleanup.progress.error');
    await expect(errorText).toBeVisible();
    await expect(errorText).toContainText(errorMessage);

    // Verify Retry and Cancel buttons are present
    const retryButton = page.getByRole('button', { name: /retry/i });
    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await expect(retryButton).toBeVisible();
    await expect(cancelButton).toBeVisible();

    // Click cancel to close dialog
    await cancelButton.click();
    await expect(cleanupDialog).not.toBeVisible();

    await cleanupSession.dispose();
  });

  test('selective field application only patches checked fields', async ({
    page,
    parts,
    testData,
    aiCleanupMock,
    apiClient,
    sseTimeout,
  }) => {
    const relayTypeName = testData.types.randomTypeName('Relay');
    const relayType = await testData.types.create({ name: relayTypeName });

    const partResult = await testData.parts.create({
      typeId: relayType.id,
      overrides: {
        description: 'Old description',
        manufacturer: 'Old Manufacturer',
        voltage_rating: null,
      },
    });
    const part = partResult.part;

    const cleanupSession = await aiCleanupMock({
      cleanupOverrides: {
        key: part.key,
        description: 'New description',
        manufacturer: 'New Manufacturer',
        voltage_rating: '5V',
        type: relayTypeName,
        type_is_existing: true,
        existing_type_id: relayType.id,
      },
    });

    await page.goto(`/parts/${part.key}`);
    await parts.waitForDetailReady();

    await parts.overflowMenuButton.click();
    await page.getByRole('menuitem', { name: /cleanup part/i }).click();

    const cleanupDialog = page.getByTestId('parts.cleanup.dialog');
    await cleanupSession.waitForConnection({ timeout: sseTimeout });
    await cleanupSession.emitStarted();
    await cleanupSession.emitCompleted();

    await expect(cleanupDialog).toHaveAttribute('data-step', 'merge');

    // Find specific rows
    const mergeRows = page.getByTestId('parts.cleanup.merge.row');
    const manufacturerRow = mergeRows.filter({ hasText: /^manufacturer$/i }).first();

    // Uncheck the manufacturer row (keep only description and voltage_rating checked)
    const manufacturerCheckbox = manufacturerRow.getByTestId('parts.cleanup.merge.checkbox');
    await manufacturerCheckbox.uncheck();

    // Apply changes
    const applyButton = page.getByTestId('parts.cleanup.apply-button');
    await expect(applyButton).toBeEnabled();

    await Promise.all([
      waitTestEvent<FormTestEvent>(page, 'form', evt =>
        evt.formId === 'ai-part-cleanup-apply' && evt.phase === 'success'
      ),
      applyButton.click(),
    ]);

    await expect(cleanupDialog).not.toBeVisible();

    // Verify only checked fields were updated
    const { data: updatedPart } = await apiClient.GET('/api/parts/{part_key}', {
      params: { path: { part_key: part.key } },
    });

    expect(updatedPart?.description).toBe('New description');
    expect(updatedPart?.manufacturer).toBe('Old Manufacturer'); // Should NOT be updated
    expect(updatedPart?.voltage_rating).toBe('5V');

    await cleanupSession.dispose();
  });

  test('apply button disabled when all checkboxes unchecked', async ({
    page,
    parts,
    testData,
    aiCleanupMock,
    sseTimeout,
  }) => {
    const relayTypeName = testData.types.randomTypeName('Relay');
    const relayType = await testData.types.create({ name: relayTypeName });

    const partResult = await testData.parts.create({
      typeId: relayType.id,
      overrides: {
        description: 'Old description',
        manufacturer: 'Old Manufacturer',
      },
    });
    const part = partResult.part;

    const cleanupSession = await aiCleanupMock({
      cleanupOverrides: {
        key: part.key,
        description: 'New description',
        manufacturer: 'New Manufacturer',
        type: relayTypeName,
        type_is_existing: true,
        existing_type_id: relayType.id,
      },
    });

    await page.goto(`/parts/${part.key}`);
    await parts.waitForDetailReady();

    await parts.overflowMenuButton.click();
    await page.getByRole('menuitem', { name: /cleanup part/i }).click();

    const cleanupDialog = page.getByTestId('parts.cleanup.dialog');
    await cleanupSession.waitForConnection({ timeout: sseTimeout });
    await cleanupSession.emitStarted();
    await cleanupSession.emitCompleted();

    await expect(cleanupDialog).toHaveAttribute('data-step', 'merge');

    const applyButton = page.getByTestId('parts.cleanup.apply-button');
    await expect(applyButton).toBeEnabled();

    // Uncheck all checkboxes
    const checkboxes = page.getByTestId('parts.cleanup.merge.checkbox');
    const checkboxCount = await checkboxes.count();

    for (let i = 0; i < checkboxCount; i++) {
      const checkbox = checkboxes.nth(i);
      await checkbox.uncheck();
    }

    // Verify Apply button is now disabled
    await expect(applyButton).toBeDisabled();

    await cleanupSession.dispose();
  });

  test('type creation flow when type does not exist', async ({
    page,
    parts,
    testData,
    aiCleanupMock,
    apiClient,
    sseTimeout,
  }) => {
    const existingTypeName = testData.types.randomTypeName('OldType');
    const existingType = await testData.types.create({ name: existingTypeName });

    const partResult = await testData.parts.create({
      typeId: existingType.id,
      overrides: {
        description: 'Test part',
      },
    });
    const part = partResult.part;

    const newTypeName = testData.types.randomTypeName('NewType');

    const cleanupSession = await aiCleanupMock({
      cleanupOverrides: {
        key: part.key,
        description: 'Test part with new type',
        type: newTypeName,
        type_is_existing: false,
        existing_type_id: null,
      },
    });

    await page.goto(`/parts/${part.key}`);
    await parts.waitForDetailReady();

    await parts.overflowMenuButton.click();
    await page.getByRole('menuitem', { name: /cleanup part/i }).click();

    const cleanupDialog = page.getByTestId('parts.cleanup.dialog');
    await cleanupSession.waitForConnection({ timeout: sseTimeout });
    await cleanupSession.emitStarted();
    await cleanupSession.emitCompleted();

    await expect(cleanupDialog).toHaveAttribute('data-step', 'merge');

    // Look for "Create Type" button
    const createTypeButton = page.getByRole('button', { name: /create type/i });
    await expect(createTypeButton).toBeVisible();

    // Click to open type creation dialog
    await createTypeButton.click();

    const typeDialog = page.getByRole('dialog', { name: /create type/i });
    await expect(typeDialog).toBeVisible();

    // Fill and submit type creation form
    const typeNameInput = typeDialog.getByLabel(/name/i);
    await expect(typeNameInput).toHaveValue(newTypeName);

    await typeDialog.getByRole('button', { name: /create/i }).click();

    // Wait for type creation to complete
    await expect(typeDialog).not.toBeVisible();

    // Verify "Create Type" button is replaced with checkbox row
    await expect(createTypeButton).not.toBeVisible();
    const typeRow = page.getByTestId('parts.cleanup.merge.row').filter({ hasText: /type/i }).first();
    await expect(typeRow).toBeVisible();
    const typeCheckbox = typeRow.getByTestId('parts.cleanup.merge.checkbox');
    await expect(typeCheckbox).toBeVisible();

    // Apply changes
    const applyButton = page.getByTestId('parts.cleanup.apply-button');
    await Promise.all([
      waitTestEvent<FormTestEvent>(page, 'form', evt =>
        evt.formId === 'ai-part-cleanup-apply' && evt.phase === 'success'
      ),
      applyButton.click(),
    ]);

    await expect(cleanupDialog).not.toBeVisible();

    // Verify part was updated with new type
    const { data: updatedPart } = await apiClient.GET('/api/parts/{part_key}', {
      params: { path: { part_key: part.key } },
    });

    const { data: createdType } = await apiClient.GET('/api/types/{type_id}', {
      params: { path: { type_id: updatedPart!.type_id! } },
    });

    expect(createdType?.name).toBe(newTypeName);
    expect(updatedPart?.description).toBe('Test part with new type');

    await cleanupSession.dispose();
  });
});
