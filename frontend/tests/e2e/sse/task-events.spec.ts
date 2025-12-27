/**
 * Task SSE event tests verify that task events are correctly routed
 * from the unified SSE stream to subscribers via useSSETask hook.
 *
 * These tests use the /api/testing/sse/task-event endpoint to inject
 * deterministic task events without running actual background tasks.
 */
import { test, expect } from '../../support/fixtures';
import { makeUnique } from '../../support/helpers';
import { waitForSseEvent, extractSseData } from '../../support/helpers/test-events';

const DEPLOYMENT_STREAM_ID = 'deployment.version';
const TASK_STREAM_ID = 'task';

test.describe('Task SSE events', () => {
  test('receives task events through unified SSE stream', async ({
    page,
    frontendUrl,
    backendUrl,
    testEvents,
    deploymentSse,
  }) => {
    // Navigate to page
    await page.goto(frontendUrl);
    await testEvents.clearEvents();

    // Establish SSE connection using the standard pattern
    await deploymentSse.resetRequestId();
    const connectionStatus = await deploymentSse.ensureConnected();

    // Wait for SSE connection event
    const connectedEvent = await waitForSseEvent(page, {
      streamId: DEPLOYMENT_STREAM_ID,
      phase: 'open',
      event: 'connected',
      timeoutMs: 15000,
    });

    const connectionData = extractSseData<{ requestId?: string }>(connectedEvent);
    const requestId = connectionStatus.requestId ?? connectionData?.requestId;
    expect(requestId).toBeTruthy();
    if (!requestId) {
      return;
    }

    // Generate a unique task ID
    const taskId = makeUnique('test-task');

    // Send a task event through the testing endpoint
    const response = await page.request.post(`${backendUrl}/api/testing/sse/task-event`, {
      data: {
        request_id: requestId,
        task_id: taskId,
        event_type: 'progress_update',
        data: {
          text: 'Processing test data...',
          value: 0.5,
        },
      },
    });

    expect(response.ok()).toBe(true);

    // Verify the task event was received
    const taskEvent = await waitForSseEvent(page, {
      streamId: TASK_STREAM_ID,
      phase: 'message',
      event: 'progress_update',
      matcher: (event) => {
        const payload = extractSseData<{ taskId?: string }>(event);
        return payload?.taskId === taskId;
      },
      timeoutMs: 5000,
    });

    expect(taskEvent).toBeTruthy();
    const taskPayload = extractSseData<{ taskId: string; eventType: string; data: unknown }>(taskEvent);
    expect(taskPayload?.taskId).toBe(taskId);
    expect(taskPayload?.eventType).toBe('progress_update');

    await deploymentSse.disconnect();
  });

  test('task events include correct payload structure', async ({
    page,
    frontendUrl,
    backendUrl,
    testEvents,
    deploymentSse,
  }) => {
    await page.goto(frontendUrl);
    await testEvents.clearEvents();

    await deploymentSse.resetRequestId();
    const connectionStatus = await deploymentSse.ensureConnected();

    const connectedEvent = await waitForSseEvent(page, {
      streamId: DEPLOYMENT_STREAM_ID,
      phase: 'open',
      event: 'connected',
      timeoutMs: 15000,
    });

    const connectionData = extractSseData<{ requestId?: string }>(connectedEvent);
    const requestId = connectionStatus.requestId ?? connectionData?.requestId;
    expect(requestId).toBeTruthy();
    if (!requestId) {
      return;
    }

    const taskId = makeUnique('payload-test');

    // Send task_started event
    await page.request.post(`${backendUrl}/api/testing/sse/task-event`, {
      data: {
        request_id: requestId,
        task_id: taskId,
        event_type: 'task_started',
        data: { message: 'Analysis started' },
      },
    });

    const startEvent = await waitForSseEvent(page, {
      streamId: TASK_STREAM_ID,
      phase: 'message',
      event: 'task_started',
      matcher: (event) => extractSseData<{ taskId?: string }>(event)?.taskId === taskId,
      timeoutMs: 5000,
    });

    const startPayload = extractSseData<{ taskId: string; eventType: string; data: { message: string } }>(startEvent);
    expect(startPayload?.eventType).toBe('task_started');
    expect(startPayload?.data?.message).toBe('Analysis started');

    // Send task_completed event
    await page.request.post(`${backendUrl}/api/testing/sse/task-event`, {
      data: {
        request_id: requestId,
        task_id: taskId,
        event_type: 'task_completed',
        data: {
          result: { name: 'Test Part', category: 'Resistor' },
        },
      },
    });

    const completeEvent = await waitForSseEvent(page, {
      streamId: TASK_STREAM_ID,
      phase: 'message',
      event: 'task_completed',
      matcher: (event) => extractSseData<{ taskId?: string }>(event)?.taskId === taskId,
      timeoutMs: 5000,
    });

    const completePayload = extractSseData<{ taskId: string; eventType: string; data: { result: unknown } }>(completeEvent);
    expect(completePayload?.eventType).toBe('task_completed');
    expect(completePayload?.data?.result).toEqual({ name: 'Test Part', category: 'Resistor' });

    await deploymentSse.disconnect();
  });

  test('multiple task events are received in sequence', async ({
    page,
    frontendUrl,
    backendUrl,
    testEvents,
    deploymentSse,
  }) => {
    await page.goto(frontendUrl);
    await testEvents.clearEvents();

    await deploymentSse.resetRequestId();
    const connectionStatus = await deploymentSse.ensureConnected();

    const connectedEvent = await waitForSseEvent(page, {
      streamId: DEPLOYMENT_STREAM_ID,
      phase: 'open',
      event: 'connected',
      timeoutMs: 15000,
    });

    const connectionData = extractSseData<{ requestId?: string }>(connectedEvent);
    const requestId = connectionStatus.requestId ?? connectionData?.requestId;
    expect(requestId).toBeTruthy();
    if (!requestId) {
      return;
    }

    const taskId = makeUnique('sequence-test');

    // Send sequence of events
    const events = [
      { event_type: 'task_started', data: { message: 'Starting' } },
      { event_type: 'progress_update', data: { text: 'Step 1', value: 0.25 } },
      { event_type: 'progress_update', data: { text: 'Step 2', value: 0.50 } },
      { event_type: 'progress_update', data: { text: 'Step 3', value: 0.75 } },
      { event_type: 'task_completed', data: { result: 'done' } },
    ];

    for (const event of events) {
      await page.request.post(`${backendUrl}/api/testing/sse/task-event`, {
        data: {
          request_id: requestId,
          task_id: taskId,
          ...event,
        },
      });

      // Wait for each event to be received
      await waitForSseEvent(page, {
        streamId: TASK_STREAM_ID,
        phase: 'message',
        event: event.event_type,
        matcher: (e) => extractSseData<{ taskId?: string }>(e)?.taskId === taskId,
        timeoutMs: 5000,
      });
    }

    await deploymentSse.disconnect();
  });

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
      streamId: DEPLOYMENT_STREAM_ID,
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

    // Wait for subscription event (indicates useSSETask subscribed to task)
    const subscriptionEvent = await waitForSseEvent(page, {
      streamId: TASK_STREAM_ID,
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
