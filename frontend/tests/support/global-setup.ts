import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBackendUrl } from './backend-url';

async function globalSetup() {
  const playwrightManagedServices = process.env.PLAYWRIGHT_MANAGED_SERVICES !== 'false';

  console.log('🔧 Setting up Playwright tests...');
  console.log(
    `Service management: ${playwrightManagedServices ? 'Per-worker (Playwright managed)' : 'External'}`
  );

  // Skip health checks when worker fixtures handle process orchestration.
  if (playwrightManagedServices) {
    const seededDbPath = await initializeSeedDatabase();
    process.env.PLAYWRIGHT_SEEDED_SQLITE_DB = seededDbPath;
    console.log(`🗃️  Seeded Playwright SQLite database: ${seededDbPath}`);
    console.log('⏭️ Skipping health checks - worker fixtures boot services on demand');
    return;
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3100';
  const backendUrl = getBackendUrl();
  
  console.log(`Frontend URL: ${frontendUrl}`);
  console.log(`Backend URL: ${backendUrl}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log('🌐 Checking service readiness...');

  // Check backend health
  try {
    const response = await page.goto(`${backendUrl}/api/health/readyz`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    if (!response?.ok()) {
      throw new Error(`Backend health check failed: ${response?.status()}`);
    }
    console.log('✅ Backend is ready');
  } catch (error) {
    console.error('❌ Backend health check failed:', error);
    await browser.close();
    throw error;
  }

  // Check frontend
  try {
    const response = await page.goto(frontendUrl, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    if (!response?.ok()) {
      throw new Error(`Frontend check failed: ${response?.status()}`);
    }
    console.log('✅ Frontend is ready');
  } catch (error) {
    console.error('❌ Frontend check failed:', error);
    await browser.close();
    throw error;
  }

  await browser.close();
  console.log('🚀 All services ready, starting tests...');
}

export default globalSetup;

async function initializeSeedDatabase(): Promise<string> {
  const repoRoot = getRepoRoot();
  const tmpRoot = await mkdtemp(join(tmpdir(), 'electronics-seed-'));
  const dbPath = join(tmpRoot, 'seed.sqlite');
  const scriptPath = resolve(repoRoot, '../backend/scripts/initialize-sqlite-database.sh');

  await runScript(scriptPath, ['--db', dbPath, '--load-test-data'], {
    cwd: repoRoot,
  });

  return dbPath;
}

async function runScript(
  command: string,
  args: readonly string[],
  options: { cwd: string }
): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.on('data', chunk => {
        stdout += chunk.toString();
      });
    }
    if (child.stderr) {
      child.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });
    }

    child.on('error', rejectPromise);
    child.on('exit', code => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
      if (output) {
        console.error(`initialize-sqlite-database.sh failed output:\n${output}`);
      }
      rejectPromise(
        new Error(
          `${command} exited with code ${code ?? 'null'} while initializing Playwright database`
        )
      );
    });
  });
}

let repoRootCache: string | undefined;

function getRepoRoot(): string {
  if (!repoRootCache) {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    repoRootCache = resolve(currentDir, '../..');
  }
  return repoRootCache;
}
