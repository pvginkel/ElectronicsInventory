import { useNavigate } from '@tanstack/react-router';
import type { LocationDisplayData } from '@/types/locations';
import { PartLocationCard } from './part-location-card';

interface LocationContainerProps {
  location: LocationDisplayData;
}

export function LocationContainer({ location }: LocationContainerProps) {
  const navigate = useNavigate();
  const locationId = `${location.boxNo}-${location.locNo}`;

  // Handle part card click
  const handlePartClick = (partKey: string) => {
    void navigate({
      to: '/parts/$partId',
      params: { partId: partKey },
    });
  };

  // Don't render empty locations
  if (location.isEmpty || !location.partAssignments || location.partAssignments.length === 0) {
    return null;
  }

  const partCount = location.partAssignments.length;
  // Calculate columns: min of (partCount, 4) - locations with fewer parts get fewer columns
  const columnCount = Math.min(partCount, 4);

  return (
    <div
      className="border-2 rounded-lg p-3 bg-card w-fit"
      data-testid={`boxes.detail.location-container.${locationId}`}
      data-location-id={locationId}
      data-part-count={partCount}
    >
      {/* Location Header */}
      <div className="mb-3">
        <h3 className="text-m font-semibold text-foreground">
          Location {location.locNo}
        </h3>
      </div>

      {/* Parts Grid - fixed width columns (180px each), dynamic column count for natural sizing */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columnCount}, 180px)` }}>
        {location.partAssignments.map((part) => (
          <PartLocationCard
            key={part.key}
            part={part}
            onClick={() => handlePartClick(part.key)}
          />
        ))}
      </div>
    </div>
  );
}
