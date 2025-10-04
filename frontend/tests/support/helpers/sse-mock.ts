/// <reference lib="dom" />
import { Page } from '@playwright/test';
import { makeUniqueToken } from '../helpers';

/**
 * SSE event structure for mocking
 */
export interface SSEEvent {
  event?: string;
  data: string | object;
  id?: string;
  retry?: number;
}

/**
 * SSE mock configuration
 */
export interface SSEMockConfig {
  url: string | RegExp;
  events: SSEEvent[];
  delay?: number;
  connectionDelay?: number;
  autoClose?: boolean;
  closeAfter?: number;
}

interface SerializedPattern {
  type: 'string' | 'regex';
  value: string;
  flags?: string;
}

interface RegisterMockPayload {
  id: string;
  events: SSEEvent[];
  delay?: number;
  connectionDelay?: number;
  autoClose?: boolean;
  closeAfter?: number;
  pattern?: SerializedPattern;
}

const AI_STREAM_PREFIXES = ['/tests/ai-stream/', '/api/testing/ai-mock-stream'];

function normalizeForRegex(prefix: string): string {
  return prefix
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\//g, '\\/');
}

const ALLOWED_STREAM_PATTERNS = AI_STREAM_PREFIXES.map((prefix) => ({
  raw: prefix,
  regexFragment: normalizeForRegex(prefix),
}));

function matchesAllowedAiPattern(pattern: string | RegExp | undefined): boolean {
  if (pattern === undefined) {
    return false;
  }

  if (typeof pattern === 'string') {
    return ALLOWED_STREAM_PATTERNS.some(({ raw }) => pattern.includes(raw));
  }

  const source = pattern.source;
  return ALLOWED_STREAM_PATTERNS.some(({ raw, regexFragment }) => {
    return source.includes(raw) || source.includes(regexFragment);
  });
}

function assertAiStreamUsage(
  pattern: string | RegExp | undefined,
  caller: string,
  options: { allowUndefined?: boolean } = {}
): void {
  if (pattern === undefined) {
    if (options.allowUndefined) {
      return;
    }

    throw new Error(
      `[SSEMocker] ${caller} requires a stream pattern. ` +
      'SSE mocks are restricted to the sanctioned AI analysis flow. '
      + 'See docs/contribute/testing/playwright_developer_guide.md and the testing/no-route-mocks lint rule.'
    );
  }

  if (!matchesAllowedAiPattern(pattern)) {
    throw new Error(
      `[SSEMocker] ${caller} is limited to the sanctioned AI analysis stream. ` +
      'Coordinate backend support instead of adding new SSE mocks. '
      + '(violates testing/no-route-mocks)'
    );
  }
}

