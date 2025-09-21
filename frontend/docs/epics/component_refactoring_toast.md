# Refactoring the toast

Applying the recommendations as described in @docs/epics/component_refactoring.md gives the following proposed new version of the toast:

```ts
import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { cn } from "@/lib/utils";
import { ClearButtonIcon } from "@/components/icons/clear-button-icon";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

const typeStyles = {
  success: "bg-green-50 border-green-200 text-green-800",
  error:   "bg-red-50 border-red-200 text-red-800",
  warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
  info:    "bg-blue-50 border-blue-200 text-blue-800",
} as const;

const iconMap = {
  success: "✓",
  error:   "✕",
  warning: "⚠",
  info:    "ℹ",
} as const;

// ---- Toast item -------------------------------------------------------------

type RadixRootProps = React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root>;
type ToastRootRef = React.ElementRef<typeof ToastPrimitive.Root>;

interface ToastComponentProps extends Omit<RadixRootProps, "children"> {
  toast: Toast;
  onRemove: (id: string) => void;
}

export const ToastComponent = React.forwardRef<ToastRootRef, ToastComponentProps>(
  ({ toast, onRemove, className, onOpenChange, duration, ...props }, ref) => {
    const handleOpenChange: NonNullable<RadixRootProps["onOpenChange"]> = (open) => {
      onOpenChange?.(open);
      if (!open) onRemove(toast.id);
    };

    const effectiveDuration = toast.duration ?? duration ?? 5000;

    return (
      <ToastPrimitive.Root
        ref={ref}
        {...props} // allow data-*, aria-*, id, etc.
        duration={effectiveDuration}
        onOpenChange={handleOpenChange}
        className={cn(
          "group pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-lg border shadow-lg transition-all",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out",
          "data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full",
          "data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
          typeStyles[toast.type],
          className
        )}
      >
        <div className="p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <span className="text-lg" aria-hidden="true">
                {iconMap[toast.type]}
              </span>
            </div>
            <div className="ml-3 w-0 flex-1 pt-0.5">
              <ToastPrimitive.Title className="text-sm font-medium">
                {toast.message}
              </ToastPrimitive.Title>
            </div>
            <div className="ml-4 flex flex-shrink-0">
              <ToastPrimitive.Close className="inline-flex rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 hover:opacity-75">
                <span className="sr-only">Close</span>
                <ClearButtonIcon className="w-4 h-4" />
              </ToastPrimitive.Close>
            </div>
          </div>
        </div>
      </ToastPrimitive.Root>
    );
  }
);
ToastComponent.displayName = "ToastComponent";

// ---- Container --------------------------------------------------------------

type ProviderProps = React.ComponentPropsWithoutRef<typeof ToastPrimitive.Provider>;
type ViewportProps = React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>;

interface ToastContainerProps extends Omit<ProviderProps, "children"> {
  toasts: Toast[];
  onRemove: (id: string) => void;
  /** Optional: pass extra props per toast (e.g., data-testid, className, etc.) */
  getItemProps?: (t: Toast) => Partial<Omit<ToastComponentProps, "toast" | "onRemove">>;
  /** Customize the viewport element */
  viewportProps?: ViewportProps;
}

export function ToastContainer({
  toasts,
  onRemove,
  getItemProps,
  viewportProps,
  swipeDirection = "right",
  ...providerProps
}: ToastContainerProps) {
  return (
    <ToastPrimitive.Provider swipeDirection={swipeDirection} {...providerProps}>
      {toasts.map((toast) => (
        <ToastComponent
          key={toast.id}
          toast={toast}
          onRemove={onRemove}
          {...(getItemProps?.(toast) ?? {})}
        />
      ))}
      <ToastPrimitive.Viewport
        {...viewportProps}
        className={cn(
          "fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4",
          "sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
          viewportProps?.className
        )}
      />
    </ToastPrimitive.Provider>
  );
}
```
