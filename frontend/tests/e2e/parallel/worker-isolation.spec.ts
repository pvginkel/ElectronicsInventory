import { test, expect } from '../../support/fixtures';
import type { TestEvent } from '../../../src/types/test-events';
import type { TestEventCapture } from '../../support/helpers/test-events';

async function waitForListStateSuccess(testEvents: TestEventCapture) {
  await testEvents.waitForEvent(
    (event: TestEvent) => event.kind === 'list_loading' && event.scope === 'types.list' && event.phase === 'loading'
  );
  await testEvents.waitForEvent(
    (event: TestEvent) => event.kind === 'list_loading' && event.scope === 'types.list' && event.phase === 'ready'
  );
}

test.describe.parallel('Per-worker backend isolation', () => {
  const typeName = 'Worker Isolation Type';

  test('worker A creates the canonical type', async ({ types, testEvents, testData }) => {
    await testEvents.clearEvents();
    await types.goto();
    await waitForListStateSuccess(testEvents);

    await testEvents.clearEvents();
    await types.createType(typeName);
    await waitForListStateSuccess(testEvents);

    const created = await testData.types.findByName(typeName);
    expect(created.name).toBe(typeName);
  });

  test('worker B can recreate the same type without conflicts', async ({ types, testEvents, testData }) => {
    await testEvents.clearEvents();
    await types.goto();
    await waitForListStateSuccess(testEvents);

    await testEvents.clearEvents();
    await types.createType(typeName);
    await waitForListStateSuccess(testEvents);

    const created = await testData.types.findByName(typeName);
    expect(created.name).toBe(typeName);
  });
});
