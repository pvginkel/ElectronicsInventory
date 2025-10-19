import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ToastContainer } from '@/components/ui/toast'
import type { Toast, ToastOptions, ToastType } from '@/components/ui/toast'
import { isTestMode } from '@/lib/config/test-mode'
import { createInstrumentedToastWrapper } from '@/lib/test/toast-instrumentation'
import { ToastContext } from './toast-context-base'
import type { ToastContextValue } from './toast-context-base'

interface ToastProviderProps {
  children: ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  const showToast = (message: string, type: ToastType, options?: ToastOptions) => {
    const id = Math.random().toString(36).substring(2, 11)
    const action = options?.action
      ? {
          ...options.action,
          onClick: () => {
            options.action?.onClick?.()
            removeToast(id)
          },
        }
      : undefined

    const toast: Toast = {
      id,
      message,
      type,
      duration: options?.duration,
      action,
    }

    setToasts(prev => [...prev, toast])

    return id
  }

  const showError = (message: string, options?: ToastOptions) => {
    return showToast(message, 'error', options)
  }

  const showSuccess = (message: string, options?: ToastOptions) => {
    return showToast(message, 'success', options)
  }

  const showWarning = (message: string, options?: ToastOptions) => {
    return showToast(message, 'warning', options)
  }

  const showInfo = (message: string, options?: ToastOptions) => {
    return showToast(message, 'info', options)
  }

  const showException = (message: string, error: unknown, options?: ToastOptions) => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Toast exception', error)
    }
    return showToast(message, 'error', options)
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
      const customEvent = event as CustomEvent<{ message: string; error: unknown; options?: ToastOptions }>
      const detail = customEvent.detail
      if (!detail || typeof detail.message !== 'string') {
        return
      }
      showExceptionFn(detail.message, detail.error, detail.options)
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
