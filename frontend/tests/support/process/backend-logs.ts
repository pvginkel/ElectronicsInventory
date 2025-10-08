import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Readable } from 'node:stream';
import type { TestInfo } from '@playwright/test';
import split2 from 'split2';

const LOG_ATTACHMENT_NAME = 'backend.log';

export interface BackendLogAttachment {
  readonly filePath: string;
  stop(): Promise<void>;
}

export interface BackendLogCollector {
  attachStream(stream: Readable, source: 'stdout' | 'stderr'): void;
  log(message: string): void;
  attachToTest(testInfo: TestInfo): Promise<BackendLogAttachment>;
  getBufferedLines(): string[];
  dispose(): void;
}

export function createBackendLogCollector(options: {
  workerIndex: number;
  streamToConsole: boolean;
}): BackendLogCollector {
  return new Collector(options.workerIndex, options.streamToConsole);
}

class Collector implements BackendLogCollector {
  private readonly listeners = new Set<(line: string) => void>();
  private readonly disposers: Array<() => void> = [];
  private readonly buffer: string[] = [];

  constructor(
    private readonly workerIndex: number,
    private readonly streamToConsole: boolean
  ) {}

  attachStream(stream: Readable, source: 'stdout' | 'stderr') {
    const lineStream = stream.pipe(split2());

    const handleLine = (line: string) => {
      this.pushLine(source, line);
    };

    lineStream.on('data', handleLine);
    lineStream.on('error', (error: unknown) => {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      this.pushLine('stderr', `<<stream error>> ${message}`);
    });

    this.disposers.push(() => {
      lineStream.off('data', handleLine);
      lineStream.destroy();
    });
  }

  log(message: string) {
    this.pushLine('meta', message);
  }

  async attachToTest(testInfo: TestInfo): Promise<BackendLogAttachment> {
    const filePath = testInfo.outputPath(LOG_ATTACHMENT_NAME);
    await mkdir(dirname(filePath), { recursive: true });

    const stream = createWriteStream(filePath, {
      flags: 'a',
      encoding: 'utf8',
    });

    const write = (line: string) => {
      stream.write(`${line}\n`);
    };

    // Replay existing buffer so the attachment includes startup logs.
    for (const line of this.buffer) {
      write(line);
    }

    this.listeners.add(write);

    return {
      filePath,
      stop: async () => {
        this.listeners.delete(write);

        await new Promise<void>((resolve, reject) => {
          stream.end((err: Error | null | undefined) => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          });
        });

        await testInfo.attach(LOG_ATTACHMENT_NAME, {
          path: filePath,
          contentType: 'text/plain',
        });
      },
    };
  }

  dispose() {
    for (const dispose of this.disposers) {
      dispose();
    }
    this.listeners.clear();
  }

  getBufferedLines(): string[] {
    return [...this.buffer];
  }

  private pushLine(source: string, line: string) {
    const formatted = `[worker-${this.workerIndex}][${source}] ${line}`;
    this.buffer.push(formatted);

    if (this.streamToConsole) {
      process.stdout.write(`${formatted}\n`);
    }

    for (const listener of this.listeners) {
      listener(formatted);
    }
  }
}
