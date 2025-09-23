import { Page } from '@playwright/test';

/**
 * TEST_EVT event structure for instrumentation
 */
export interface TestEvent {
  kind: string;
  feature?: string;
  phase?: 'request' | 'success' | 'failure' | 'user-override' | 'start' | 'complete';
  correlationId?: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

/**
 * Helper class for capturing and asserting TEST_EVT emissions
 */
export class TestEventCapture {
  private events: TestEvent[] = [];
  private isCapturing = false;

  constructor(private readonly page: Page) {}

  /**
   * Starts capturing TEST_EVT events
   * @param options - Configuration options
   */
  async startCapture(options?: { bufferSize?: number }): Promise<void> {
    const bufferSize = options?.bufferSize ?? 100;

    await this.page.evaluate((maxSize) => {
      // Store events in window for access
      (window as any).__testEvents = [];
      (window as any).__maxTestEvents = maxSize;

      // Override dispatchEvent to capture TEST_EVT
      const originalDispatch = window.dispatchEvent;
      window.dispatchEvent = function(event: Event) {
        if (event.type === 'TEST_EVT' && 'detail' in event) {
          const testEvents = (window as any).__testEvents;
          const maxEvents = (window as any).__maxTestEvents;

          const eventData = {
            ...(event as CustomEvent).detail,
            timestamp: Date.now(),
          };

          testEvents.push(eventData);

          // Maintain circular buffer
          if (testEvents.length > maxEvents) {
            testEvents.shift();
          }
        }
        return originalDispatch.call(window, event);
      };
    }, bufferSize);

    this.isCapturing = true;
  }

  /**
   * Stops capturing TEST_EVT events
   */
  async stopCapture(): Promise<void> {
    if (!this.isCapturing) {
      return;
    }

    await this.page.evaluate(() => {
      // Restore original dispatchEvent
      const originalDispatch = Object.getPrototypeOf(window).dispatchEvent;
      window.dispatchEvent = originalDispatch;
    });

    this.isCapturing = false;
  }

  /**
   * Gets all captured events
   * @returns Array of captured events
   */
  async getEvents(): Promise<TestEvent[]> {
    if (!this.isCapturing) {
      return this.events;
    }

    const events = await this.page.evaluate(() => {
      return (window as any).__testEvents || [];
    });

    this.events = events;
    return events;
  }

  /**
   * Clears the event buffer
   */
  async clearEvents(): Promise<void> {
    this.events = [];

    if (this.isCapturing) {
      await this.page.evaluate(() => {
        (window as any).__testEvents = [];
      });
    }
  }

  /**
   * Waits for a specific event to be emitted
   * @param matcher - Function to match the desired event
   * @param options - Wait options
   * @returns The matched event
   */
  async waitForEvent(
    matcher: (event: TestEvent) => boolean,
    options?: { timeout?: number }
  ): Promise<TestEvent> {
    const timeout = options?.timeout ?? 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const events = await this.getEvents();
      const matchedEvent = events.find(matcher);

      if (matchedEvent) {
        return matchedEvent;
      }

      await this.page.waitForTimeout(100);
    }

    throw new Error(`Timeout waiting for event matching criteria after ${timeout}ms`);
  }

  /**
   * Asserts that an event with specific properties was emitted
   * @param expectedEvent - Partial event to match
   * @returns The matched event
   */
  async assertEventEmitted(expectedEvent: Partial<TestEvent>): Promise<TestEvent> {
    const events = await this.getEvents();

    const matchedEvent = events.find(event => {
      return Object.entries(expectedEvent).every(([key, value]) => {
        if (value === undefined) {
          return true;
        }
        return JSON.stringify(event[key as keyof TestEvent]) === JSON.stringify(value);
      });
    });

    if (!matchedEvent) {
      throw new Error(
        `No event found matching: ${JSON.stringify(expectedEvent)}\n` +
        `Captured events: ${JSON.stringify(events, null, 2)}`
      );
    }

    return matchedEvent;
  }

  /**
   * Asserts that a sequence of events was emitted in order
   * @param expectedSequence - Array of partial events to match in order
   */
  async assertEventSequence(expectedSequence: Array<Partial<TestEvent>>): Promise<void> {
    const events = await this.getEvents();
    let eventIndex = 0;

    for (const expectedEvent of expectedSequence) {
      let found = false;

      for (let i = eventIndex; i < events.length; i++) {
        const event = events[i];
        const matches = Object.entries(expectedEvent).every(([key, value]) => {
          if (value === undefined) {
            return true;
          }
          return JSON.stringify(event[key as keyof TestEvent]) === JSON.stringify(value);
        });

        if (matches) {
          found = true;
          eventIndex = i + 1;
          break;
        }
      }

      if (!found) {
        throw new Error(
          `Event sequence not matched. Expected: ${JSON.stringify(expectedEvent)}\n` +
          `Remaining events: ${JSON.stringify(events.slice(eventIndex), null, 2)}`
        );
      }
    }
  }

  /**
   * Gets events filtered by kind
   * @param kind - The event kind to filter by
   * @returns Filtered events
   */
  async getEventsByKind(kind: string): Promise<TestEvent[]> {
    const events = await this.getEvents();
    return events.filter(event => event.kind === kind);
  }

  /**
   * Gets events filtered by feature
   * @param feature - The feature to filter by
   * @returns Filtered events
   */
  async getEventsByFeature(feature: string): Promise<TestEvent[]> {
    const events = await this.getEvents();
    return events.filter(event => event.feature === feature);
  }

  /**
   * Gets the most recent event
   * @returns The most recent event or undefined
   */
  async getLastEvent(): Promise<TestEvent | undefined> {
    const events = await this.getEvents();
    return events[events.length - 1];
  }

  /**
   * Counts events matching a criteria
   * @param matcher - Function to match events
   * @returns Count of matching events
   */
  async countEvents(matcher?: (event: TestEvent) => boolean): Promise<number> {
    const events = await this.getEvents();
    if (!matcher) {
      return events.length;
    }
    return events.filter(matcher).length;
  }

  /**
   * Dumps all captured events for debugging
   * @returns Formatted string of all events
   */
  async dumpEvents(): Promise<string> {
    const events = await this.getEvents();
    return JSON.stringify(events, null, 2);
  }
}

/**
 * Creates a TEST_EVT capture helper for a page
 * @param page - The Playwright page
 * @returns TestEventCapture instance
 */
export function createTestEventCapture(page: Page): TestEventCapture {
  return new TestEventCapture(page);
}

/**
 * Emits a TEST_EVT event from the page context
 * @param page - The Playwright page
 * @param event - The event to emit
 */
export async function emitTestEvent(page: Page, event: Omit<TestEvent, 'timestamp'>): Promise<void> {
  await page.evaluate((eventData) => {
    const event = new CustomEvent('TEST_EVT', {
      detail: eventData,
      bubbles: true,
    });
    window.dispatchEvent(event);
  }, event);
}