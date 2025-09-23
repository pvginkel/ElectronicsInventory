import { Page, Route, Locator } from '@playwright/test';

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

/**
 * Helper class for mocking Server-Sent Events
 */
export class SSEMocker {
  private activeStreams: Map<string, { controller: AbortController; config: SSEMockConfig }> = new Map();

  constructor(private readonly page: Page) {}

  /**
   * Sets up SSE mocking for a specific endpoint
   * @param config - SSE mock configuration
   */
  async mockSSE(config: SSEMockConfig): Promise<void> {
    await this.page.route(config.url, async (route) => {
      await this.handleSSERoute(route, config);
    });
  }

  /**
   * Handles an SSE route
   * @param route - The intercepted route
   * @param config - SSE configuration
   */
  private async handleSSERoute(route: Route, config: SSEMockConfig): Promise<void> {
    const streamId = `${Date.now()}-${Math.random()}`;
    const controller = new AbortController();

    this.activeStreams.set(streamId, { controller, config });

    // Initial connection delay
    if (config.connectionDelay) {
      await new Promise(resolve => setTimeout(resolve, config.connectionDelay));
    }

    const chunks: string[] = [];

    // Add SSE headers
    chunks.push('HTTP/1.1 200 OK\r\n');
    chunks.push('Content-Type: text/event-stream\r\n');
    chunks.push('Cache-Control: no-cache\r\n');
    chunks.push('Connection: keep-alive\r\n');
    chunks.push('Access-Control-Allow-Origin: *\r\n');
    chunks.push('\r\n');

    // Send initial response headers
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
      body: this.formatSSEEvents(config.events),
    });

    // Clean up if auto-close is enabled
    if (config.autoClose && config.closeAfter) {
      setTimeout(() => {
        this.closeStream(streamId);
      }, config.closeAfter);
    }
  }

  /**
   * Formats events for SSE transmission
   * @param events - Array of events to format
   * @returns Formatted SSE string
   */
  private formatSSEEvents(events: SSEEvent[]): string {
    return events.map(event => this.formatSSEEvent(event)).join('');
  }

  /**
   * Formats a single SSE event
   * @param event - The event to format
   * @returns Formatted SSE event string
   */
  private formatSSEEvent(event: SSEEvent): string {
    let formatted = '';

    if (event.id) {
      formatted += `id: ${event.id}\n`;
    }

    if (event.event) {
      formatted += `event: ${event.event}\n`;
    }

    if (event.retry) {
      formatted += `retry: ${event.retry}\n`;
    }

    const data = typeof event.data === 'object' ? JSON.stringify(event.data) : event.data;

    // Split data by newlines and send each line separately
    const lines = data.split('\n');
    lines.forEach(line => {
      formatted += `data: ${line}\n`;
    });

    formatted += '\n'; // Empty line to signal end of event

    return formatted;
  }

  /**
   * Sends an SSE event to all active streams matching a pattern
   * @param _urlPattern - Pattern to match streams (unused in mock)
   * @param event - Event to send
   */
  async sendEvent(_urlPattern: string | RegExp, event: SSEEvent): Promise<void> {
    // In a real implementation, this would send to active connections
    // For testing, we'll emit a custom event on the page
    await this.page.evaluate((eventData) => {
      window.dispatchEvent(new CustomEvent('mock-sse-event', {
        detail: eventData,
      }));
    }, event);
  }

  /**
   * Simulates an SSE connection error
   * @param urlPattern - Pattern to match streams
   */
  async simulateError(urlPattern: string | RegExp): Promise<void> {
    await this.page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('mock-sse-error', {
        detail: { error: 'Connection lost' },
      }));
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

    await this.page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('mock-sse-reconnect', {
        detail: { status: 'reconnected' },
      }));
    });
  }

  /**
   * Closes an SSE stream
   * @param streamId - ID of the stream to close
   */
  private closeStream(streamId: string): void {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.controller.abort();
      this.activeStreams.delete(streamId);
    }
  }

  /**
   * Closes all active SSE streams
   */
  closeAllStreams(): void {
    this.activeStreams.forEach((_stream, id) => {
      this.closeStream(id);
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
      event: 'deployment',
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
      event: 'notification',
      data: {
        type,
        message,
        ...metadata,
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Mocks a typical SSE lifecycle with heartbeats
   * @param url - URL to mock
   * @param heartbeatInterval - Interval between heartbeats in ms
   * @param additionalEvents - Additional events to send
   */
  async mockSSEWithHeartbeat(
    url: string | RegExp,
    heartbeatInterval: number = 30000,
    additionalEvents?: SSEEvent[]
  ): Promise<void> {
    const events: SSEEvent[] = [];

    // Initial connection event
    events.push({
      event: 'connected',
      data: { status: 'connected', timestamp: Date.now() },
    });

    // Add heartbeats
    for (let i = 0; i < 3; i++) {
      events.push(SSEMocker.createHeartbeatEvent());
    }

    // Add any additional events
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
   * Sets up monitoring for SSE connections in the page
   */
  async setupSSEMonitoring(): Promise<void> {
    await this.page.evaluate(() => {
      // Store original EventSource
      const OriginalEventSource = window.EventSource;

      // Track all EventSource instances
      (window as any).__sseConnections = [];

      // Override EventSource constructor
      window.EventSource = class MockEventSource extends OriginalEventSource {
        constructor(url: string, config?: EventSourceInit) {
          super(url, config);

          const connection = {
            url,
            readyState: this.readyState,
            events: [] as any[],
            opened: Date.now(),
            closed: null as number | null,
          };

          (window as any).__sseConnections.push(connection);

          // Monitor events
          this.addEventListener('message', (event) => {
            connection.events.push({
              type: 'message',
              data: event.data,
              timestamp: Date.now(),
            });
          });

          this.addEventListener('error', (event) => {
            connection.events.push({
              type: 'error',
              timestamp: Date.now(),
            });
          });

          this.addEventListener('open', (event) => {
            connection.readyState = this.readyState;
            connection.events.push({
              type: 'open',
              timestamp: Date.now(),
            });
          });
        }
      };
    });
  }

  /**
   * Gets information about SSE connections
   * @returns Array of connection information
   */
  async getSSEConnections(): Promise<any[]> {
    return this.page.evaluate(() => {
      return (window as any).__sseConnections || [];
    });
  }

  /**
   * Simulates a deployment version update
   * @param newVersion - The new version number
   * @param options - Simulation options
   */
  async simulateDeploymentUpdate(
    newVersion: string,
    options?: {
      changelog?: string;
      delay?: number;
      showBanner?: boolean;
    }
  ): Promise<void> {
    // Wait for any specified delay
    if (options?.delay) {
      await this.page.waitForTimeout(options.delay);
    }

    // Create deployment event
    const deploymentEvent = SSEMocker.createDeploymentEvent(
      newVersion,
      options?.changelog || `Application updated to version ${newVersion}`
    );

    // Send the deployment event
    await this.sendEvent(/.*/, deploymentEvent);

    // If banner should be shown, trigger it
    if (options?.showBanner !== false) {
      await this.page.evaluate((version) => {
        // Dispatch a custom event that the app might listen to
        window.dispatchEvent(new CustomEvent('deployment-update', {
          detail: {
            version,
            timestamp: Date.now(),
          },
        }));

        // Also update any version indicators in localStorage/sessionStorage
        localStorage.setItem('app-version', version);
        sessionStorage.setItem('deployment-notification-shown', 'true');
      }, newVersion);
    }
  }

  /**
   * Simulates multiple deployment updates in sequence
   * @param versions - Array of versions to simulate
   * @param interval - Time between updates in ms
   */
  async simulateDeploymentSequence(
    versions: string[],
    interval: number = 5000
  ): Promise<void> {
    for (const version of versions) {
      await this.simulateDeploymentUpdate(version);
      if (version !== versions[versions.length - 1]) {
        await this.page.waitForTimeout(interval);
      }
    }
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
  async waitForDeploymentBanner(options?: { timeout?: number }): Promise<Locator> {
    const timeout = options?.timeout ?? 10000;
    const banner = this.page.locator(
      '[data-testid="deployment-banner"], .deployment-notification, [role="alert"][data-deployment]'
    ).first();

    await banner.waitFor({ state: 'visible', timeout });
    return banner;
  }
}

/**
 * Creates an SSE mocker for a page
 * @param page - The Playwright page
 * @returns SSEMocker instance
 */
export function createSSEMocker(page: Page): SSEMocker {
  return new SSEMocker(page);
}