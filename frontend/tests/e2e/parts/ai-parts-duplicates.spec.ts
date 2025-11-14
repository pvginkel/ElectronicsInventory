import { test, expect } from '../../support/fixtures';
import type { AiAnalysisDuplicateEntry } from '../../support/helpers/ai-analysis-mock';

test.describe('AI Part Analysis - Duplicate Detection', () => {
  test('shows duplicate-only screen when only duplicates returned', async ({
    page,
    parts,
    partsAI,
    testData,
    aiAnalysisMock,
  }) => {
    // Create two existing parts that will be returned as duplicates
    const type = await testData.types.create({ name: testData.types.randomTypeName('Relay') });
    const partResult1 = await testData.parts.create({
      typeId: type.id,
      overrides: {
        description: 'OMRON G5Q-1A4 relay',
        manufacturer_code: 'G5Q-1A4',
      },
    });
    const partResult2 = await testData.parts.create({
      typeId: type.id,
      overrides: {
        description: 'OMRON G5Q-1A relay (similar)',
        manufacturer_code: 'G5Q-1A',
      },
    });
    const part1 = partResult1.part;
    const part2 = partResult2.part;

    // Navigate to parts list and open AI dialog
    await parts.gotoList();
    await parts.waitForCards();
    await parts.openAIDialog();
    await partsAI.waitForOpen();

    // Set up AI analysis mock with duplicate-only response
    const mock = await aiAnalysisMock();
    const searchText = 'OMRON G5Q-1A4';

    // Submit analysis
    await partsAI.submitPrompt(searchText);

    // Wait for SSE connection
    await mock.waitForConnection();

    // Emit analysis events with duplicate-only result
    await mock.emitStarted();
    await mock.emitProgress('Analyzing part...', 50);

    const duplicates: AiAnalysisDuplicateEntry[] = [
      {
        part_key: part1.key,
        confidence: 'high',
        reasoning: 'Exact manufacturer part number match with same manufacturer',
      },
      {
        part_key: part2.key,
        confidence: 'medium',
        reasoning: 'Similar manufacturer part number and same manufacturer',
      },
    ];

    await mock.emitCompleted({
      analysis: null, // No analysis result
      duplicate_parts: duplicates,
    });

    // Assert dialog shows duplicates step
    await expect(page.getByTestId('parts.ai.dialog')).toHaveAttribute('data-step', 'duplicates');
    await expect(page.getByTestId('parts.ai.duplicates-only-step')).toBeVisible();

    // Assert header content
    await expect(page.getByText('Potential Duplicates Found')).toBeVisible();
    await expect(
      page.getByText(
        /These parts may already exist in your inventory.*Click any card to review.*or go back/i
      )
    ).toBeVisible();

    // Assert duplicate cards are rendered
    const card1 = page.getByTestId(`parts.ai.duplicates.card.${part1.key}`);
    const card2 = page.getByTestId(`parts.ai.duplicates.card.${part2.key}`);

    await expect(card1).toBeVisible();
    await expect(card2).toBeVisible();

    // Assert card content for high confidence duplicate
    await expect(card1).toContainText(part1.key);
    await expect(card1.getByTestId('parts.ai.confidence.high')).toBeVisible();
    await expect(card1.getByTestId('parts.ai.confidence.high')).toContainText('High');

    // Assert reasoning tooltip on hover
    const tooltipTrigger1 = page.getByTestId(`parts.ai.duplicate-reasoning.card.${part1.key}`);
    await tooltipTrigger1.hover();
    await expect(
      page.getByTestId(`parts.ai.duplicate-reasoning.card.${part1.key}.tooltip`)
    ).toBeVisible();
    await expect(
      page.getByTestId(`parts.ai.duplicate-reasoning.card.${part1.key}.tooltip`)
    ).toContainText('Exact manufacturer part number match');

    // Assert card content for medium confidence duplicate
    await expect(card2).toContainText(part2.key);
    await expect(card2.getByTestId('parts.ai.confidence.medium')).toBeVisible();
    await expect(card2.getByTestId('parts.ai.confidence.medium')).toContainText('Medium');

    // Assert back button is present
    await expect(page.getByTestId('parts.ai.duplicates.back')).toBeVisible();

    // Click back button returns to input step
    await page.getByTestId('parts.ai.duplicates.back').click();
    await expect(page.getByTestId('parts.ai.dialog')).toHaveAttribute('data-step', 'input');

    await mock.dispose();
  });

  test('duplicate card opens part in new tab on click', async ({
    page,
    context,
    testData,
    parts,
    partsAI,
    aiAnalysisMock,
  }) => {
    // Create existing part
    const type = await testData.types.create({ name: testData.types.randomTypeName('IC') });
    const partResult = await testData.parts.create({
      typeId: type.id,
      overrides: {
        description: 'ATmega328P microcontroller',
        manufacturer_code: 'ATMEGA328P-PU',
      },
    });
    const part = partResult.part;

    // Navigate and open AI dialog
    await parts.gotoList();
    await parts.waitForCards();
    await parts.openAIDialog();
    await partsAI.waitForOpen();

    // Set up mock with duplicate response
    const mock = await aiAnalysisMock();

    await partsAI.submitPrompt('ATMEGA328P');

    await mock.waitForConnection();
    await mock.emitStarted();

    await mock.emitCompleted({
      analysis: null,
      duplicate_parts: [
        {
          part_key: part.key,
          confidence: 'high',
          reasoning: 'Exact part match',
        },
      ],
    });

    // Wait for duplicates screen
    await expect(page.getByTestId('parts.ai.duplicates-only-step')).toBeVisible();

    // Set up new tab listener
    const newTabPromise = context.waitForEvent('page');

    // Click duplicate card
    await page.getByTestId(`parts.ai.duplicates.card.${part.key}`).click();

    // Verify new tab opened with correct URL
    const newTab = await newTabPromise;
    await newTab.waitForLoadState();
    expect(newTab.url()).toContain(`/parts/${part.key}`);

    await newTab.close();
    await mock.dispose();
  });

  test('shows analysis with duplicate bar when both analysis and duplicates returned', async ({
    page,
    testData,
    parts,
    partsAI,
    aiAnalysisMock,
  }) => {
    // Create existing part
    const type = await testData.types.create({ name: testData.types.randomTypeName('Resistor') });
    const existingPartResult = await testData.parts.create({
      typeId: type.id,
      overrides: {
        description: '10k resistor',
        manufacturer_code: 'RES-10K',
      },
    });

    const existingPart = existingPartResult.part;

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openAIDialog();
    await partsAI.waitForOpen();

    const mock = await aiAnalysisMock();

    await partsAI.submitPrompt('10k resistor');

    await mock.waitForConnection();
    await mock.emitStarted();

    // Return both analysis AND duplicates
    await mock.emitCompleted({
      analysis: {
        description: '10k ohm resistor 1/4W',
        manufacturer: 'Generic',
        manufacturer_code: 'R10K-025',
        type: 'Resistor',
        type_is_existing: true,
        existing_type_id: type.id,
        tags: ['resistor', '10k', '1/4W'],
        documents: [],
      },
      duplicate_parts: [
        {
          part_key: existingPart.key,
          confidence: 'medium',
          reasoning: 'Similar resistance value and package',
        },
      ],
    });

    // Assert review step is shown (not duplicates-only)
    await expect(page.getByTestId('parts.ai.dialog')).toHaveAttribute('data-step', 'review');
    await expect(page.getByTestId('parts.ai.review-step')).toBeVisible();

    // Assert duplicate bar is present at top of review step
    await expect(page.getByTestId('parts.ai.review.duplicate-bar')).toBeVisible();
    await expect(page.getByText('Potential Duplicates Found')).toBeVisible();

    // Assert duplicate bar item
    const barItem = page.getByTestId(`parts.ai.review.duplicate-bar.item.${existingPart.key}`);
    await expect(barItem).toBeVisible();
    await expect(barItem).toContainText(existingPart.key);
    await expect(barItem.getByTestId('parts.ai.confidence.medium')).toBeVisible();

    // Assert bar item has tooltip
    const barTooltipTrigger = page.getByTestId(`parts.ai.duplicate-reasoning.bar.${existingPart.key}`);
    await barTooltipTrigger.hover();
    await expect(
      page.getByTestId(`parts.ai.duplicate-reasoning.bar.${existingPart.key}.tooltip`)
    ).toBeVisible();

    // Assert form fields are populated with analysis data
    await expect(page.getByLabel('Description')).toHaveValue('10k ohm resistor 1/4W');

    await mock.dispose();
  });

  test('duplicate bar item opens part in new tab on click', async ({
    page,
    context,
    testData,
    parts,
    partsAI,
    aiAnalysisMock,
  }) => {
    const type = await testData.types.create({ name: testData.types.randomTypeName('Capacitor') });
    const existingPartResult = await testData.parts.create({
      typeId: type.id,
      overrides: {
        description: '100uF capacitor',
        manufacturer_code: 'CAP-100U',
      },
    });

    const existingPart = existingPartResult.part;

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openAIDialog();
    await partsAI.waitForOpen();

    const mock = await aiAnalysisMock();

    await partsAI.submitPrompt('100uF cap');

    await mock.waitForConnection();
    await mock.emitStarted();

    await mock.emitCompleted({
      analysis: {
        description: '100uF electrolytic capacitor',
        type: 'Capacitor',
        type_is_existing: true,
        existing_type_id: type.id,
      },
      duplicate_parts: [
        {
          part_key: existingPart.key,
          confidence: 'high',
          reasoning: 'Matching capacitance value',
        },
      ],
    });

    await expect(page.getByTestId('parts.ai.review.duplicate-bar')).toBeVisible();

    // Set up new tab listener
    const newTabPromise = context.waitForEvent('page');

    // Click bar item
    await page.getByTestId(`parts.ai.review.duplicate-bar.item.${existingPart.key}`).click();

    // Verify new tab
    const newTab = await newTabPromise;
    await newTab.waitForLoadState();
    expect(newTab.url()).toContain(`/parts/${existingPart.key}`);

    await newTab.close();
    await mock.dispose();
  });

  test('handles grid layout for different duplicate counts', async ({
    page,
    testData,
    parts,
    partsAI,
    aiAnalysisMock,
  }) => {
    const type = await testData.types.create({ name: testData.types.randomTypeName('LED') });

    // Create 5 parts for duplicate grid test
    const partResults = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        testData.parts.create({
          typeId: type.id,
          overrides: {
            description: `LED ${i + 1}`,
            manufacturer_code: `LED-${i + 1}`,
          },
        })
      )
    );
    const createdParts = partResults.map(result => result.part);

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openAIDialog();
    await partsAI.waitForOpen();

    const mock = await aiAnalysisMock();

    await partsAI.submitPrompt('LED');

    await mock.waitForConnection();
    await mock.emitStarted();

    await mock.emitCompleted({
      analysis: null,
      duplicate_parts: createdParts.map((part, i) => ({
        part_key: part.key,
        confidence: i % 2 === 0 ? ('high' as const) : ('medium' as const),
        reasoning: `LED match ${i + 1}`,
      })),
    });

    await expect(page.getByTestId('parts.ai.duplicates-only-step')).toBeVisible();

    // Assert all 5 cards are visible
    for (const part of createdParts) {
      await expect(page.getByTestId(`parts.ai.duplicates.card.${part.key}`)).toBeVisible();
    }

    await mock.dispose();
  });

  test('shows error when neither analysis nor duplicates returned', async ({
    page,
    parts,
    partsAI,
    aiAnalysisMock,
    toastHelper,
  }) => {
    await parts.gotoList();
    await parts.waitForCards();
    await parts.openAIDialog();
    await partsAI.waitForOpen();

    const mock = await aiAnalysisMock();

    await partsAI.submitPrompt('test part');

    await mock.waitForConnection();
    await mock.emitStarted();

    // Emit completed with both fields null (invalid)
    await mock.emitCompleted({
      analysis: null,
      duplicate_parts: null,
    });

    // Assert error toast is shown
    await toastHelper.waitForToastWithText(/Invalid analysis result/i);

    await mock.dispose();
  });

  test('shows fallback UI when duplicate part fetch fails with 404', async ({
    page,
    testData,
    parts,
    partsAI,
    aiAnalysisMock,
    apiClient,
  }) => {
    const type = await testData.types.create({ name: testData.types.randomTypeName('Capacitor') });

    // Create a part that we'll delete before the duplicate fetch
    const partResult = await testData.parts.create({
      typeId: type.id,
      overrides: {
        description: 'Test capacitor',
        manufacturer_code: 'CAP-TEST',
      },
    });
    const part = partResult.part;

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openAIDialog();
    await partsAI.waitForOpen();

    const mock = await aiAnalysisMock();

    await partsAI.submitPrompt('capacitor');

    await mock.waitForConnection();
    await mock.emitStarted();

    // Return the part as a duplicate
    await mock.emitCompleted({
      analysis: null,
      duplicate_parts: [
        {
          part_key: part.key,
          confidence: 'high',
          reasoning: 'Match found',
        },
      ],
    });

    // Wait for duplicates screen to appear
    await page.waitForSelector('[data-testid="parts.ai.duplicates-only-step"]');

    // Delete the part so the fetch will 404
    await apiClient.DELETE('/api/parts/{part_key}', {
      params: { path: { part_key: part.key } },
    });

    // Wait a bit for the query to attempt fetching
    await page.waitForTimeout(1000);

    // Assert card shows fallback UI
    const card = page.getByTestId(`parts.ai.duplicates.card.${part.key}`);
    await card.waitFor({ state: 'visible' });
    await card.getByText('Unable to load part details').waitFor({ state: 'visible' });

    await mock.dispose();
  });
});
