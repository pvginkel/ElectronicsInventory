import type { LocationDisplayData } from '@/types/locations'
import { IconBadge } from '@/components/ui'

interface LocationItemProps {
  location: LocationDisplayData
}

export function LocationItem({ location }: LocationItemProps) {
  const locationId = `${location.boxNo}-${location.locNo}`
  
  return (
    <div 
      className={`flex items-center justify-between p-3 border rounded-lg transition-colors cursor-pointer ${location.stylingClasses}`}
      tabIndex={0}
      role="button"
      aria-label={`Location ${locationId} - ${location.displayText}`}
      data-testid={`boxes.detail.locations.item.${locationId}`}
      data-is-occupied={location.isOccupied ? 'true' : 'false'}
      {...(location.partAssignments && location.partAssignments.length > 0
        ? { 'data-primary-part-key': location.partAssignments[0].key ?? undefined }
        : {})}
    >
      <div className="flex items-center space-x-3">
        <IconBadge
          size="sm"
          variant={location.isOccupied ? 'success' : 'neutral'}
        >
          {location.locNo}
        </IconBadge>
        <div>
          <div className="font-medium">Location {location.locNo}</div>
          {location.isOccupied && location.partAssignments && location.partAssignments.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {location.partAssignments[0].manufacturer_code && 
                `${location.partAssignments[0].manufacturer_code} • `}
              {location.partAssignments[0].description && 
                location.partAssignments[0].description.substring(0, 30)}
              {location.partAssignments[0].description && location.partAssignments[0].description.length > 30 && '...'}
            </div>
          )}
        </div>
      </div>
      
      <div className="text-right">
        {location.isOccupied && location.partAssignments && location.partAssignments.length > 0 ? (
          <>
            <div className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              {location.partAssignments[0].key}
            </div>
            <div className="text-xs text-muted-foreground">
              Qty: {location.totalQuantity}
              {location.partAssignments.length > 1 && (
                <span className="ml-1 text-blue-600 dark:text-blue-400">
                  +{location.partAssignments.length - 1} more
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-medium text-muted-foreground">Empty</div>
            <div className="text-xs text-muted-foreground">Available</div>
          </>
        )}
      </div>
    </div>
  )
}
