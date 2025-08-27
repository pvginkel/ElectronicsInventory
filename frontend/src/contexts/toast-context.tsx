import { createContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { Toast, ToastType } from '@/components/ui/toast'
import { ToastContainer } from '@/components/ui/toast'

interface ToastContextValue {
  showToast: (message: string, type: ToastType, duration?: number) => void
  showError: (message: string, duration?: number) => void
  showSuccess: (message: string, duration?: number) => void
  showWarning: (message: string, duration?: number) => void
  showInfo: (message: string, duration?: number) => void
  removeToast: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue | undefined>(undefined)

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

  const contextValue: ToastContextValue = {
    showToast,
    showError,
    showSuccess,
    showWarning,
    showInfo,
    removeToast
  }

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}