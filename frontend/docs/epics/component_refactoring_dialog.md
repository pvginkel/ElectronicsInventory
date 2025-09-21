# Refactoring the dialog

Applying the recommendations as described in @docs/epics/component_refactoring.md gives the following proposed new version of the dialog:

```ts
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "./button";
import { cn } from "@/lib/utils";

// ---------------------- Dialog (wrapper) ----------------------

type RootProps    = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>;
type PortalProps  = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Portal>;
type OverlayProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>;
type ContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>;
type ContentRef   = React.ElementRef<typeof DialogPrimitive.Content>;

interface DialogProps extends Omit<RootProps, "children"> {
  /** Your dialog content */
  children: React.ReactNode;
  /** Shorthand to style Content; if omitted, defaults to "max-w-lg w-full" */
  className?: string;
  /** Pass-through props to Radix parts (use for data-*, id, aria-*, etc.) */
  overlayProps?: OverlayProps;
  contentProps?: Omit<ContentProps, "children" | "className"> & { className?: string };
  portalProps?: PortalProps;
}

export const Dialog = React.forwardRef<ContentRef, DialogProps>(
  ({ children, className, overlayProps, contentProps, portalProps, ...rootProps }, ref) => {
    const {
      className: contentClassName,
      ...restContent
    } = contentProps ?? {};

    return (
      <DialogPrimitive.Root {...rootProps}>
        <DialogPrimitive.Portal {...portalProps}>
          <DialogPrimitive.Overlay
            {...overlayProps}
            className={cn(
              "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              overlayProps?.className
            )}
          />
          <DialogPrimitive.Content
            ref={ref}
            {...restContent} // data-*, aria-*, id, onOpenAutoFocus, etc.
            className={cn(
              "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
              "bg-card text-card-foreground border rounded-lg shadow-lg",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
              "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
              // keep your previous default size behavior:
              className ?? "max-w-lg w-full",
              contentClassName
            )}
          >
            {children}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }
);
Dialog.displayName = "Dialog";

// ---------------------- Small building blocks ----------------------

type DivProps = React.ComponentPropsWithoutRef<"div">;

export const DialogContent = React.forwardRef<HTMLDivElement, DivProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} {...props} className={cn("p-6", className)} />
  )
);
DialogContent.displayName = "DialogContent";

export const DialogHeader = React.forwardRef<HTMLDivElement, DivProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} {...props} className={cn("flex flex-col space-y-1.5 pb-4", className)} />
  )
);
DialogHeader.displayName = "DialogHeader";

type TitleProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>;
type TitleRef   = React.ElementRef<typeof DialogPrimitive.Title>;
export const DialogTitle = React.forwardRef<TitleRef, TitleProps>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Title
      ref={ref}
      {...props}
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    />
  )
);
DialogTitle.displayName = "DialogTitle";

export const DialogFooter = React.forwardRef<HTMLDivElement, DivProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-4", className)}
    />
  )
);
DialogFooter.displayName = "DialogFooter";

// ---------------------- ConfirmDialog (convenience) ----------------------

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  destructive?: boolean;

  /** Pass-through hooks for testing / a11y / styling */
  dialogProps?: Omit<DialogProps, "children" | "open" | "onOpenChange" | "className">;
  dialogClassName?: string; // styles the Radix Content
  confirmButtonProps?: React.ComponentPropsWithoutRef<typeof Button>;
  cancelButtonProps?: React.ComponentPropsWithoutRef<typeof Button>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  destructive = false,
  dialogProps,
  dialogClassName,
  confirmButtonProps,
  cancelButtonProps,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className={dialogClassName}
      {...dialogProps}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {/* Use Radix Description for a11y (announced by screen readers) */}
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            {description}
          </DialogPrimitive.Description>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            {...cancelButtonProps}
          >
            {cancelText}
          </Button>
          <Button
            variant={destructive ? "default" : "primary"}
            onClick={handleConfirm}
            className={cn(
              destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              confirmButtonProps?.className
            )}
            {...confirmButtonProps}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```