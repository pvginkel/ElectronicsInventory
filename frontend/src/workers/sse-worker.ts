/**
 * SharedWorker for multiplexing unified SSE connection across browser tabs
 *
 * This worker maintains a single EventSource connection to the unified SSE endpoint
 * and broadcasts both version and task events to all connected tabs via MessagePort.
 * When the last tab disconnects, the worker closes the SSE connection to conserve resources.
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
  | { type: 'task_event'; taskId: string; eventType: string; data: unknown; __testEvent?: TestEventMetadata }
  | { type: 'disconnected'; reason?: string; __testEvent?: TestEventMetadata }
  | { type: 'error'; error: string; __testEvent?: TestEventMetadata };

type TabCommand =
  | { type: 'connect'; isTestMode?: boolean }
  | { type: 'disconnect' };

interface VersionEvent {
  version: string;
  correlation_id?: string;
  correlationId?: string;
  request_id?: string;
  requestId?: string;
  [key: string]: unknown;
}

interface TaskEvent {
  task_id: string;
  event_type: string;
  data: unknown;
}

// Token generation utility (inline version of makeUniqueToken)
const TOKEN_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
function makeUniqueToken(length = 32): string {
  let token = '';
  for (let i = 0; i < length; i++) {
    token += TOKEN_CHARS.charAt(Math.floor(Math.random() * TOKEN_CHARS.length));
  }
  return token;
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
  streamId: string,
  phase: 'open' | 'message' | 'error' | 'close',
  event: string,
  data?: unknown
): TestEventMetadata {
  return {
    kind: 'sse',
    streamId,
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
    if (ports.size > 0) {
      createEventSource();
    }
  }, delay);
}

/**
 * Create EventSource connection to unified SSE endpoint
 */
