import { cn } from '@/lib/ui';

interface MetadataBadgeProps {
  icon: string;
  label: string;
  className?: string;
}

export function MetadataBadge({ icon, label, className }: MetadataBadgeProps) {
  if (!label) return null;
  
  return (
    <span 
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-secondary text-secondary-foreground",
        className
      )}
    >
      <span className="text-xs">{icon}</span>
      <span>{label}</span>
    </span>
  );
}