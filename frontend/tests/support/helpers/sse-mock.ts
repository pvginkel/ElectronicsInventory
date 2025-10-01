/// <reference lib="dom" />
import { Page } from '@playwright/test';

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

const installSSEMocking = () => {
  const globalAny = window as unknown as Record<string, any>;
  if (globalAny.__sseMockingInstalled) {
    return;
  }
  globalAny.__sseMockingInstalled = true;

  const connections: any[] = [];
  const configs: RegisterMockPayload[] = [];

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
        opened: Date.now(),
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
      this.connectionRecord.closed = Date.now();
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
        timestamp: Date.now(),
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

    const payload: RegisterMockPayload = {
      id: `sse-mock-${Date.now()}-${this.configCounter++}`,
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
   * Handles SSE mocks with heartbeat and optional additional events
   */
  async mockSSEWithHeartbeat(
    url: string | RegExp,
    heartbeatInterval: number = 30000,
    additionalEvents?: SSEEvent[]
  ): Promise<void> {
    const events: SSEEvent[] = [];

    events.push({
      event: 'connected',
      data: { status: 'connected', timestamp: Date.now() },
    });

    for (let i = 0; i < 3; i++) {
      events.push(SSEMocker.createHeartbeatEvent());
    }

    if (additionalEvents) {
      events.push(...additionalEvents);
    }

    await this.mockSSE({
      url,
      events,
      delay: heartbeatInterval,
      autoClose: true,
      closeAfter: heartbeatInterval * 3,
    });
  }

  /**
   * Sends an SSE event to all active streams matching a pattern
   * @param urlPattern - Pattern to match streams
   * @param event - Event to send
   */
  async sendEvent(urlPattern: string | RegExp | undefined, event: SSEEvent): Promise<void> {
    await this.ensureSetup();

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
   * Simulates an SSE connection error
   * @param urlPattern - Pattern to match streams
   */
  async simulateError(urlPattern: string | RegExp): Promise<void> {
    await this.ensureSetup();

    await this.page.evaluate(({ pattern }) => {
      const globalAny = window as unknown as Record<string, any>;
      if (typeof globalAny.__emitSSEControlEvent !== 'function') {
        throw new Error('SSE mocking is not initialized on the page context');
      }
      globalAny.__emitSSEControlEvent(pattern, 'error');
    }, {
      pattern: serializePattern(urlPattern),
    });
  }

  /**
   * Simulates SSE reconnection
   * @param urlPattern - Pattern to match streams
   * @param delay - Reconnection delay in ms
   */
  async simulateReconnection(urlPattern: string | RegExp, delay: number = 1000): Promise<void> {
    await this.simulateError(urlPattern);
    await this.page.waitForTimeout(delay);

    await this.ensureSetup();

    await this.page.evaluate(({ pattern }) => {
      const globalAny = window as unknown as Record<string, any>;
      if (typeof globalAny.__emitSSEControlEvent !== 'function') {
        throw new Error('SSE mocking is not initialized on the page context');
      }
      globalAny.__emitSSEControlEvent(pattern, 'open');
    }, {
      pattern: serializePattern(urlPattern),
    });
  }

  /**
   * Gets information about SSE connections
   * @returns Array of connection information
   */
  async getSSEConnections(): Promise<any[]> {
    await this.ensureSetup();
    return this.page.evaluate(() => {
      const globalAny = window as unknown as Record<string, any>;
      return (globalAny.__sseConnections || []).map((connection: Record<string, unknown>) => ({
        url: connection.url,
        readyState: connection.readyState,
        events: connection.events,
        opened: connection.opened,
        closed: connection.closed ?? null,
      }));
    });
  }

  /**
   * Checks if deployment banner is visible
   * @returns True if banner is visible
   */
  async isDeploymentBannerVisible(): Promise<boolean> {
    const bannerSelectors = [
      '[data-testid="deployment-banner"]',
      '.deployment-notification',
      '[role="alert"][data-deployment]',
      '.update-banner',
    ];

    for (const selector of bannerSelectors) {
      if (await this.page.locator(selector).isVisible()) {
        return true;
      }
    }

    return false;
  }

  /**
   * Dismisses deployment banner if visible
   */
  async dismissDeploymentBanner(): Promise<void> {
    const dismissSelectors = [
      '[data-testid="deployment-banner"] button',
      '.deployment-notification button[aria-label="Close"]',
      '[role="alert"][data-deployment] button',
      '.update-banner .close',
    ];

    for (const selector of dismissSelectors) {
      const button = this.page.locator(selector);
      if (await button.isVisible()) {
        await button.click();
        return;
      }
    }
  }

  /**
   * Waits for deployment banner to appear
   * @param options - Wait options
   * @returns The banner element
   */
  async waitForDeploymentBanner(options?: { timeout?: number }) {
    const timeout = options?.timeout ?? 10000;
    const banner = this.page.locator(
      '[data-testid="deployment-banner"], .deployment-notification, [role="alert"][data-deployment]'
    ).first();

    await banner.waitFor({ state: 'visible', timeout });
    return banner;
  }

  /**
   * Closes SSE streams that match an optional pattern.
   */
  async closeStreams(urlPattern?: string | RegExp): Promise<void> {
    await this.ensureSetup();

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

  /**
   * Creates a heartbeat event
   * @param data - Optional heartbeat data
   * @returns SSE event for heartbeat
   */
  static createHeartbeatEvent(data?: any): SSEEvent {
    return {
      event: 'heartbeat',
      data: data || { timestamp: Date.now() },
    };
  }

  /**
   * Creates a deployment notification event
   * @param version - New version
   * @param changelog - Optional changelog
   * @returns SSE event for deployment
   */
  static createDeploymentEvent(version: string, changelog?: string): SSEEvent {
    return {
      event: 'version',
      data: {
        version,
        changelog: changelog || `Version ${version} deployed`,
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Creates a generic notification event
   * @param type - Notification type
   * @param message - Notification message
   * @param metadata - Additional metadata
   * @returns SSE event for notification
   */
  static createNotificationEvent(
    type: string,
    message: string,
    metadata?: Record<string, any>
  ): SSEEvent {
    return {
      event: type,
      data: {
        type,
        message,
        ...metadata,
        timestamp: Date.now(),
      },
    };
  }
}

/**
 * Creates an SSE mocker for a page
 * @param page - The Playwright page
 * @returns SSEMocker instance
 */
// Deployment streams must use the real backend; this helper stays for documented AI analysis mocks only.
export function createSSEMocker(page: Page): SSEMocker {
  return new SSEMocker(page);
}
