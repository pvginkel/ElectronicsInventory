# Refactoring the progress bar

Applying the recommendations as described in @docs/epics/component_refactoring.md gives the following proposed new version of the progress bar:

```ts
import * as React from "react";
import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "h-1",
  md: "h-2",
  lg: "h-3",
} as const;

const variantClasses = {
  default: "bg-primary",
  success: "bg-green-500",
  warning: "bg-yellow-500",
  error: "bg-red-500",
} as const;

type NativeDivProps = Omit<
  React.ComponentPropsWithoutRef<"div">,
  "role" | "aria-valuemin" | "aria-valuemax" | "aria-valuenow"
>;

interface ProgressBarProps extends NativeDivProps {
  value: number;                 // 0–100
  showLabel?: boolean;
  size?: keyof typeof sizeClasses;
  variant?: keyof typeof variantClasses;
  ariaLabel?: string;            // accessible name if no visible label
  indeterminate?: boolean;       // optional indeterminate state
}

export const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      value,
      className,
      showLabel = false,
      size = "md",
      variant = "default",
      ariaLabel,
      indeterminate = false,
      ...props
    },
    ref
  ) => {
    const clamped = Math.min(100, Math.max(0, value));
    const rounded = Math.round(clamped);

    return (
      <div
        ref={ref}
        className={cn("w-full", className)}
        {...props}                         // user props first…
        role="progressbar"                 // …so our required a11y wins
        aria-label={ariaLabel}
        aria-valuemin={indeterminate ? undefined : 0}
        aria-valuemax={indeterminate ? undefined : 100}
        aria-valuenow={indeterminate ? undefined : rounded}
        aria-busy={indeterminate || undefined}
      >
        <div className={cn("w-full bg-muted rounded-full overflow-hidden", sizeClasses[size])}>
          <div
            className={cn("h-full transition-all duration-300 ease-out", variantClasses[variant])}
            style={indeterminate ? undefined : { width: `${clamped}%` }}
            aria-hidden="true"
          />
        </div>

        {showLabel && (
          <div className="text-sm text-muted-foreground mt-1 text-center">
            {indeterminate ? "…" : `${rounded}%`}
          </div>
        )}
      </div>
    );
  }
);

ProgressBar.displayName = "ProgressBar";
```