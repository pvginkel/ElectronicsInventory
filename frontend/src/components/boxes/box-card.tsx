import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface BoxCardProps {
  box: {
    box_no: number
    description: string
    capacity: number
  }
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}

export function BoxCard({ box, onView, onEdit, onDelete }: BoxCardProps) {
  return (
    <Card variant="content" className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-base">Box {box.box_no}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{box.description}</p>
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
            Usage: 0/{box.capacity} (0%)
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
            style={{ width: '0%' }}
          />
        </div>
      </CardContent>
    </Card>
  )
}