/**
 * App-specific task SSE event tests for ElectronicsInventory.
 *
 * Generic task event tests (receive, payload structure, sequencing) live in
 * the template at tests/infrastructure/sse/task-events.spec.ts.
 *
 * This file covers app-specific scenarios that depend on domain UI components.
 */
import { test, expect } from '../../support/fixtures';
import { waitForSseEvent, extractSseData } from '../../support/helpers/test-events';

// The SSE context provider emits connection events with streamId 'connection'
// and task events arrive as envelope type 'task_event'.
const CONNECTION_STREAM_ID = 'connection';

test.describe('Task SSE events (app-specific)', () => {
  test('AI analysis dialog receives progress and completion events', async ({
    page,
    frontendUrl,
    backendUrl,
    testEvents,
    deploymentSse,
  }) => {
    // Navigate to parts page
    await page.goto(`${frontendUrl}/parts`);
    await testEvents.clearEvents();

    // Establish SSE connection
    await deploymentSse.resetRequestId();
    const connectionStatus = await deploymentSse.ensureConnected();

    await waitForSseEvent(page, {
      streamId: CONNECTION_STREAM_ID,
      phase: 'open',
      event: 'connected',
      timeoutMs: 15000,
    });

    const requestId = connectionStatus.requestId;
    expect(requestId).toBeTruthy();
    if (!requestId) {
      return;
    }

    // Open AI part dialog
    const addWithAIButton = page.getByTestId('parts.list.add-with-ai');
    await expect(addWithAIButton).toBeVisible();
    await addWithAIButton.click();

    // Wait for dialog to open
    const dialog = page.getByTestId('parts.ai.dialog');
    await expect(dialog).toBeVisible();

    // Enter text and submit
    const inputField = page.getByTestId('parts.ai.input');
    await inputField.fill('10k resistor 0805');

    const submitButton = page.getByTestId('parts.ai.input.submit');
    await submitButton.click();

    // Should be on progress step
    const progressStep = page.getByTestId('parts.ai.progress-step');
    await expect(progressStep).toBeVisible();

    // Wait for subscription event (indicates useSSETask subscribed to task).
    // useSSETask emits this with streamId 'task', distinct from the raw SSE
    // envelope streamId 'task_event'.
    const subscriptionEvent = await waitForSseEvent(page, {
      streamId: 'task',
      phase: 'open',
      event: 'task_subscription',
      timeoutMs: 10000,
    });

    const subscriptionData = extractSseData<{ taskId?: string }>(subscriptionEvent);
    const taskId = subscriptionData?.taskId;
    expect(taskId).toBeTruthy();
    if (!taskId) {
      return;
    }

    // Send progress event
    await page.request.post(`${backendUrl}/api/testing/sse/task-event`, {
      data: {
        request_id: requestId,
        task_id: taskId,
        event_type: 'progress_update',
        data: {
          text: 'Analyzing part description...',
          value: 0.5,
        },
      },
    });

    // Verify progress message is displayed
    const progressMessage = page.getByTestId('parts.ai.progress-message');
    await expect(progressMessage).toContainText('Analyzing part description...');

    // Send completion event with analysis result matching backend schema
    await page.request.post(`${backendUrl}/api/testing/sse/task-event`, {
      data: {
        request_id: requestId,
        task_id: taskId,
        event_type: 'task_completed',
        data: {
          success: true,
          analysis: {
            // Backend schema: AIPartAnalysisTaskResultSchema
            analysis_result: {
              description: '10k Ohm Resistor 0805 SMD',
              manufacturer: 'Generic',
              manufacturer_code: null,
              type: 'Resistor',
              type_is_existing: true,
              existing_type_id: 1,
              tags: ['smd', '0805'],
              documents: [],
              dimensions: null,
              voltage_rating: null,
              mounting_type: 'SMD',
              package: '0805',
              pin_count: 2,
              pin_pitch: null,
              series: null,
              input_voltage: null,
              output_voltage: null,
              product_page: null,
            },
            duplicate_parts: [],
            analysis_failure_reason: null,
          },
          error_message: null,
        },
      },
    });

    // Should transition to review step
    const reviewStep = page.getByTestId('parts.ai.review-step');
    await expect(reviewStep).toBeVisible({ timeout: 5000 });

    // Close the dialog
    const cancelButton = page.getByTestId('parts.ai.review.cancel');
    await cancelButton.click();

    await deploymentSse.disconnect();
  });
});
