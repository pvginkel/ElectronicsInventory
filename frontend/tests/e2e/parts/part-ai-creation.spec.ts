import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { expectConsoleError } from '../../support/helpers';

const streamPath = '/tests/ai-stream/task-123';

test.describe('Parts - AI assisted creation', () => {
  test('creates part from AI analysis flow', async ({
    page,
    backendUrl,
    parts,
    partsAI,
    aiAnalysisMock,
    testData,
    apiClient,
    sseTimeout,
  }) => {
    const relayTypeName = testData.types.randomTypeName('Relay');
    const relayType = await testData.types.create({ name: relayTypeName });
    const testingContentBase = new URL('/api/testing/content/', backendUrl);
    if (testingContentBase.hostname === 'localhost') {
      testingContentBase.hostname = '127.0.0.1';
    }

    const datasheetTitle = 'Relay Datasheet';
    const datasheetUrl = new URL('pdf', testingContentBase).toString();
    const previewImageUrl = new URL(`image?text=${encodeURIComponent('Relay Preview')}`, testingContentBase).toString();

    const aiSession = await aiAnalysisMock({
      taskId: 'task-123',
      streamPath,
      analysisOverrides: {
        description: 'OMRON G5Q-1A4 relay',
        manufacturer: 'Omron',
        manufacturer_code: 'G5Q-1A4',
        type: relayTypeName,
        type_is_existing: true,
        existing_type_id: relayType.id,
        tags: ['relay', '5V', 'SPDT'],
        documents: [
          {
            document_type: 'datasheet',
            is_cover_image: false,
            url: datasheetUrl,
            preview: {
              content_type: 'application/pdf',
              image_url: previewImageUrl,
              original_url: datasheetUrl,
              title: datasheetTitle,
            },
          },
        ],
        dimensions: '29x12.7x15.8mm',
        voltage_rating: '5V',
        mounting_type: 'Through-hole',
        package: 'DIP',
        pin_count: 5,
        pin_pitch: '2.54mm',
        series: 'G5Q',
        input_voltage: '5V DC',
        output_voltage: null,
        product_page: 'https://example.com/relay',
        seller: null,
        seller_link: null,
      },
    });

    const analysisResult = aiSession.analysisTemplate;

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openAIDialog();
    await partsAI.waitForOpen();

    await partsAI.submitPrompt('OMRON G5Q-1A4 relay 5V 10A');

    await aiSession.waitForConnection({ timeout: sseTimeout });
    await aiSession.emitStarted();
    await aiSession.emitProgress('Analyzing manufacturer code', 0.6);
    await partsAI.waitForProgress(/Analyzing manufacturer code/);

    await aiSession.emitCompleted();
    await partsAI.waitForReview();

    const expectFieldValue = async (label: string, value: string | number | null | undefined) => {
      await expect(partsAI.reviewStep.getByLabel(label, { exact: true }))
        .toHaveValue(value == null ? '' : String(value));
    };

    await expect(partsAI.reviewStep.getByLabel('Description *')).toHaveValue(analysisResult.description);
    await expect(partsAI.reviewStep).toContainText('relay');
    await expectFieldValue('Manufacturer', analysisResult.manufacturer);
    await expectFieldValue('Manufacturer Code', analysisResult.manufacturer_code);
    await expectFieldValue('Dimensions', analysisResult.dimensions);
    await expectFieldValue('Voltage Rating', analysisResult.voltage_rating);
    await expectFieldValue('Input Voltage', analysisResult.input_voltage);
    await expectFieldValue('Package', analysisResult.package);
    await expectFieldValue('Pin Count', analysisResult.pin_count);
    await expectFieldValue('Pin Pitch', analysisResult.pin_pitch);
    await expectFieldValue('Series', analysisResult.series);
    await expect(partsAI.reviewStep.getByLabel('Product Page URL'))
      .toHaveValue('https://example.com/relay');
    await expect(partsAI.reviewStep).toContainText(datasheetTitle);

    const [createResponse] = await Promise.all([
      page.waitForResponse('**/api/ai-parts/create'),
      partsAI.submitReview(),
    ]);

    expect(createResponse.ok()).toBeTruthy();
    const created = await createResponse.json();
    const createdPartKey = (created as { key?: string }).key;
    expect(createdPartKey).toBeTruthy();

    await expect.poll(async () => {
      const url = await parts.getUrl();
      return url.includes('/parts/') ? url : null;
    }, { timeout: 20000 }).toBeTruthy();

    const currentUrl = await parts.getUrl();
    expect(currentUrl).toContain(`/parts/${createdPartKey}`);
    await parts.waitForDetailReady();
    await parts.expectDetailHeading(analysisResult.description);

    const { data } = await apiClient.GET('/api/parts/{part_key}', {
      params: { path: { part_key: createdPartKey! } },
    });

    expect(data?.tags).toContain('relay');
    expect(data?.manufacturer_code).toBe(analysisResult.manufacturer_code);
  });

  test('displays error when AI returns analysis failure reason', async ({
    page,
    parts,
    partsAI,
    aiAnalysisMock,
    sseTimeout,
  }) => {
    const failureMessage = 'Could not identify a specific electronic component from the provided text. Please provide more details such as manufacturer name, part number, or component type.';

    const aiSession = await aiAnalysisMock({
      taskId: 'task-failure-123',
      streamPath: '/tests/ai-stream/task-failure-123',
    });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openAIDialog();
    await partsAI.waitForOpen();

    // Mark the analysis failure as an expected console error
    await expectConsoleError(page, /Analysis failed:/);

    await partsAI.submitPrompt('a thing');

    await aiSession.waitForConnection({ timeout: sseTimeout });
    await aiSession.emitStarted();
    await aiSession.emitProgress('Analyzing input', 0.5);
    await partsAI.waitForProgress(/Analyzing input/);

    // Emit completion with analysis_failure_reason (no analysis_result or duplicate_parts)
    await aiSession.emitCompleted({
      success: true,
      analysis: null,
      duplicate_parts: null,
      analysis_failure_reason: failureMessage,
    });

    // Assert progress step shows error state
    await partsAI.waitForError(failureMessage);
    await expect(partsAI.progressStep).toHaveAttribute('data-state', 'error');
    await expect(partsAI.progressErrorMessage).toHaveText(failureMessage);

    // Verify dialog stayed on progress step (data-step attribute)
    await expect(partsAI.dialog).toHaveAttribute('data-step', 'progress');

    // Click retry button and verify return to input with preserved text
    await partsAI.retry();
    await expect(partsAI.inputField).toHaveValue('a thing');

    await aiSession.dispose();
  });
});
