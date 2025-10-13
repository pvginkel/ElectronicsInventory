import { createContext } from 'react';
import type { ToastType } from '@/components/ui/toast';

export interface ToastContextValue {
  showToast: (message: string, type: ToastType, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showSuccess: (message: string, duration?: number) => void;
  showWarning: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
  showException: (message: string, error: unknown, duration?: number) => void;
  removeToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | undefined>(undefined);
