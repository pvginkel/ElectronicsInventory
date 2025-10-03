/**
 * Deployment banner coverage targets the real backend SSE stream and seeds
 * both the baseline snapshot and the follow-up update through the testing API.
 */
import { test, expect } from '../../support/fixtures';
import { makeUnique } from '../../support/helpers';
import { extractSseData, waitForSseEvent } from '../../support/helpers/test-events';

const DEPLOYMENT_STREAM_ID = 'deployment.version';

test.describe('Deployment banner streaming', () => {
test('surfaces backend-driven deployment updates', async ({
  page,
  frontendUrl,
  backendUrl,
  testEvents,
  appShell,
  deploymentSse,
}) => {
    await page.goto(frontendUrl);

    await testEvents.clearEvents();

    // Manually opt into the deployment SSE stream for deterministic coverage.
    await deploymentSse.resetRequestId();
    const connectionStatus = await deploymentSse.ensureConnected();

    const openEvent = await waitForSseEvent(page, {
      streamId: DEPLOYMENT_STREAM_ID,
      phase: 'open',
      event: 'connected',
      timeoutMs: 15000,
    });

    const connectionData = extractSseData<{ requestId?: string; correlationId?: string }>(openEvent);
    const requestId = connectionStatus.requestId ?? connectionData?.requestId ?? null;
    expect(requestId).toBeTruthy();
    if (!requestId) {
      return;
    }

    const baselineVersion = makeUnique('baseline');
    const versionLabel = makeUnique('playwright');

    const baselineResponse = await page.request.post(`${backendUrl}/api/testing/deployments/version`, {
      data: {
        request_id: requestId,
        version: baselineVersion,
      },
    });

    expect(baselineResponse.ok()).toBeTruthy();

    await waitForSseEvent(page, {
      streamId: DEPLOYMENT_STREAM_ID,
      phase: 'message',
      event: 'version',
      matcher: event => {
        const payload = extractSseData<{ correlationId?: string; correlation_id?: string; version?: string }>(event);
        const correlation = payload?.correlationId ?? payload?.correlation_id;
        return correlation === requestId && payload?.version === baselineVersion;
      },
      timeoutMs: 15000,
    });

    const triggerResponse = await page.request.post(`${backendUrl}/api/testing/deployments/version`, {
      data: {
        request_id: requestId,
        version: versionLabel,
      },
    });

    expect(triggerResponse.ok()).toBeTruthy();

    const payloadEvent = await waitForSseEvent(page, {
      streamId: DEPLOYMENT_STREAM_ID,
      phase: 'message',
      event: 'version',
      matcher: event => {
        const payload = extractSseData<{
          correlationId?: string;
          correlation_id?: string;
          version?: string;
        }>(event);
        const correlation = payload?.correlationId ?? payload?.correlation_id;
        if (correlation !== requestId) {
          return false;
        }

        return payload?.version === versionLabel;
      },
      timeoutMs: 15000,
    });

    const payload = extractSseData<{
      correlationId?: string;
      correlation_id?: string;
      requestId?: string;
      request_id?: string;
      version?: string;
    }>(payloadEvent);
    const correlation = payload?.correlationId ?? payload?.correlation_id;
    expect(correlation).toBe(requestId);
    expect(payload?.version).toBe(versionLabel);

    const bannerMessage = page.getByText('A new version of the app is available.', { exact: false });
    await expect(bannerMessage).toBeVisible();
    await expect(appShell.deploymentReloadButton).toBeVisible();

    const navigationPromise = page.waitForNavigation({ waitUntil: 'load' });
    await appShell.deploymentReloadButton.click();
    await navigationPromise;
    await testEvents.clearEvents();
    await deploymentSse.ensureConnected();
    await waitForSseEvent(page, {
      streamId: DEPLOYMENT_STREAM_ID,
      phase: 'open',
      event: 'connected',
      timeoutMs: 15000,
    });

    await expect(page.locator('[data-testid="deployment.banner"]')).toHaveCount(0);

    await deploymentSse.disconnect();
  });
});
