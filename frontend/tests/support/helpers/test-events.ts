import type { TestEvent } from '@/types/test-events';
import { Page } from '@playwright/test';

const DEFAULT_BUFFER_CAPACITY = 500;
const PLAYWRIGHT_BINDING_NAME = '__playwright_emitTestEvent';

type Waiter = {
  matcher: (event: TestEvent) => boolean;
  resolve: (event: TestEvent) => void;
  timeoutId?: NodeJS.Timeout;
};

function normalizeEvent(raw: any): TestEvent {
  const timestamp = typeof raw?.timestamp === 'string'
    ? raw.timestamp
    : new Date((typeof raw?.timestamp === 'number' ? raw.timestamp : Date.now())).toISOString();

  return {
    ...raw,
    timestamp,
  } as TestEvent;
}

export class TestEventBuffer {
  private events: TestEvent[] = [];
  private dropped = 0;
  private capacity: number;
  private waiters: Waiter[] = [];
  private overflowError: Error | null = null;

  constructor(capacity: number = DEFAULT_BUFFER_CAPACITY) {
    this.capacity = Math.max(capacity, 1);
  }

  setCapacity(capacity: number): void {
    this.capacity = Math.max(capacity, 1);
    this.trimIfNeeded();
  }

  addEvent(event: TestEvent): void {
    const normalized = normalizeEvent(event);
    this.events.push(normalized);
    this.trimIfNeeded();
    this.notifyWaiters(normalized);
  }

  clear(): void {
    this.events = [];
    this.dropped = 0;
    this.overflowError = null;
  }

  getOverflowError(): Error | null {
    return this.overflowError;
  }

  snapshot(cursor: number): { events: TestEvent[]; total: number } {
    const total = this.dropped + this.events.length;
    const relativeStart = Math.max(cursor - this.dropped, 0);
    const events = relativeStart < this.events.length
      ? this.events.slice(relativeStart)
      : [];
    return { events, total };
  }

  getTotalCount(): number {
    return this.dropped + this.events.length;
  }

  async waitForEvent(
    matcher: (event: TestEvent) => boolean,
    timeout: number
  ): Promise<TestEvent> {
    const existing = this.events.find(matcher);
    if (existing) {
      return existing;
    }

    return new Promise<TestEvent>((resolve, reject) => {
      const waiter: Waiter = {
        matcher,
        resolve: (event) => {
          if (waiter.timeoutId) {
            clearTimeout(waiter.timeoutId);
          }
          resolve(event);
        },
      };

      if (timeout > 0) {
        waiter.timeoutId = setTimeout(() => {
          this.removeWaiter(waiter);
          reject(new Error(`Timeout waiting for event matching criteria after ${timeout}ms`));
        }, timeout);
      }

      this.waiters.push(waiter);
    });
  }

  dispose(): void {
    for (const waiter of this.waiters) {
      if (waiter.timeoutId) {
        clearTimeout(waiter.timeoutId);
      }
    }
    this.waiters = [];
    this.clear();
  }

  private trimIfNeeded(): void {
    if (this.events.length <= this.capacity) {
      return;
    }

    const overflow = this.events.length - this.capacity;
    this.events.splice(0, overflow);
    this.dropped += overflow;

    // Set error on first overflow
    if (!this.overflowError) {
      this.overflowError = new Error(
        `Test event buffer overflow! Buffer capacity (${this.capacity}) exceeded. ` +
        `${overflow} event(s) were dropped. Total events dropped: ${this.dropped}. ` +
        `Consider increasing buffer capacity or reducing event volume in this test.`
      );
    }
  }

  private notifyWaiters(event: TestEvent): void {
    if (this.waiters.length === 0) {
      return;
    }

    const remaining: Waiter[] = [];

    for (const waiter of this.waiters) {
      if (waiter.matcher(event)) {
        waiter.resolve(event);
        continue;
      }

      remaining.push(waiter);
    }

    this.waiters = remaining;
  }

  private removeWaiter(waiter: Waiter): void {
    this.waiters = this.waiters.filter(candidate => candidate !== waiter);
  }
}

const bufferRegistry = new WeakMap<Page, TestEventBuffer>();
const bindingRegistry = new WeakSet<Page>();

