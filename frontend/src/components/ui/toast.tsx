import * as React from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { cn } from '@/lib/utils'
import { ClearButtonIcon } from '@/components/icons/clear-button-icon'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

type NativeToastRootProps = React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root>;
type NativeToastViewportProps = React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>;

interface ToastProps extends Omit<NativeToastRootProps, 'duration' | 'onOpenChange'> {
  toast: Toast
  onRemove: (id: string) => void
}

const ToastComponent = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  ToastProps
>(({ toast, onRemove, className, ...props }, ref) => {
  const typeStyles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  }

  const iconMap = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  }

  return (
    <ToastPrimitive.Root
      ref={ref}
      {...props}
      duration={toast.duration || 5000}
      role="status"
      aria-live="polite"
      data-toast-type={toast.type}
      onOpenChange={(open) => {
        if (!open) {
          onRemove(toast.id)
        }
      }}
      className={cn(
        'group pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-lg border shadow-lg transition-all',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out',
        'data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full',
        'data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full',
        typeStyles[toast.type],
        className
      )}
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <span className="text-lg">{iconMap[toast.type]}</span>
          </div>
          <div className="ml-3 w-0 flex-1 pt-0.5">
            <ToastPrimitive.Title className="text-sm font-medium">
              {toast.message}
            </ToastPrimitive.Title>
          </div>
          <div className="ml-4 flex flex-shrink-0">
            <ToastPrimitive.Close
              className="inline-flex rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 hover:opacity-75"
            >
              <span className="sr-only">Close</span>
              <ClearButtonIcon className="w-4 h-4" />
            </ToastPrimitive.Close>
          </div>
        </div>
      </div>
    </ToastPrimitive.Root>
  )
})
ToastComponent.displayName = "ToastComponent"

interface ToastContainerProps {
  toasts: Toast[]
  onRemove: (id: string) => void
  viewportProps?: NativeToastViewportProps & Record<string, unknown>
  getItemProps?: (toast: Toast) => (Partial<ToastProps> & Record<string, unknown>)
}

export function ToastContainer({ toasts, onRemove, viewportProps, getItemProps }: ToastContainerProps) {
  const viewportRecord = (viewportProps ?? {}) as Record<string, unknown>
  const viewportTestId = (viewportRecord['data-testid'] as string | undefined) ?? 'app-shell.toast.viewport'

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {toasts.map((toast) => {
        const userItemProps = getItemProps?.(toast) || {}
        const resolvedItemProps: Partial<ToastProps> & Record<string, unknown> = {
          'data-toast-id': toast.id,
          'data-toast-level': toast.type,
          ...userItemProps,
        }

        if (resolvedItemProps['data-testid'] === undefined) {
          resolvedItemProps['data-testid'] = 'app-shell.toast.item'
        }

        return (
          <ToastComponent
            key={toast.id}
            toast={toast}
            onRemove={onRemove}
            {...resolvedItemProps}
          />
        )
      })}
      <ToastPrimitive.Viewport
        data-testid={viewportTestId}
        {...viewportProps}
        className={cn(
          "fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
          viewportProps?.className
        )}
      />
    </ToastPrimitive.Provider>
  )
}
