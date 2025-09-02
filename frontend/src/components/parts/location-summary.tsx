import { formatLocationSummary } from '@/lib/utils/locations';

interface PartLocation {
  box_no: number;
  loc_no: number;
  qty: number;
}

interface LocationSummaryProps {
  locations: PartLocation[];
  className?: string;
}

export function LocationSummary({ locations, className }: LocationSummaryProps) {
  const summary = formatLocationSummary(locations);
  
  return (
    <span className={`inline-flex items-center gap-1 text-sm text-muted-foreground ${className || ''}`}>
      <span className="text-xs">📊</span>
      <span>{summary}</span>
    </span>
  );
}