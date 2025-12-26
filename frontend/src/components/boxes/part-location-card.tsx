import { CoverImageDisplay } from '@/components/documents/cover-image-display';
import { Card } from '@/components/ui/card';
import { QuantityBadge } from '@/components/ui/quantity-badge';
import { formatPartForDisplay } from '@/lib/utils/parts';
import type { PartAssignment } from '@/types/locations';

interface PartLocationCardProps {
  part: PartAssignment;
  onClick?: () => void;
}

export function PartLocationCard({ part, onClick }: PartLocationCardProps) {
  // Format part display data using shared utility
  const { displayDescription } = formatPartForDisplay(part);

  return (
    <Card
      variant={onClick ? 'grid-tile' : 'grid-tile-disabled'}
      onClick={onClick}
      className="flex flex-col h-full"
      data-testid={`boxes.detail.part-card.${part.key}`}
      data-part-key={part.key}
    >
      {/* Cover Image - using large size (128x128) */}
      <div className="flex-shrink-0 mb-2">
        <CoverImageDisplay
          partId={part.key}
          coverUrl={part.cover_url ?? null}
          size="large"
          className="w-full h-32 rounded-md shadow-sm"
          showPlaceholder={true}
        />
      </div>

      {/* Part Name/Description - 2 lines max with ellipsis */}
      <h3
        className="text-m font-semibold text-foreground mb-1 leading-tight overflow-hidden line-clamp-2"
        title={displayDescription}
      >
        {displayDescription}
      </h3>

      {/* Part Key - 1 line max with ellipsis */}
      <p
        className="text-xs text-muted-foreground mb-2 overflow-hidden text-ellipsis whitespace-nowrap font-mono"
        title={part.key}
      >
        #{part.key}
      </p>

      {/* Quantity Badge */}
      <div className="mt-auto">
        <QuantityBadge
          quantity={part.qty}
          testId={`boxes.detail.part-card.quantity-${part.key}`}
        />
      </div>
    </Card>
  );
}
