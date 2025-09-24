import { expect, test } from '@playwright/test';
import type { FormTestEvent } from '@/types/test-events';
import { TestEventBuffer } from '../support/helpers/test-events';

let counter = 0;

function createFormEvent(overrides: Partial<FormTestEvent> = {}): FormTestEvent {
  const baseTimestamp = Date.now() + counter++;
  return {
    kind: 'form',
    phase: 'submit',
    formId: `TestForm_${counter}`,
    fields: {},
    timestamp: new Date(baseTimestamp).toISOString(),
    ...overrides,
  } satisfies FormTestEvent;
}

test.describe('TestEventBuffer', () => {
  test('enforces capacity and drops oldest events', () => {
    const buffer = new TestEventBuffer(3);

    buffer.addEvent(createFormEvent({ metadata: { index: 0 } }));
    buffer.addEvent(createFormEvent({ metadata: { index: 1 } }));
    buffer.addEvent(createFormEvent({ metadata: { index: 2 } }));
    buffer.addEvent(createFormEvent({ metadata: { index: 3 } }));
    buffer.addEvent(createFormEvent({ metadata: { index: 4 } }));

    const snapshot = buffer.snapshot(0);

    expect(snapshot.total).toBe(5);
    expect(snapshot.events).toHaveLength(3);
    const formEvents = snapshot.events as FormTestEvent[];
    const indexes = formEvents.map(event => event.metadata?.index);
    expect(indexes).toEqual([2, 3, 4]);
  });

  test('resolves waiters against existing events immediately', async () => {
    const buffer = new TestEventBuffer();
    buffer.addEvent(createFormEvent({ metadata: { status: 'ready' } }));

    const result = await buffer.waitForEvent(event => (event as FormTestEvent).metadata?.status === 'ready', 1000);
    const formEvent = result as FormTestEvent;
    expect(formEvent.metadata?.status).toBe('ready');
  });

  test('resolves waiters when matching event arrives later', async () => {
    const buffer = new TestEventBuffer();

    const waiter = buffer.waitForEvent(event => (event as FormTestEvent).metadata?.match === true, 1000);
    buffer.addEvent(createFormEvent({ metadata: { match: true } }));

    const result = await waiter;
    const formEvent = result as FormTestEvent;
    expect(formEvent.metadata?.match).toBe(true);
  });

  test('rejects waiters when timeout elapses without a match', async () => {
    const buffer = new TestEventBuffer();

    await expect(buffer.waitForEvent(() => false, 50)).rejects.toThrow(/Timeout/);
  });
});
