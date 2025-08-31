import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DropdownMenuProps {
  children: ReactNode[];
}

export function DropdownMenu({ children }: DropdownMenuProps) {
  const [triggerChild, contentChild] = children;
  return (
    <>
      {triggerChild}
      {contentChild}
    </>
  );
}

interface DropdownMenuTriggerProps {
  children: ReactNode;
}

export function DropdownMenuTrigger({ children }: DropdownMenuTriggerProps) {
  return <>{children}</>;
}

interface DropdownMenuContentProps {
  align?: 'start' | 'end';
  className?: string;
  children: ReactNode;
}

export function DropdownMenuContent({ align = 'start', className, children }: DropdownMenuContentProps) {
  return (
    <div
      className={cn(
        'absolute top-full z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
        align === 'end' ? 'right-0' : 'left-0',
        className
      )}
    >
      {children}
    </div>
  );
}

interface DropdownMenuItemProps {
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function DropdownMenuItem({ onClick, disabled, className, children }: DropdownMenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-accent hover:text-accent-foreground w-full text-left',
        className
      )}
    >
      {children}
    </button>
  );
}