import { LocationItem } from './location-item'
import type { LocationDisplayData } from '@/types/locations'

interface LocationListProps {
  locations: LocationDisplayData[]
}

export function LocationList({ locations }: LocationListProps) {
  if (!locations || locations.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No locations available</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground mb-4">
        {locations.length} locations
      </div>
      
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {locations.map((location) => (
          <LocationItem
            key={`${location.boxNo}-${location.locNo}`}
            location={location}
          />
        ))}
      </div>
    </div>
  )
}