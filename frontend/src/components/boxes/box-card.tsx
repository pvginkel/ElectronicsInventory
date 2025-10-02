import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface BoxCardProps {
  box: {
    box_no: number
    description: string
    capacity: number
    total_locations?: number
    occupied_locations?: number
    available_locations?: number
    usage_percentage?: number
  }
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}

export function BoxCard({ box, onView, onEdit, onDelete }: BoxCardProps) {
  return (
    <Card
      variant="content"
      className="hover:shadow-md transition-shadow"
      data-testid={`boxes.list.item.${box.box_no}`}
      data-box-no={box.box_no}
    >
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-base">#{box.box_no} {box.description}</CardTitle>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">{box.capacity} locations</div>
            <div className="text-xs text-muted-foreground">capacity</div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            Usage: {box.occupied_locations ?? 0}/{box.total_locations ?? box.capacity} ({Math.round(box.usage_percentage ?? 0)}%)
          </div>
          
          <div className="flex space-x-2">
            <Button variant="ghost" size="sm" onClick={onView}>
              View
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              Delete
            </Button>
          </div>
        </div>
        
        <div className="mt-3 bg-muted rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-300" 
            style={{ width: `${Math.min(box.usage_percentage ?? 0, 100)}%` }}
          />
        </div>
      </CardContent>
    </Card>
  )
}
