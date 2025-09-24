import type { FormTestEvent } from '@/types/test-events';
import { test, expect } from '../../support/fixtures';

const CREATE_FORM_ID = 'type_create';
const EDIT_FORM_ID = 'type_edit';

test.describe('TypeForm instrumentation', () => {
  test('emits open, submit, and success events for create flow', async ({
    types,
    testEvents,
    testData,
  }) => {
    await types.goto();
    await testEvents.clearEvents();

    const typeName = testData.types.randomTypeName('Instrumented');

    await types.createButton.click();
    await testEvents.waitForEvent(event => event.kind === 'form' && event.formId === CREATE_FORM_ID && event.phase === 'open');

    await types.nameInput().fill(typeName);
    await types.submitButton().click();

    await testEvents.waitForEvent(event => event.kind === 'form' && event.formId === CREATE_FORM_ID && event.phase === 'success');

    await expect(types.cardByName(typeName)).toBeVisible();

    await testEvents.assertEventSequence([
      { kind: 'form', formId: CREATE_FORM_ID, phase: 'open' },
      { kind: 'form', formId: CREATE_FORM_ID, phase: 'submit' },
      { kind: 'form', formId: CREATE_FORM_ID, phase: 'success' },
    ]);
  });

  test('captures validation errors when submitting empty create form', async ({ types, testEvents }) => {
    await types.goto();
    await testEvents.clearEvents();

    await types.createButton.click();
    await types.submitButton().click();

    const validationEvent = await testEvents.waitForEvent(event => {
      if (event.kind !== 'form') {
        return false;
      }
      const formEvent = event as FormTestEvent;
      return formEvent.formId === CREATE_FORM_ID &&
        formEvent.phase === 'validation_error' &&
        formEvent.metadata?.field === 'name';
    }) as FormTestEvent;

    expect(validationEvent.metadata?.error).toMatch(/required/i);

    await types.cancelButton().click();
  });

  test('emits instrumentation for edit flow', async ({ types, testEvents, testData }) => {
    const originalName = testData.types.randomTypeName('Original');
    const created = await testData.types.create({ name: originalName });
    const updatedName = testData.types.randomTypeName('Updated');

    await types.goto();
    await testEvents.clearEvents();

    await types.editButtonForCard(created.name).click();
    await testEvents.waitForEvent(event => event.kind === 'form' && event.formId === EDIT_FORM_ID && event.phase === 'open');

    await types.nameInput().clear();
    await types.nameInput().fill(updatedName);
    await types.submitButton().click();

    await testEvents.waitForEvent(event => event.kind === 'form' && event.formId === EDIT_FORM_ID && event.phase === 'success');

    await expect(types.cardByName(updatedName)).toBeVisible();

    await testEvents.assertEventSequence([
      { kind: 'form', formId: EDIT_FORM_ID, phase: 'open' },
      { kind: 'form', formId: EDIT_FORM_ID, phase: 'submit' },
      { kind: 'form', formId: EDIT_FORM_ID, phase: 'success' },
    ]);
  });
});
