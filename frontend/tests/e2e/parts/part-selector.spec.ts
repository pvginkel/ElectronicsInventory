import { test, expect } from '../../support/fixtures';
import { PartSelectorHarnessPage } from '../../support/page-objects/part-selector-harness';

test.describe('Part Selector Harness', () => {
  test('accepts string part IDs through selection and submission', async ({ page, testData }) => {
    const { part } = await testData.parts.create({
      overrides: {
        description: testData.parts.randomPartDescription('Harness Primary'),
        manufacturer_code: 'HAR-001',
      },
    });

    const harness = new PartSelectorHarnessPage(page);
    await harness.goto();
    await harness.waitForReady();

    await harness.search(part.key);
    await harness.selectOption(part.key);
    await harness.expectInputValue(new RegExp(part.key, 'i'));

    const { completionEvent } = await harness.submit();
    expect(completionEvent.phase).toBe('success');
    expect(completionEvent.fields?.selectedPartId).toBe(part.key);

    await expect(harness.selectedSummary).toContainText(part.key);
    await expect(harness.selectedSummary).toContainText(part.description);
    await expect(harness.submissionSummary).toContainText(part.key);
  });

  test('search narrows options by description', async ({ page, testData }) => {
    const primaryDescription = testData.parts.randomPartDescription('Harness Alpha');
    const secondaryDescription = testData.parts.randomPartDescription('Harness Beta');

    await testData.parts.create({
      overrides: {
        description: primaryDescription,
        manufacturer_code: 'ALPHA-100',
      },
    });

    const { part: secondaryPart } = await testData.parts.create({
      overrides: {
        description: secondaryDescription,
        manufacturer_code: 'BETA-200',
      },
    });

    const harness = new PartSelectorHarnessPage(page);
    await harness.goto();
    await harness.waitForReady();

    await harness.search(secondaryDescription);
    await harness.expectOnlyOption(new RegExp(secondaryPart.key, 'i'));

    await harness.selectOption(secondaryPart.key);
    await expect(harness.selectedSummary).toContainText(secondaryPart.key);
    await expect(harness.selectedSummary).toContainText(secondaryDescription);
  });
});