const installSSEMocking = () => {
  const globalAny = window as unknown as Record<string, any>;
  if (globalAny.__sseMockingInstalled) {
    return;
  }
  globalAny.__sseMockingInstalled = true;

  const connections: any[] = [];
  const configs: RegisterMockPayload[] = [];

  const getEpochMs = () => {
    // eslint-disable-next-line no-restricted-properties -- capture epoch ms for SSE debugging logs.
    return Date.now();
  };

  function patternMatches(pattern: SerializedPattern | undefined, url: string): boolean {
    if (!pattern) {
      return true;
    }
    if (pattern.type === 'regex') {
      try {
        const regex = new RegExp(pattern.value, pattern.flags || '');
        return regex.test(url);
      } catch (error) {
        console.warn('Invalid regex pattern for SSE mock:', error);
        return false;
      }
    }
    if (pattern.type === 'string') {
      return url.includes(pattern.value);
    }
    return true;
  }

  class MockEventSource extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;

    readonly url: string;
    readonly withCredentials: boolean;
    readyState: number = MockEventSource.CONNECTING;
    onopen: ((this: EventSource, ev: Event) => unknown) | null = null;
    onmessage: ((this: EventSource, ev: MessageEvent<any>) => unknown) | null = null;
    onerror: ((this: EventSource, ev: Event) => unknown) | null = null;

    private readonly connectionRecord: any;
    private readonly appliedConfigIds = new Set<string>();

    constructor(url: string, config?: EventSourceInit) {
      super();
      this.url = url;
      this.withCredentials = Boolean(config?.withCredentials);

      const record: Record<string, any> = {
        url,
        readyState: this.readyState,
        events: [] as Array<{ type: string; data: any; timestamp: number }>,
        opened: getEpochMs(),
      };

      Object.defineProperty(record, 'eventSource', {
        value: this,
        enumerable: false,
        configurable: false,
        writable: false,
      });

      this.connectionRecord = record;
      connections.push(record);

      queueMicrotask(() => {
        if (this.readyState !== MockEventSource.CONNECTING) {
          return;
        }
        this.readyState = MockEventSource.OPEN;
        this.connectionRecord.readyState = this.readyState;
        this.dispatchEvent(new Event('open'));
      });

      configs.forEach(configEntry => {
        this.applyMockConfig(configEntry);
      });
    }

    emitMockEvent(eventInit: SSEEvent): void {
      if (this.readyState === MockEventSource.CLOSED) {
        return;
      }

      const data = typeof eventInit.data === 'string'
        ? eventInit.data
        : JSON.stringify(eventInit.data ?? {});

      const messageEvent = new MessageEvent(eventInit.event ?? 'message', {
        data,
        lastEventId: eventInit.id,
      });

      this.dispatchEvent(messageEvent);
    }

    applyMockConfig(configEntry: RegisterMockPayload): void {
      if (this.appliedConfigIds.has(configEntry.id)) {
        return;
      }

      if (!patternMatches(configEntry.pattern, this.url)) {
        return;
      }

      this.appliedConfigIds.add(configEntry.id);

      const run = () => {
        configEntry.events.forEach((eventInit, index) => {
          const perEventDelay = (configEntry.delay ?? 0) * index;
          const scheduleDelay = Math.max(0, perEventDelay);
          setTimeout(() => this.emitMockEvent(eventInit), scheduleDelay);
        });

        if (configEntry.autoClose && typeof configEntry.closeAfter === 'number') {
          setTimeout(() => this.close(), configEntry.closeAfter);
        }
      };

      const initialDelay = Math.max(0, configEntry.connectionDelay ?? 0);
      setTimeout(run, initialDelay);
    }

    close(): void {
      if (this.readyState === MockEventSource.CLOSED) {
        return;
      }
      this.readyState = MockEventSource.CLOSED;
      this.connectionRecord.readyState = this.readyState;
      this.connectionRecord.closed = getEpochMs();
      this.dispatchEvent(new Event('close'));
    }

    override dispatchEvent(event: Event): boolean {
      const result = EventTarget.prototype.dispatchEvent.call(this, event);

      if (event.type === 'open') {
        this.readyState = MockEventSource.OPEN;
      } else if (event.type === 'error' || event.type === 'close') {
        this.readyState = MockEventSource.CLOSED;
      }

      this.connectionRecord.readyState = this.readyState;
      (this.connectionRecord.events as Array<{ type: string; data: any; timestamp: number }>).push({
        type: event.type,
        data: (event as MessageEvent).data ?? null,
        timestamp: getEpochMs(),
      });

      const handler = (this as unknown as Record<string, unknown>)[`on${event.type}`];
      if (typeof handler === 'function') {
        (handler as (ev: Event) => unknown).call(this, event);
      }

      return result;
    }
  }

  globalAny.__sseConnections = connections;
  globalAny.__sseMockConfigs = configs;

  globalAny.__registerSSEMockConfig = (configEntry: RegisterMockPayload) => {
    configs.push(configEntry);
    connections.forEach(connection => {
      const source = connection.eventSource as MockEventSource | undefined;
      if (source) {
        source.applyMockConfig(configEntry);
      }
    });
  };

  globalAny.__emitSSEEvent = (pattern: SerializedPattern | undefined, eventInit: SSEEvent) => {
    connections.forEach(connection => {
      const source = connection.eventSource as MockEventSource | undefined;
      if (!source) {
        return;
      }
      if (!patternMatches(pattern, connection.url)) {
        return;
      }
      source.emitMockEvent(eventInit);
    });
  };

  globalAny.__emitSSEControlEvent = (pattern: SerializedPattern | undefined, type: string) => {
    connections.forEach(connection => {
      const source = connection.eventSource as MockEventSource | undefined;
      if (!source) {
        return;
      }
      if (!patternMatches(pattern, connection.url)) {
        return;
      }
      source.dispatchEvent(new Event(type));
    });
  };

  globalAny.__closeSSEConnections = (pattern: SerializedPattern | undefined) => {
    connections.forEach(connection => {
      const source = connection.eventSource as MockEventSource | undefined;
      if (!source) {
        return;
      }
      if (pattern && !patternMatches(pattern, connection.url)) {
        return;
      }
      source.close();
    });
  };

  globalAny.__resetSSEMocks = () => {
    connections.splice(0, connections.length);
    configs.splice(0, configs.length);
  };

  globalAny.EventSource = MockEventSource as unknown as typeof EventSource;
};

function serializePattern(pattern: string | RegExp | undefined): SerializedPattern | undefined {
  if (pattern === undefined) {
    return undefined;
  }
  if (pattern instanceof RegExp) {
    return { type: 'regex', value: pattern.source, flags: pattern.flags };
  }
  return { type: 'string', value: pattern };
}

function serializeEvent(event: SSEEvent): SSEEvent {
  if (typeof event.data === 'string') {
    return event;
  }
  return {
    ...event,
    data: event.data,
  };
}

/**
 * Helper class for mocking Server-Sent Events
 */
export class SSEMocker {
  private isSetup = false;
  private configCounter = 0;

  constructor(private readonly page: Page) {}