export async function ensureTestEventBridge(page: Page): Promise<TestEventBuffer> {
  let buffer = bufferRegistry.get(page);

  if (!buffer) {
    buffer = new TestEventBuffer(DEFAULT_BUFFER_CAPACITY);
    bufferRegistry.set(page, buffer);
  }

  if (!bindingRegistry.has(page)) {
    try {
      await page.exposeBinding(PLAYWRIGHT_BINDING_NAME, async (_source, rawEvent) => {
        buffer!.addEvent(rawEvent as TestEvent);
      });
      bindingRegistry.add(page);
    } catch (error) {
      bufferRegistry.delete(page);
      throw new Error(
        `Failed to register Playwright test event binding: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  buffer.setCapacity(DEFAULT_BUFFER_CAPACITY);
  return buffer;
}

export function releaseTestEventBridge(page: Page): void {
  const buffer = bufferRegistry.get(page);
  if (buffer) {
    buffer.dispose();
  }
  bufferRegistry.delete(page);
  bindingRegistry.delete(page);
}

export function getTestEventBuffer(page: Page): TestEventBuffer {
  const buffer = bufferRegistry.get(page);
  if (!buffer) {
    throw new Error('Test event bridge not initialized for this page. Ensure the testEvents fixture is registered.');
  }
  return buffer;
}

export class TestEventCapture {
  private events: TestEvent[] = [];
  private isCapturing = false;
  private bufferSize = DEFAULT_BUFFER_CAPACITY;
  private cursor = 0;

  constructor(private readonly buffer: TestEventBuffer) {}

  async startCapture(options?: { bufferSize?: number }): Promise<void> {
    this.bufferSize = Math.max(options?.bufferSize ?? DEFAULT_BUFFER_CAPACITY, 1);
    this.events = [];
    this.cursor = this.buffer.getTotalCount();
    this.isCapturing = true;
  }

  async stopCapture(): Promise<void> {
    this.isCapturing = false;
  }

  async getEvents(): Promise<TestEvent[]> {
    if (this.isCapturing) {
      const snapshot = this.buffer.snapshot(this.cursor);
      if (snapshot.total > this.cursor) {
        const newEvents = snapshot.events.map(normalizeEvent);
        this.cursor = snapshot.total;
        this.events = [...this.events, ...newEvents].slice(-this.bufferSize);
      }
    }

    return [...this.events];
  }

  async clearEvents(): Promise<void> {
    this.events = [];
    this.cursor = this.buffer.getTotalCount();
  }

  async waitForEvent(
    matcher: (event: TestEvent) => boolean,
    options?: { timeout?: number; intervalMs?: number }
  ): Promise<TestEvent> {
    const timeout = options?.timeout ?? 5000;
    const events = await this.getEvents();
    const existing = events.find(matcher);

    if (existing) {
      return existing;
    }

    return this.buffer.waitForEvent(matcher, timeout);
  }

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

  async getEventsByKind(kind: string): Promise<TestEvent[]> {
    const events = await this.getEvents();
    return events.filter(event => event.kind === kind);
  }

  async getEventsByFeature(feature: string): Promise<TestEvent[]> {
    const events = await this.getEvents();
    return events.filter(event => {
      const candidate = event as unknown as { feature?: string };
      return candidate.feature === feature;
    });
  }

  async getLastEvent(): Promise<TestEvent | undefined> {
    const events = await this.getEvents();
    return events[events.length - 1];
  }

  async countEvents(matcher?: (event: TestEvent) => boolean): Promise<number> {
    const events = await this.getEvents();
    if (!matcher) {
      return events.length;
    }
    return events.filter(matcher).length;
  }

  async dumpEvents(): Promise<string> {
    const events = await this.getEvents();
    return JSON.stringify(events, null, 2);
  }
}

export function createTestEventCapture(page: Page): TestEventCapture {
  const buffer = getTestEventBuffer(page);
  return new TestEventCapture(buffer);
}

export async function emitTestEvent(page: Page, event: Omit<TestEvent, 'timestamp'>): Promise<void> {
  await page.evaluate(async ({ evt, binding }) => {
    const globalAny = globalThis as Record<string, any>;
    const payload = {
      ...evt,
      timestamp: new Date().toISOString(),
    };

    const bridge = globalAny[binding];

    if (typeof bridge !== 'function') {
      throw new Error('Playwright test event binding is not registered on the page.');
    }

    await bridge(payload);
  }, { evt: event, binding: PLAYWRIGHT_BINDING_NAME });
}

export function unregisterTestEventBuffer(page: Page): void {
  releaseTestEventBridge(page);
}

export { DEFAULT_BUFFER_CAPACITY as TEST_EVENT_BUFFER_CAPACITY };