function createEventSource(): void {
  // Clean up existing connection
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  // Generate worker-owned request ID if not already set
  if (!currentRequestId) {
    currentRequestId = makeUniqueToken(32);
  }

  // Build SSE URL with request_id parameter
  const params = new URLSearchParams({ request_id: currentRequestId });
  const url = `/api/sse/stream?${params.toString()}`;

  console.debug(`SSE worker: Creating EventSource for requestId=${currentRequestId}`);

  eventSource = new EventSource(url);

  eventSource.onopen = () => {
    console.debug('SSE worker: SSE connection opened');
    retryCount = 0;

    const message: WorkerMessage = {
      type: 'connected',
      requestId: currentRequestId!,
    };

    // Include test event metadata for test-mode tabs
    const hasTestModePorts = Array.from(ports).some(port => portTestModeMap.get(port));
    if (hasTestModePorts) {
      message.__testEvent = createTestEvent('deployment.version', 'open', 'connected', {
        requestId: currentRequestId,
        correlationId: currentRequestId,
      });
    }

    broadcast(message);
  };

  eventSource.addEventListener('version', (event) => {
    try {
      const versionData: VersionEvent = JSON.parse(event.data);
      currentVersion = versionData.version;

      console.debug(`SSE worker: Received version=${currentVersion}`);

      const correlation = versionData.correlationId ?? versionData.correlation_id ?? currentRequestId!;

      const message: WorkerMessage = {
        type: 'version',
        version: versionData.version,
        correlationId: correlation,
        requestId: versionData.requestId ?? versionData.request_id ?? currentRequestId!,
      };

      // Include test event metadata for test-mode tabs
      const hasTestModePorts = Array.from(ports).some(port => portTestModeMap.get(port));
      if (hasTestModePorts) {
        message.__testEvent = createTestEvent('deployment.version', 'message', 'version', {
          ...versionData,
          requestId: message.requestId,
          correlationId: correlation,
        });
      }

      broadcast(message);
    } catch (parseError) {
      console.error('SSE worker: Failed to parse version event:', parseError);
      // Disconnect and reconnect on invalid event
      closeConnection();
      scheduleReconnect();
    }
  });

  eventSource.addEventListener('task_event', (event) => {
    try {
      const taskData: TaskEvent = JSON.parse(event.data);

      console.debug(`SSE worker: Received task_event for task=${taskData.task_id}, type=${taskData.event_type}`);

      const message: WorkerMessage = {
        type: 'task_event',
        taskId: taskData.task_id,
        eventType: taskData.event_type,
        data: taskData.data,
      };

      // Include test event metadata for test-mode tabs
      const hasTestModePorts = Array.from(ports).some(port => portTestModeMap.get(port));
      if (hasTestModePorts) {
        message.__testEvent = createTestEvent('task', 'message', taskData.event_type, {
          taskId: taskData.task_id,
          eventType: taskData.event_type,
          data: taskData.data,
        });
      }

      broadcast(message);
    } catch (parseError) {
      console.error('SSE worker: Failed to parse task_event:', parseError);
      // Don't disconnect on task event parse errors - other events may still work
    }
  });

  eventSource.addEventListener('connection_close', (event) => {
    try {
      const data = JSON.parse(event.data);
      console.debug('SSE worker: Connection closed by backend:', data.reason);
    } catch {
      // Ignore parse errors for connection_close
    }

    // Reset current version on connection close
    currentVersion = null;
    closeConnection();
  });

  eventSource.onerror = (event) => {
    console.error('SSE worker: EventSource error:', event);

    const errorMessage: WorkerMessage = {
      type: 'error',
      error: 'SSE connection error',
    };

    // Include test event metadata for test-mode tabs
    const hasTestModePorts = Array.from(ports).some(port => portTestModeMap.get(port));
    if (hasTestModePorts) {
      errorMessage.__testEvent = createTestEvent('deployment.version', 'error', 'error', {
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
function handleConnect(port: MessagePort, isTestMode = false): void {
  console.debug(`SSE worker: Tab connected (${ports.size + 1} active ports)`);

  // Track test mode for this port
  if (isTestMode) {
    portTestModeMap.set(port, true);
  }

  // Add port to connected set
  ports.add(port);

  // If this is the first connection, create SSE connection with worker-generated requestId.
  // Subsequent tabs share the existing connection.
  if (!eventSource) {
    createEventSource();
  } else if (eventSource.readyState === EventSource.OPEN) {
    // SSE already connected - send connected message to new tab
    const connectedMessage: WorkerMessage = {
      type: 'connected',
      requestId: currentRequestId!,
    };

    // Include test event metadata if tab is in test mode
    if (isTestMode) {
      connectedMessage.__testEvent = createTestEvent('deployment.version', 'open', 'connected', {
        requestId: currentRequestId,
        correlationId: currentRequestId,
      });
    }

    try {
      port.postMessage(connectedMessage);
    } catch (error) {
      console.error('SSE worker: Failed to send connected message to new tab:', error);
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
        versionMessage.__testEvent = createTestEvent('deployment.version', 'message', 'version', {
          version: currentVersion,
          requestId: currentRequestId,
          correlationId: currentRequestId,
        });
      }

      try {
        port.postMessage(versionMessage);
      } catch (error) {
        console.error('SSE worker: Failed to send cached version to new tab:', error);
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

  console.debug(`SSE worker: Tab disconnected (${ports.size} active ports)`);

  // If no more tabs are connected, close the SSE connection
  if (ports.size === 0) {
    console.debug('SSE worker: Last tab disconnected, closing SSE connection');
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
        handleConnect(port, command.isTestMode);
        break;

      case 'disconnect':
        handleDisconnect(port);
        break;

      default:
        console.warn('SSE worker: Unknown command:', command);
    }
  };

  // Handle port closure (browser may not always send explicit disconnect)
  port.addEventListener('messageerror', () => {
    console.debug('SSE worker: Port message error, removing port');
    handleDisconnect(port);
  });

  port.start();
});

console.debug('SSE worker: Initialized');
