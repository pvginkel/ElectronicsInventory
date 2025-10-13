import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Toast, ToastType } from '@/components/ui/toast'
import { ToastContainer } from '@/components/ui/toast'
import { isTestMode } from '@/lib/config/test-mode'
import { createInstrumentedToastWrapper } from '@/lib/test/toast-instrumentation'
import { ToastContext } from './toast-context-base'
import type { ToastContextValue } from './toast-context-base'

interface ToastProviderProps {
  children: ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = (message: string, type: ToastType, duration?: number) => {
    const id = Math.random().toString(36).substring(2, 11)
    const toast: Toast = { id, message, type, duration }
    
    setToasts(prev => [...prev, toast])
  }

  const showError = (message: string, duration?: number) => {
    showToast(message, 'error', duration)
  }

  const showSuccess = (message: string, duration?: number) => {
    showToast(message, 'success', duration)
  }

  const showWarning = (message: string, duration?: number) => {
    showToast(message, 'warning', duration)
  }

  const showInfo = (message: string, duration?: number) => {
    showToast(message, 'info', duration)
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  const showException = (message: string, error: unknown, duration?: number) => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Toast exception', error)
    }
    showToast(message, 'error', duration)
  }

  const baseContextValue: ToastContextValue = {
    showToast,
    showError,
    showSuccess,
    showWarning,
    showInfo,
    showException,
    removeToast
  }

  // Instrument toast functions in test mode
  const contextValue = isTestMode()
    ? createInstrumentedToastWrapper(baseContextValue)
    : baseContextValue

  const showExceptionFn = contextValue.showException

  useEffect(() => {
    if (!isTestMode() || typeof window === 'undefined') {
      return
    }

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ message: string; error: unknown; duration?: number }>
      const detail = customEvent.detail
      if (!detail || typeof detail.message !== 'string') {
        return
      }
      showExceptionFn(detail.message, detail.error, detail.duration)
    }

    window.addEventListener('app:testing:show-exception', handler)

    return () => {
      window.removeEventListener('app:testing:show-exception', handler)
    }
  }, [showExceptionFn])

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer
        toasts={toasts}
        onRemove={removeToast}
      />
    </ToastContext.Provider>
  )
}
