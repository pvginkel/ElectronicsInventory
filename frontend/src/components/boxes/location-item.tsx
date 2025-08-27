interface LocationItemProps {
  location: {
    box_no: number
    loc_no: number
  }
}

export function LocationItem({ location }: LocationItemProps) {
  const locationId = `${location.box_no}-${location.loc_no}`
  
  return (
    <div 
      className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
      tabIndex={0}
      role="button"
      aria-label={`Location ${locationId}`}
    >
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center text-sm font-medium">
          {location.loc_no}
        </div>
        <div>
          <div className="font-medium">Location {location.loc_no}</div>
        </div>
      </div>
      
      <div className="text-right">
        <div className="text-sm font-medium text-muted-foreground">Empty</div>
        <div className="text-xs text-muted-foreground">Available</div>
      </div>
    </div>
  )
}