import { cn } from '@/lib/ui';

interface QuantityBadgeProps {
  quantity: number;
  className?: string;
}

export function QuantityBadge({ quantity, className }: QuantityBadgeProps) {
  return (
    <span 
      className={cn(
        "px-3 py-1 text-sm font-bold rounded-full bg-primary text-primary-foreground",
        className
      )}
    >
      {quantity}
    </span>
  );
}