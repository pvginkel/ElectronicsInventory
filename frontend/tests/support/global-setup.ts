import { chromium } from '@playwright/test';
import { getBackendUrl } from './backend-url';

async function globalSetup() {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3100';
  const backendUrl = getBackendUrl();
  const playwrightManagedServices = process.env.PLAYWRIGHT_MANAGED_SERVICES !== 'false';

  console.log('🔧 Setting up Playwright tests...');
  console.log(`Frontend URL: ${frontendUrl}`);
  console.log(`Backend URL: ${backendUrl}`);
  console.log(`Service management: ${playwrightManagedServices ? 'Playwright managed' : 'External'}`);

  // Skip health checks if Playwright manages services (webServer handles this)
  if (playwrightManagedServices) {
    console.log('⏭️ Skipping health checks - Playwright manages services');
    return;
  }

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
