import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isTestMode } from '@/lib/config/test-mode'
import { setupConsolePolicy } from '@/lib/test/console-policy'

// Setup console policy if in test mode
if (isTestMode()) {
  setupConsolePolicy();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
