import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface TypeCardProps {
  type: {
    id: number
    name: string
    part_count?: number
  }
  partCount?: number
  onEdit: () => void
  onDelete: () => void
}

export function TypeCard({ type, partCount, onEdit, onDelete }: TypeCardProps) {
  const displayPartCount = type.part_count ?? partCount ?? 0;
  return (
    <Card variant="grid-tile" data-testid="types.list.card">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-base">{type.name}</CardTitle>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">{displayPartCount} parts</div>
            <div className="text-xs text-muted-foreground">using this type</div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="flex justify-end items-center">
          <div className="flex space-x-2">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}