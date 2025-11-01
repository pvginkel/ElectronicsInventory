import { formatLocationSummary } from '@/lib/utils/locations';
import { InformationBadge } from '@/components/ui';

interface PartLocation {
  box_no: number;
  loc_no: number;
  qty: number;
}

interface LocationSummaryProps {
  locations: PartLocation[];
  testId: string;
}

export function LocationSummary({ locations, testId }: LocationSummaryProps) {
  const summary = formatLocationSummary(locations);

  return (
    <InformationBadge icon="📊" variant="subtle" testId={testId}>
      {summary}
    </InformationBadge>
  );
}