  private createMockId(): string {
    return `sse-mock-${makeUniqueToken(12)}-${this.configCounter++}`;
  }

  private async ensureSetup(): Promise<void> {
    if (this.isSetup) {
      await this.page.evaluate(installSSEMocking);
      return;
    }

    await this.page.addInitScript(installSSEMocking);
    await this.page.evaluate(installSSEMocking);
    this.isSetup = true;
  }

  /**
   * Ensures the SSE mocking harness is installed for the current page
   */
  async setupSSEMonitoring(): Promise<void> {
    await this.ensureSetup();
  }

  /**
   * Sets up SSE mocking for a specific endpoint
   * @param config - SSE mock configuration
   */
  async mockSSE(config: SSEMockConfig): Promise<void> {
    await this.ensureSetup();

    assertAiStreamUsage(config.url, 'mockSSE');

    const payload: RegisterMockPayload = {
      id: this.createMockId(),
      events: config.events,
      delay: config.delay,
      connectionDelay: config.connectionDelay,
      autoClose: config.autoClose,
      closeAfter: config.closeAfter,
      pattern: serializePattern(config.url),
    };

    await this.page.evaluate(({ mockConfig }) => {
      const globalAny = window as unknown as Record<string, any>;
      if (typeof globalAny.__registerSSEMockConfig !== 'function') {
        throw new Error('SSE mocking is not initialized on the page context');
      }
      globalAny.__registerSSEMockConfig(mockConfig);
    }, { mockConfig: payload });
  }

  /**
   * Sends an SSE event to all active streams matching a pattern
   * @param urlPattern - Pattern to match streams
   * @param event - Event to send
   */
  async sendEvent(urlPattern: string | RegExp | undefined, event: SSEEvent): Promise<void> {
    await this.ensureSetup();

    assertAiStreamUsage(urlPattern, 'sendEvent');

    await this.page.evaluate(({ pattern, eventInit }) => {
      const globalAny = window as unknown as Record<string, any>;
      if (typeof globalAny.__emitSSEEvent !== 'function') {
        throw new Error('SSE mocking is not initialized on the page context');
      }
      globalAny.__emitSSEEvent(pattern, eventInit);
    }, {
      pattern: serializePattern(urlPattern),
      eventInit: serializeEvent(event),
    });
  }

  /**
   * Waits for an SSE connection that matches the provided pattern.
   */
  async waitForConnection(
    urlPattern: string | RegExp | undefined,
    options?: { timeout?: number }
  ): Promise<void> {
    await this.ensureSetup();

    assertAiStreamUsage(urlPattern, 'waitForConnection');

    const timeout = options?.timeout ?? 10000;
    const pattern = serializePattern(urlPattern);

    await this.page.waitForFunction((serializedPattern: SerializedPattern | undefined) => {
      const globalAny = window as unknown as Record<string, any>;
      const connections = globalAny.__sseConnections;
      if (!Array.isArray(connections)) {
        return false;
      }

      const matchesPattern = (url: string) => {
        if (!serializedPattern) {
          return true;
        }
        if (serializedPattern.type === 'regex') {
          try {
            const regex = new RegExp(serializedPattern.value, serializedPattern.flags || '');
            return regex.test(url);
          } catch {
            return false;
          }
        }
        if (serializedPattern.type === 'string') {
          return url.includes(serializedPattern.value);
        }
        return false;
      };

      return connections.some((connection: Record<string, unknown>) => {
        if (!connection || typeof connection !== 'object') {
          return false;
        }
        const url = connection.url as string | undefined;
        const readyState = connection.readyState as number | undefined;
        if (typeof url !== 'string') {
          return false;
        }
        return matchesPattern(url) && readyState === EventSource.OPEN;
      });
    }, pattern, { timeout });
  }

  /**
   * Closes SSE streams that match an optional pattern.
   */
  async closeStreams(urlPattern?: string | RegExp): Promise<void> {
    await this.ensureSetup();

    assertAiStreamUsage(urlPattern, 'closeStreams', { allowUndefined: true });

    await this.page.evaluate((pattern: SerializedPattern | undefined) => {
      const globalAny = window as unknown as Record<string, any>;
      if (typeof globalAny.__closeSSEConnections === 'function') {
        globalAny.__closeSSEConnections(pattern);
      }
    }, serializePattern(urlPattern));
  }

  /**
   * Closes all active SSE streams
   */
  closeAllStreams(): void {
    void this.closeStreams().catch(() => {
      // noop - page context may already be shutting down
    });
  }

}

/**
 * Creates an SSE mocker for a page
 * @param page - The Playwright page
 * @returns SSEMocker instance
 */
// Deployment streams must use the real backend; this helper stays for the sanctioned AI analysis mock only.
// Additional mocks violate the testing/no-route-mocks lint rule—coordinate backend support instead.
export function createSSEMocker(page: Page): SSEMocker {
  return new SSEMocker(page);
}
