import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3100';
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:5100';

  console.log('🔧 Setting up Playwright tests...');
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