import { LocationContainer } from './location-container'
import type { LocationDisplayData } from '@/types/locations'

interface LocationListProps {
  locations: LocationDisplayData[]
  isFiltered?: boolean
}

export function LocationList({ locations, isFiltered = false }: LocationListProps) {
  // Filter out empty locations
  const nonEmptyLocations = locations.filter(
    (location) => !location.isEmpty && location.partAssignments && location.partAssignments.length > 0
  );

  // If no locations at all and not filtered, show "no locations" message
  if ((!locations || locations.length === 0) && !isFiltered) {
    return (
      <div className="text-center py-8" data-testid="boxes.detail.locations.empty">
        <p className="text-muted-foreground">No locations available</p>
      </div>
    )
  }

  // If no non-empty locations (either because box is empty or search has no matches)
  if (nonEmptyLocations.length === 0) {
    return (
      <div className="text-center py-8" data-testid="boxes.detail.locations.no-matches">
        <p className="text-muted-foreground">
          {isFiltered ? 'No parts match your search' : 'No parts found'}
        </p>
      </div>
    )
  }

  return (
    <div data-testid="boxes.detail.locations.list">
      <div className="text-sm text-muted-foreground mb-4" data-testid="boxes.detail.locations.count">
        {nonEmptyLocations.length} {nonEmptyLocations.length === 1 ? 'location' : 'locations'}
      </div>

      {/* Flexbox flow layout - locations wrap left-to-right, top-to-bottom */}
      <div className="flex flex-wrap gap-4 items-start">
        {nonEmptyLocations.map((location) => (
          <LocationContainer
            key={`${location.boxNo}-${location.locNo}`}
            location={location}
          />
        ))}
      </div>
    </div>
  )
}
