import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isTestMode } from '@/lib/config/test-mode'
import { setupConsolePolicy } from '@/lib/test/console-policy'
import { setupErrorInstrumentation } from '@/lib/test/error-instrumentation'

// Setup test mode infrastructure
if (isTestMode()) {
  setupConsolePolicy();
  setupErrorInstrumentation();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
