/**
 * SharedWorker for multiplexing version SSE connection across browser tabs
 *
 * This worker maintains a single EventSource connection to the version SSE endpoint
 * and broadcasts updates to all connected tabs via MessagePort. When the last tab
 * disconnects, the worker closes the SSE connection to conserve resources.
 */

// Type definitions for worker messages

interface TestEventMetadata {
  kind: 'sse';
  streamId: string;
  phase: 'open' | 'message' | 'error' | 'close';
  event: string;
  data?: unknown;
}

type WorkerMessage =
  | { type: 'connected'; requestId: string; __testEvent?: TestEventMetadata }
  | { type: 'version'; version: string; correlationId?: string; requestId?: string; __testEvent?: TestEventMetadata }
  | { type: 'disconnected'; reason?: string; __testEvent?: TestEventMetadata }
  | { type: 'error'; error: string; __testEvent?: TestEventMetadata };

type TabCommand =
  | { type: 'connect'; requestId: string; isTestMode?: boolean }
  | { type: 'disconnect' };

interface VersionEvent {
  version: string;
  correlation_id?: string;
  correlationId?: string;
  request_id?: string;
  requestId?: string;
  [key: string]: unknown;
}

// Worker state
const ports = new Set<MessagePort>();
const portTestModeMap = new WeakMap<MessagePort, boolean>();
let eventSource: EventSource | null = null;
let currentVersion: string | null = null;
let currentRequestId: string | null = null;
let retryCount = 0;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;
const maxRetryDelay = 60000; // 60 seconds

/**
 * Broadcast a message to all connected tabs
 */
function broadcast(message: WorkerMessage, testEventOnly = false): void {
  ports.forEach(port => {
    if (testEventOnly && !portTestModeMap.get(port)) {
      // Skip non-test-mode ports when broadcasting test events
      return;
    }
    try {
      port.postMessage(message);
    } catch (error) {
      console.error('Version SSE worker: Failed to post message to port:', error);
      // Port may be closed; remove it
      ports.delete(port);
    }
  });
}

/**
 * Create test event metadata for instrumentation
 */
function createTestEvent(
  phase: 'open' | 'message' | 'error' | 'close',
  event: string,
  data?: unknown
): TestEventMetadata {
  return {
    kind: 'sse',
    streamId: 'deployment.version',
    phase,
    event,
    data,
  };
}

/**
 * Close the SSE connection and clean up resources
 */
function closeConnection(): void {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  currentVersion = null;
  currentRequestId = null;
  retryCount = 0;
}

/**
 * Schedule reconnection with exponential backoff
 */
function scheduleReconnect(): void {
  // Don't retry if no tabs are connected
  if (ports.size === 0) {
    closeConnection();
    return;
  }

  // Clear any existing retry timeout
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }

  retryCount++;
  const delay = Math.min(1000 * Math.pow(2, retryCount - 1), maxRetryDelay);

  console.debug(`Version SSE worker: Scheduling reconnection in ${delay}ms (attempt ${retryCount})`);

  retryTimeout = setTimeout(() => {
    if (ports.size > 0 && currentRequestId) {
      createEventSource(currentRequestId);
    }
  }, delay);
}

/**
 * Create EventSource connection to version SSE endpoint
 */
function createEventSource(requestId: string): void {
  // Clean up existing connection
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  currentRequestId = requestId;

  // Build SSE URL with request_id parameter
  const params = new URLSearchParams({ request_id: requestId });
  const url = `/api/sse/utils/version?${params.toString()}`;

  console.debug(`Version SSE worker: Creating EventSource for requestId=${requestId}`);

  eventSource = new EventSource(url);

  eventSource.onopen = () => {
    console.debug('Version SSE worker: SSE connection opened');
    retryCount = 0;

    const message: WorkerMessage = {
      type: 'connected',
      requestId,
    };

    // Include test event metadata for test-mode tabs
    const hasTestModePorts = Array.from(ports).some(port => portTestModeMap.get(port));
    if (hasTestModePorts) {
      message.__testEvent = createTestEvent('open', 'connected', {
        requestId,
        correlationId: requestId,
      });
    }

    broadcast(message);
  };

  eventSource.addEventListener('version', (event) => {
    try {
      const versionData: VersionEvent = JSON.parse(event.data);
      currentVersion = versionData.version;

      console.debug(`Version SSE worker: Received version=${currentVersion}`);

      const correlation = versionData.correlationId ?? versionData.correlation_id ?? requestId;

      const message: WorkerMessage = {
        type: 'version',
        version: versionData.version,
        correlationId: correlation,
        requestId: versionData.requestId ?? versionData.request_id ?? requestId,
      };

      // Include test event metadata for test-mode tabs
      const hasTestModePorts = Array.from(ports).some(port => portTestModeMap.get(port));
      if (hasTestModePorts) {
        message.__testEvent = createTestEvent('message', 'version', {
          ...versionData,
          requestId: message.requestId,
          correlationId: correlation,
        });
      }

      broadcast(message);
    } catch (parseError) {
      console.error('Version SSE worker: Failed to parse version event:', parseError);
      // Disconnect and reconnect on invalid event
      closeConnection();
      scheduleReconnect();
    }
  });

  eventSource.addEventListener('connection_close', (event) => {
    try {
      const data = JSON.parse(event.data);
      console.debug('Version SSE worker: Connection closed by backend:', data.reason);
    } catch {
      // Ignore parse errors for connection_close
    }

    // Reset current version on connection close
    currentVersion = null;
    closeConnection();
  });

  eventSource.onerror = (event) => {
    console.error('Version SSE worker: EventSource error:', event);

    const errorMessage: WorkerMessage = {
      type: 'error',
      error: 'SSE connection error',
    };

    // Include test event metadata for test-mode tabs
    const hasTestModePorts = Array.from(ports).some(port => portTestModeMap.get(port));
    if (hasTestModePorts) {
      errorMessage.__testEvent = createTestEvent('error', 'error', {
        error: 'SSE connection error',
      });
    }

    broadcast(errorMessage);

    // Reset current version on error
    currentVersion = null;

    // Schedule reconnection with exponential backoff
    scheduleReconnect();
  };
}

