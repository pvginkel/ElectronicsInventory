import { LocationItem } from './location-item'

interface LocationListProps {
  locations: Array<{
    box_no: number
    loc_no: number
  }>
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
            key={`${location.box_no}-${location.loc_no}`}
            location={location}
          />
        ))}
      </div>
    </div>
  )
}