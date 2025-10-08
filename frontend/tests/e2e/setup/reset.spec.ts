import { test, expect } from '../../support/fixtures';
import type { TestEvent, ListLoadingTestEvent } from '../../../src/types/test-events';

function hasListEvent(events: TestEvent[], scope: string, phase: ListLoadingTestEvent['phase']): boolean {
  return events.some(event => {
    if (event.kind !== 'list_loading') {
      return false;
    }
    return event.scope === scope && event.phase === phase;
  });
}

test.describe.parallel('Seed dataset bootstrap', () => {
  test('boxes list shows seeded inventory', async ({ boxes, testEvents, backendLogs }) => {
    await testEvents.clearEvents();
    await boxes.gotoList();

    const events = await testEvents.getEvents();
    expect(hasListEvent(events, 'boxes.list', 'loading')).toBeTruthy();
    expect(hasListEvent(events, 'boxes.list', 'ready')).toBeTruthy();

    await boxes.expectCardVisible(1);
    await boxes.expectCardVisible(10);

    const logLines = backendLogs.getBufferedLines();
    expect(logLines.some(line => line.includes('load-test-data') || line.includes('Test data loaded successfully'))).toBeTruthy();
  });

  test('parts list includes seeded shift register', async ({ parts, testEvents }) => {
    await testEvents.clearEvents();
    await parts.gotoList();
    await parts.waitForCards();

    const events = await testEvents.getEvents();
    expect(hasListEvent(events, 'parts.list', 'loading')).toBeTruthy();
    expect(hasListEvent(events, 'parts.list', 'ready')).toBeTruthy();

    await expect(parts.cardByKey('ABCD')).toBeVisible();
    await expect(parts.cardByDescription(/shift register/i)).toBeVisible();
  });
});
