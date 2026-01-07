import { expect } from '@playwright/test';
import { test } from '../../support/fixtures';
import { expectConsoleError, makeUnique, makeUniqueToken } from '../../support/helpers';
import type { FormTestEvent, ToastTestEvent, ErrorTestEvent } from '@/types/test-events';

const PART_CREATE_FORM_ID = 'part_create';
const PART_DUPLICATE_FORM_ID = 'part_duplicate';

test.describe('Instrumentation snapshots', () => {
  test('part creation form emits validation and success events', async ({
    page,
    parts,
    testData,
    testEvents,
  }) => {
    const typeName = testData.types.randomTypeName('Instrumentation Type');
    const type = await testData.types.create({ name: typeName });

    await parts.gotoList();
    await testEvents.clearEvents();
    await parts.openNewPartForm();

    await testEvents.waitForEvent(event => event.kind === 'form' && event.formId === PART_CREATE_FORM_ID && event.phase === 'open');

    await parts.formSubmit.click();
    const validationEvent = await testEvents.waitForEvent(event => event.kind === 'form' && event.formId === PART_CREATE_FORM_ID && event.phase === 'validation_error') as FormTestEvent;
    expect(validationEvent.metadata?.field).toBe('description');

    const description = makeUnique('Instrumentation Part');
    await parts.fillBasicForm({ description, manufacturerCode: `INST-${makeUniqueToken(4).toUpperCase()}` });
    await parts.selectType(type.name);

    const createResponsePromise = page.waitForResponse(response => {
      if (response.request().method() !== 'POST') {
        return false;
      }
      try {
        return new URL(response.url()).pathname === '/api/parts';
      } catch {
        return false;
      }
    });
    await parts.formSubmit.click();
    await createResponsePromise;

    await expect.poll(async () => (await parts.getUrl()).includes('/parts/')).toBeTruthy();
    await parts.expectDetailHeading(description);

    const formEvents = (await testEvents.getEvents()).filter(event => event.kind === 'form') as FormTestEvent[];
    const eventPhases = formEvents.map(event => event.phase);
    expect(eventPhases).toEqual(['open', 'validation_error', 'submit', 'success']);
  });

  test('document duplication failures surface toast instrumentation', async ({
    page,
    parts,
    testEvents,
    toastHelper,
    testData,
  }) => {
    const { part } = await testData.parts.create({
      overrides: { description: makeUnique('Document Source') },
    });

    const attachment = await testData.attachments.createUrl(part.key, {
      title: makeUnique('Attachment'),
    });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openCardByKey(part.key);

    await parts.duplicateCurrentPart();
    await expect(parts.formRoot).toBeVisible();

    await testEvents.clearEvents();

    await expectConsoleError(page, /Failed to copy document/i);
    await expectConsoleError(page, /404/);
    await expectConsoleError(page, /Attachment .* was not found/i);
    await testData.attachments.delete(part.key, attachment.id);

    const duplicateResponsePromise = page.waitForResponse(response => {
      if (response.request().method() !== 'POST') {
        return false;
      }
      try {
        return new URL(response.url()).pathname === '/api/parts';
      } catch {
        return false;
      }
    });
    await parts.formSubmit.click();
    await duplicateResponsePromise;

    const errorToast = await testEvents.waitForEvent(event => event.kind === 'toast' && event.level === 'error' && (event as ToastTestEvent).message.toLowerCase().includes('failed to copy')) as ToastTestEvent;
    expect(errorToast.message).toContain('Failed to copy');
    await toastHelper.waitForToastWithText(/attachment .* was not found/i);

    const duplicateEvents = (await testEvents.getEvents()).filter(event => event.kind === 'form' && event.formId === PART_DUPLICATE_FORM_ID) as FormTestEvent[];
    const duplicatePhases = duplicateEvents.map(event => event.phase);
    expect(duplicatePhases).toContain('submit');
    expect(duplicatePhases).toContain('success');
  });

  test('AI analysis failure emits error instrumentation', async ({
    page,
    parts,
    partsAI,
    aiAnalysisMock,
    deploymentSse,
    testEvents,
  }) => {
    await parts.gotoList();
    await parts.waitForCards();
    await parts.openAIDialog();
    await partsAI.waitForOpen();

    await testEvents.clearEvents();

    // Establish SSE connection before creating mock session
    await deploymentSse.resetRequestId();
    await deploymentSse.ensureConnected();

    const aiSession = aiAnalysisMock();

    await partsAI.submitPrompt('Parts instrumentation failure scenario');

    await expectConsoleError(page, /Analysis failed/i);
    await aiSession.emitFailure('Snapshot instrumentation failure');

    await expect(partsAI.progressStep).toHaveAttribute('data-state', 'error');
    await expect(page.getByTestId('parts.ai.progress-error-message')).toContainText('Snapshot instrumentation failure');

    const errorEvent = await testEvents.waitForEvent(event => event.kind === 'error' && event.scope === 'component:ai-part-analysis') as ErrorTestEvent;
    expect(errorEvent.message).toContain('Snapshot instrumentation failure');
  });
});
