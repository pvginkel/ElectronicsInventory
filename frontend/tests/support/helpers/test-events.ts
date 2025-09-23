/// <reference lib="dom" />
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
  timestamp: string;
}

function normalizeEvent(raw: any): TestEvent {
  const timestamp = typeof raw?.timestamp === 'string'
    ? raw.timestamp
    : new Date((typeof raw?.timestamp === 'number' ? raw.timestamp : Date.now())).toISOString();

  return {
    kind: raw?.kind,
    feature: raw?.feature,
    phase: raw?.phase,
    correlationId: raw?.correlationId,
    metadata: raw?.metadata,
    timestamp,
  } satisfies TestEvent;
}

/**
 * Helper class for capturing and asserting TEST_EVT emissions
 */
export class TestEventCapture {
  private events: TestEvent[] = [];
  private isCapturing = false;
  private bufferSize = 100;
  private cursor = 0;

  constructor(private readonly page: Page) {}

  /**
   * Starts capturing TEST_EVT events
   * @param options - Configuration options
   */
  async startCapture(options?: { bufferSize?: number }): Promise<void> {
    this.bufferSize = options?.bufferSize ?? 100;
    this.events = [];

    await this.page.addInitScript(() => {
      const globalAny = globalThis as Record<string, any>;
      if (!('__TEST_SIGNALS__' in globalAny)) {
        globalAny.__TEST_SIGNALS__ = [];
      }
    });

    await this.page.evaluate(() => {
      const globalAny = globalThis as Record<string, any>;
      if (!('__TEST_SIGNALS__' in globalAny)) {
        globalAny.__TEST_SIGNALS__ = [];
      }
    });

    this.cursor = await this.page.evaluate(() => {
      const globalAny = globalThis as Record<string, any>;
      const signals = globalAny.__TEST_SIGNALS__;
      return Array.isArray(signals) ? signals.length : 0;
    });

    this.isCapturing = true;
  }

  /**
   * Stops capturing TEST_EVT events
   */
  async stopCapture(): Promise<void> {
    this.isCapturing = false;
  }

  /**
   * Gets all captured events
   * @returns Array of captured events
   */
  async getEvents(): Promise<TestEvent[]> {
    if (!this.isCapturing) {
      return [...this.events];
    }

    const result = await this.page.evaluate(({ start }) => {
      const globalAny = globalThis as Record<string, any>;
      const signals = globalAny.__TEST_SIGNALS__;
      if (!Array.isArray(signals)) {
        return { events: [], total: 0 };
      }

      return {
        events: signals.slice(start),
        total: signals.length,
      };
    }, { start: this.cursor });

    if (result.total > this.cursor) {
      const newEvents = (result.events ?? []).map(normalizeEvent);
      this.cursor = result.total;
      this.events = [...this.events, ...newEvents].slice(-this.bufferSize);
    }

    return [...this.events];
  }

  /**
   * Clears the event buffer
   */
  async clearEvents(): Promise<void> {
    this.events = [];
    this.cursor = await this.page.evaluate(() => {
      const globalAny = globalThis as Record<string, any>;
      const signals = globalAny.__TEST_SIGNALS__;
      return Array.isArray(signals) ? signals.length : 0;
    });
  }

  /**
   * Waits for a specific event to be emitted
   * @param matcher - Function to match the desired event
   * @param options - Wait options
   * @returns The matched event
   */
  async waitForEvent(
    matcher: (event: TestEvent) => boolean,
    options?: { timeout?: number; intervalMs?: number }
  ): Promise<TestEvent> {
    const timeout = options?.timeout ?? 5000;
    const intervalMs = options?.intervalMs ?? 100;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const events = await this.getEvents();
      const matchedEvent = events.find(matcher);

      if (matchedEvent) {
        return matchedEvent;
      }

      await this.page.waitForTimeout(intervalMs);
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
        const actual = event[key as keyof TestEvent];
        return JSON.stringify(actual) === JSON.stringify(value);
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
          const actual = event[key as keyof TestEvent];
          return JSON.stringify(actual) === JSON.stringify(value);
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
  await page.evaluate(({ evt }) => {
    const globalAny = globalThis as Record<string, any>;
    const payload = {
      ...evt,
      timestamp: new Date().toISOString(),
    };

    const signals = globalAny.__TEST_SIGNALS__;
    if (Array.isArray(signals)) {
      signals.push(payload);
    }

    const message = `TEST_EVT: ${JSON.stringify(payload)}`;
    globalAny.console?.log?.(message);
  }, { evt: event });
}

/**
 * Serializes a pattern for cross-context usage
 */
