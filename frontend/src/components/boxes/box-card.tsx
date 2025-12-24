import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CardLink } from '@/components/ui/card-link'
import { CapacityBar } from '@/components/ui'

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
  to: string
  params: Record<string, string>
  search?: Record<string, unknown>
  disabled?: boolean
}

export function BoxCard({ box, to, params, search, disabled = false }: BoxCardProps) {
  return (
    <CardLink
      to={to}
      params={params}
      search={search}
      disabled={disabled}
      data-testid={`boxes.list.item.${box.box_no}`}
      data-box-no={box.box_no}
      aria-label={`Open box ${box.box_no}`}
    >
      <CardHeader>
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

      <CardContent>
        <CapacityBar
          used={box.occupied_locations ?? 0}
          total={box.total_locations ?? box.capacity}
        />
      </CardContent>
    </CardLink>
  );
}
