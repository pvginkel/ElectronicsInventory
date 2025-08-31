import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SplitButtonAction {
  label: string;
  onClick: () => void;
}

interface SplitButtonProps {
  /** Primary action label */
  primaryLabel: string;
  /** Primary action handler */
  onPrimaryClick: () => void;
  /** Additional actions for the dropdown */
  actions: SplitButtonAction[];
  /** Button variant */
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost';
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function SplitButton({
  primaryLabel,
  onPrimaryClick,
  actions,
  variant = 'default',
  size = 'md',
  disabled = false,
  className
}: SplitButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={cn('relative flex', className)} ref={dropdownRef}>
      {/* Primary Action Button */}
      <Button
        onClick={onPrimaryClick}
        variant={variant}
        size={size}
        disabled={disabled}
        className="rounded-r-none border-r-0"
      >
        {primaryLabel}
      </Button>

      {/* Dropdown Trigger */}
      <Button
        variant={variant}
        size={size}
        disabled={disabled}
        className="rounded-l-none px-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        <ChevronDown className="h-4 w-4" />
      </Button>

      {/* Dropdown Content */}
      {isOpen && (
        <div className="absolute top-full right-0 z-50 min-w-[12rem] overflow-hidden rounded-md border bg-background p-1 shadow-md">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={() => {
                action.onClick();
                setIsOpen(false);
              }}
              disabled={disabled}
              className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}