/**
 * Handle tab connection
 */
function handleConnect(port: MessagePort, requestId: string, isTestMode = false): void {
  console.debug(`Version SSE worker: Tab connected (${ports.size + 1} active ports)`);

  // Track test mode for this port
  if (isTestMode) {
    portTestModeMap.set(port, true);
  }

  // Add port to connected set
  ports.add(port);

  // If this is the first connection, create SSE connection with the provided requestId.
  // Subsequent tabs share the existing connection (their requestId is ignored).
  if (!eventSource) {
    createEventSource(requestId);
  } else if (eventSource.readyState === EventSource.OPEN) {
    // SSE already connected - send connected message to new tab
    const connectedMessage: WorkerMessage = {
      type: 'connected',
      requestId: currentRequestId!,
    };

    // Include test event metadata if tab is in test mode
    if (isTestMode) {
      connectedMessage.__testEvent = createTestEvent('open', 'connected', {
        requestId: currentRequestId,
        correlationId: currentRequestId,
      });
    }

    try {
      port.postMessage(connectedMessage);
    } catch (error) {
      console.error('Version SSE worker: Failed to send connected message to new tab:', error);
      ports.delete(port);
      return;
    }

    // If we have a cached version, send it immediately to new tab
    if (currentVersion && currentRequestId) {
      const versionMessage: WorkerMessage = {
        type: 'version',
        version: currentVersion,
        requestId: currentRequestId,
      };

      // Include test event metadata if tab is in test mode
      if (isTestMode) {
        versionMessage.__testEvent = createTestEvent('message', 'version', {
          version: currentVersion,
          requestId: currentRequestId,
          correlationId: currentRequestId,
        });
      }

      try {
        port.postMessage(versionMessage);
      } catch (error) {
        console.error('Version SSE worker: Failed to send cached version to new tab:', error);
        ports.delete(port);
      }
    }
  }
  // If eventSource exists but is CONNECTING, the new tab will receive the 'connected'
  // message when the SSE opens (via broadcast in onopen handler)
}

/**
 * Handle tab disconnection
 */
function handleDisconnect(port: MessagePort): void {
  ports.delete(port);
  portTestModeMap.delete(port);

  console.debug(`Version SSE worker: Tab disconnected (${ports.size} active ports)`);

  // If no more tabs are connected, close the SSE connection
  if (ports.size === 0) {
    console.debug('Version SSE worker: Last tab disconnected, closing SSE connection');
    closeConnection();
  }
}

/**
 * SharedWorker onconnect handler
 */
self.addEventListener('connect', (event) => {
  const messageEvent = event as MessageEvent;
  const port = messageEvent.ports[0];

  port.onmessage = (messageEvent: MessageEvent<TabCommand>) => {
    const command = messageEvent.data;

    switch (command.type) {
      case 'connect':
        handleConnect(port, command.requestId, command.isTestMode);
        break;

      case 'disconnect':
        handleDisconnect(port);
        break;

      default:
        console.warn('Version SSE worker: Unknown command:', command);
    }
  };

  // Handle port closure (browser may not always send explicit disconnect)
  port.addEventListener('messageerror', () => {
    console.debug('Version SSE worker: Port message error, removing port');
    handleDisconnect(port);
  });

  port.start();
});

console.debug('Version SSE worker: Initialized');
