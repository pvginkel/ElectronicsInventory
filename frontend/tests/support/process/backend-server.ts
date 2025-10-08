import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import getPort from 'get-port';
import type { Readable } from 'node:stream';
import split2 from 'split2';

const READY_PATH = '/api/health/readyz';
const STARTUP_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

export type BackendServerHandle = {
  readonly url: string;
  readonly port: number;
  readonly process: ChildProcessWithoutNullStreams;
  dispose(): Promise<void>;
};

/**
 * Launches the backend testing server for a given worker.
 * Returns the backend URL along with a dispose hook that terminates the process.
 */
export async function startBackend(
  workerIndex: number,
  options: {
    sqliteDbPath: string;
    streamLogs?: boolean;
    port?: number;
    excludePorts?: number[];
    frontendVersionUrl?: string;
  }
): Promise<BackendServerHandle> {
  if (!options?.sqliteDbPath) {
    throw new Error(
      `${formatPrefix(workerIndex, 'backend')} Missing sqliteDbPath for backend startup`
    );
  }

  const port =
    typeof options.port === 'number'
      ? options.port
      : await getPort({
          exclude: options.excludePorts ?? [],
        });
  const hostname = '127.0.0.1';
  const url = `http://${hostname}:${port}`;

  const scriptPath = resolve(getRepoRoot(), '../backend/scripts/testing-server.sh');
  const args = [
    '--host',
    hostname,
    '--port',
    String(port),
    '--sqlite-db',
    options.sqliteDbPath,
  ];

  const logLifecycle = options.streamLogs === true;
  if (logLifecycle) {
    console.log(
      `${formatPrefix(workerIndex, 'backend')} Starting backend: ${scriptPath} ${args.join(' ')}`
    );
  }

  const childEnv = {
    ...process.env,
    ...(options.frontendVersionUrl
      ? { FRONTEND_VERSION_URL: options.frontendVersionUrl }
      : {}),
  };

  const child = spawn(scriptPath, args, {
    cwd: getRepoRoot(),
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;

  registerForCleanup(child);

  const shouldStreamLogs = options.streamLogs === true;
  if (shouldStreamLogs) {
    streamProcessOutput(child, workerIndex, 'backend');
  }

  const readinessUrl = `${url}${READY_PATH}`;

  await waitForStartup({
    workerIndex,
    process: child,
    readinessUrl,
    serviceLabel: 'backend',
  });

  if (logLifecycle) {
    console.log(`${formatPrefix(workerIndex, 'backend')} Backend ready at ${url}`);
  }

  return {
    url,
    port,
    process: child,
    dispose: () => terminateProcess(child, workerIndex, 'backend'),
  };
}

async function waitForStartup({
  workerIndex,
  process,
  readinessUrl,
  serviceLabel,
}: {
  workerIndex: number;
  process: ChildProcessWithoutNullStreams;
  readinessUrl: string;
  serviceLabel: string;
}) {
  const start = performance.now();

  const exitPromise = new Promise<never>((_, reject) => {
    process.once('exit', (code, signal) => {
      reject(
        new Error(
          `${formatPrefix(workerIndex, serviceLabel)} process exited before ready (code=${code}, signal=${signal})`
        )
      );
    });
    process.once('error', error => {
      reject(
        new Error(
          `${formatPrefix(workerIndex, serviceLabel)} process failed to start: ${error.message}`
        )
      );
    });
  });

  const poll = async () => {
    while (performance.now() - start < STARTUP_TIMEOUT_MS) {
      try {
        const response = await fetch(readinessUrl, {
          method: 'GET',
          cache: 'no-store',
        });
        if (response.ok) {
          return;
        }
      } catch {
        // Service not ready yet; retry until timeout.
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error(
      `${formatPrefix(workerIndex, serviceLabel)} Timed out waiting for readiness at ${readinessUrl}`
    );
  };

  await Promise.race([exitPromise, poll()]);
}

async function terminateProcess(
  child: ChildProcessWithoutNullStreams,
  workerIndex: number,
  serviceLabel: string
) {
  if (child.exitCode !== null || child.signalCode) {
    return;
  }

  const logLifecycle = serviceShouldLogLifecycle(serviceLabel);
  if (logLifecycle) {
    console.log(`${formatPrefix(workerIndex, serviceLabel)} Stopping process (pid=${child.pid})`);
  }

  child.kill('SIGTERM');

  const exited = await waitForExit(child, 5_000);

  if (!exited) {
    console.warn(
      `${formatPrefix(workerIndex, serviceLabel)} Process did not exit after SIGTERM; sending SIGKILL`
    );
    child.kill('SIGKILL');
    await waitForExit(child, 5_000);
  }
}

function streamProcessOutput(
  child: ChildProcessWithoutNullStreams,
  workerIndex: number,
  serviceLabel: string
): void {
  const attach = (stream: Readable, source: 'stdout' | 'stderr') => {
    const lineStream = stream.pipe(split2());
    const prefix = `${formatPrefix(workerIndex, serviceLabel)}[${source}]`;

    const handleLine = (line: string) => {
      process.stdout.write(`${prefix} ${line}\n`);
    };

    lineStream.on('data', handleLine);
    lineStream.on('error', (error: unknown) => {
      process.stdout.write(
        `${prefix} <<stream error>> ${error instanceof Error ? error.message : String(error)}\n`
      );
    });

    const cleanup = () => {
      lineStream.off('data', handleLine);
      lineStream.destroy();
    };

    child.once('exit', cleanup);
    child.once('error', cleanup);
  };

  attach(child.stdout, 'stdout');
  attach(child.stderr, 'stderr');
}

function formatPrefix(workerIndex: number, serviceLabel: string): string {
  return `[worker-${workerIndex} ${serviceLabel}]`;
}

function serviceShouldLogLifecycle(serviceLabel: string): boolean {
  if (serviceLabel === 'backend') {
    return process.env.PLAYWRIGHT_BACKEND_LOG_STREAM === 'true';
  }
  if (serviceLabel === 'frontend') {
    return process.env.PLAYWRIGHT_FRONTEND_LOG_STREAM === 'true';
  }
  return false;
}

async function waitForExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode) {
    return true;
  }

  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolve(false);
    }, timeoutMs);

    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };

    child.once('exit', onExit);
  });
}

let repoRootCache: string | undefined;

function getRepoRoot(): string {
  if (!repoRootCache) {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    repoRootCache = resolve(currentDir, '../../..');
  }
  return repoRootCache;
}

const activeChildren = new Set<ChildProcessWithoutNullStreams>();
let cleanupHookRegistered = false;

function registerForCleanup(child: ChildProcessWithoutNullStreams): void {
  activeChildren.add(child);
  child.once('exit', () => {
    activeChildren.delete(child);
  });

  if (!cleanupHookRegistered) {
    cleanupHookRegistered = true;

    const shutdown = () => {
      for (const proc of activeChildren) {
        try {
          proc.kill('SIGTERM');
        } catch {
          // Ignore cleanup failures; process may already be terminating.
        }
      }
    };

    process.once('exit', shutdown);
    process.once('SIGINT', () => {
      shutdown();
      process.exit(130);
    });
    process.once('SIGTERM', () => {
      shutdown();
      process.exit(143);
    });
  }
}
