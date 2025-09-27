import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';

const streamPath = '/tests/ai-stream/task-123';
const streamPattern = new RegExp(`${streamPath}$`);

test.describe('Parts - AI assisted creation', () => {
  test('creates part from AI analysis flow', async ({ page, parts, partsAI, sseMocker, testData, apiClient, sseTimeout }) => {
    const relayTypeName = testData.types.randomTypeName('Relay');
    const relayType = await testData.types.create({ name: relayTypeName });
    let createdPartKey: string | null = null;

    const analysisResult = {
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
          url: 'https://example.com/relay-datasheet.pdf',
          preview: {
            content_type: 'application/pdf',
            image_url: null,
            original_url: 'https://example.com/relay-datasheet.pdf',
            title: 'Relay Datasheet',
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
      product_page_url: 'https://example.com/relay',
      seller: null,
      seller_link: null,
    };

    await sseMocker.mockSSE({
      url: streamPattern,
      events: [],
    });

    await page.route('**/api/ai-parts/analyze', route => {
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task_id: 'task-123', stream_url: streamPath }),
      });
    }, { times: 1 });

    await page.route('**/api/ai-parts/create', async route => {
      const payload = await route.request().postDataJSON();
      const { documents, ...rest } = payload;
      const created = await apiClient.apiRequest(() => apiClient.POST('/api/parts', {
        body: {
          description: rest.description,
          manufacturer_code: rest.manufacturer_code,
          type_id: rest.type_id,
          tags: rest.tags,
          manufacturer: rest.manufacturer,
          product_page: rest.product_page,
          seller_id: rest.seller_id,
          seller_link: rest.seller_link,
          dimensions: rest.dimensions,
          mounting_type: rest.mounting_type,
          package: rest.package,
          pin_count: rest.pin_count,
          pin_pitch: rest.pin_pitch,
          series: rest.series,
          voltage_rating: rest.voltage_rating,
          input_voltage: rest.input_voltage,
          output_voltage: rest.output_voltage,
        },
      }));

      createdPartKey = created.key;

      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(created),
      });
    }, { times: 1 });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openAIDialog();
    await partsAI.waitForOpen();

    await partsAI.submitPrompt('OMRON G5Q-1A4 relay 5V 10A');

    await expect.poll(async () => {
      const connections = await sseMocker.getSSEConnections();
      return connections.some(connection => connection.url.includes(streamPath)) ? 'connected' : null;
    }, { timeout: sseTimeout }).toBe('connected');

    const sendTaskEvent = async (data: Record<string, unknown>) => {
      await sseMocker.sendEvent(streamPath, {
        event: 'task_event',
        data,
      });
    };

    await sendTaskEvent({
      event_type: 'task_started',
      task_id: 'task-123',
      timestamp: new Date().toISOString(),
      data: null,
    });

    await sendTaskEvent({
      event_type: 'progress_update',
      data: {
        text: 'Analyzing manufacturer code',
        value: 0.6,
      },
    });

    await partsAI.waitForProgress(/Analyzing manufacturer code/);

    await sendTaskEvent({
      event_type: 'task_completed',
      data: {
        success: true,
        analysis: analysisResult,
        error_message: null,
      },
    });
    await partsAI.waitForReview();

    await expect(partsAI.reviewStep.getByLabel('Description *')).toHaveValue('OMRON G5Q-1A4 relay');
    await expect(partsAI.reviewStep).toContainText('relay');

    await partsAI.submitReview();

    await expect.poll(async () => {
      const url = await parts.getUrl();
      return url.includes('/parts/') ? url : null;
    }, { timeout: 20000 }).toBeTruthy();

    expect(createdPartKey).toBeTruthy();
    const currentUrl = await parts.getUrl();
    expect(currentUrl).toContain(`/parts/${createdPartKey}`);
    await parts.expectDetailHeading('OMRON G5Q-1A4 relay');

    const { data } = await apiClient.GET('/api/parts/{part_key}', {
      params: { path: { part_key: createdPartKey! } },
    });

    expect(data?.tags).toContain('relay');
    expect(data?.manufacturer_code).toBe('G5Q-1A4');
  });
});
