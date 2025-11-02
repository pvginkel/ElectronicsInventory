import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardStorage } from '@/hooks/use-dashboard'
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

interface StorageBoxProps {
  boxNo: number
  description: string
  totalLocations: number
  occupiedLocations: number
  usagePercentage: number
  onClick: (boxNo: number) => void
  dataset?: Record<string, string>
}

function StorageBox({
  boxNo,
  description,
  totalLocations,
  occupiedLocations,
  usagePercentage,
  onClick,
  dataset,
}: StorageBoxProps) {
  // Visual encoding based on plan
  const getActivityLevel = (usage: number) => {
    if (usage >= 80) return 3 // High activity - thicker border
    if (usage >= 40) return 2 // Medium activity
    if (usage >= 10) return 1 // Low activity
    return 0 // No activity - thinnest border
  }

  const getBackgroundOpacity = (usage: number) => {
    return Math.max(0.1, usage / 100) // Darker = fuller
  }

  const getBorderColor = (usage: number) => {
    if (usage >= 90) return 'border-red-500/80' // Nearly full
    if (usage >= 70) return 'border-amber-500/80' // Getting full
    if (usage >= 30) return 'border-blue-500/60' // Active
    if (usage > 0) return 'border-muted-foreground/40' // Some usage
    return 'border-muted-foreground/20' // Empty
  }

  const activityLevel = getActivityLevel(usagePercentage)
  const borderThickness = `border-${Math.max(1, activityLevel)}`

  return (
    <Card
      variant="grid-tile"
      className={cn('relative group', getBorderColor(usagePercentage), borderThickness)}
      style={{
        backgroundColor: `rgba(var(--primary), ${getBackgroundOpacity(usagePercentage)})`
      }}
      onClick={() => onClick(boxNo)}
      data-testid="dashboard.storage.box"
      data-box-no={boxNo}
      title={`Box ${boxNo} - ${description}: ${occupiedLocations} / ${totalLocations} locations (${Math.round(usagePercentage)}%)`}
      {...dataset}
    >
      {/* Box Number Badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="bg-background/90 rounded px-2 py-1 text-xs font-mono font-bold" data-testid="dashboard.storage.box.badge">
          {boxNo}
        </div>
        {occupiedLocations > 0 && (
          <div className="text-xs text-muted-foreground bg-background/80 rounded px-1" data-testid="dashboard.storage.box.utilization">
            {Math.round(usagePercentage)}%
          </div>
        )}
      </div>

      {/* Description */}
      <div className="text-sm font-medium truncate mb-2 text-foreground" data-testid="dashboard.storage.box.description">
        {description}
      </div>

      {/* Usage Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span data-testid="dashboard.storage.box.locations">{occupiedLocations}/{totalLocations}</span>
          <span>locations</span>
        </div>
        <div className="w-full bg-background/60 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ${
              usagePercentage >= 90 ? 'bg-red-500' :
              usagePercentage >= 70 ? 'bg-amber-500' :
              usagePercentage >= 30 ? 'bg-blue-500' :
              usagePercentage > 0 ? 'bg-green-500' : 'bg-muted'
            }`}
            style={{ width: `${Math.max(usagePercentage, 2)}%` }}
          />
        </div>
      </div>

      {/* Ripple effect on click */}
      <div className="absolute inset-0 rounded-lg overflow-hidden">
        <div className="absolute inset-0 bg-primary/20 rounded-lg transform scale-0 transition-transform duration-300 group-hover:animate-ping" />
      </div>
    </Card>
  )
}

export function StorageUtilizationGrid() {
  const { data: storage, isLoading } = useDashboardStorage()
  const navigate = useNavigate()

  const handleBoxClick = (boxNo: number) => {
    navigate({ to: '/boxes/$boxNo', params: { boxNo: boxNo.toString() } })
  }

  // Sort boxes: most-used first, empty last (as per plan)
  const sortedStorage = storage?.slice().sort((a: any, b: any) => {
    if (a.usage_percentage === 0 && b.usage_percentage === 0) {
      return a.box_no - b.box_no // Sort empty boxes by box number
    }
    if (a.usage_percentage === 0) return 1 // Empty boxes last
    if (b.usage_percentage === 0) return -1 // Empty boxes last
    return b.usage_percentage - a.usage_percentage // Most used first
  })

  if (!storage || storage.length === 0) {
    return (
      <Card data-testid="dashboard.storage" data-state={isLoading ? 'loading' : 'empty'}>
        <CardHeader>
          <CardTitle>Storage Utilization</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3" data-testid="dashboard.storage.skeleton">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="border border-muted rounded-lg p-3" data-testid="dashboard.storage.skeleton.card">
                  <div className="flex items-center justify-between mb-2">
                    <Skeleton width="w-6" height="h-4" />
                    <Skeleton width="w-8" height="h-3" />
                  </div>
                  <Skeleton width="w-full" height="h-4" />
                  <div className="space-y-1 mt-2">
                    <div className="flex justify-between">
                      <Skeleton width="w-12" height="h-3" />
                      <Skeleton width="w-16" height="h-3" />
                    </div>
                    <Skeleton width="w-full" height="h-1.5" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div data-testid="dashboard.storage.empty">
              <div className="text-4xl mb-2">📦</div>
              <p className="text-muted-foreground">No storage boxes configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create boxes to organize your inventory
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // Calculate summary stats
  const totalBoxes = storage.length
  const activeBoxes = storage.filter((box: any) => box.occupied_locations > 0).length
  const totalLocations = storage.reduce((sum: number, box: any) => sum + box.total_locations, 0)
  const occupiedLocations = storage.reduce((sum: number, box: any) => sum + box.occupied_locations, 0)
  const overallUtilization = totalLocations > 0 ? (occupiedLocations / totalLocations) * 100 : 0

  return (
    <Card data-testid="dashboard.storage" data-state={isLoading ? 'loading' : 'ready'}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle>Storage Utilization</CardTitle>
          <div className="text-sm text-muted-foreground" data-testid="dashboard.storage.summary">
            {activeBoxes}/{totalBoxes} active • {Math.round(overallUtilization)}% utilized
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3" data-testid="dashboard.storage.skeleton">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="border border-muted rounded-lg p-3" data-testid="dashboard.storage.skeleton.card">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton width="w-6" height="h-4" />
                  <Skeleton width="w-8" height="h-3" />
                </div>
                <Skeleton width="w-full" height="h-4" />
                <div className="space-y-1 mt-2">
                  <div className="flex justify-between">
                    <Skeleton width="w-12" height="h-3" />
                    <Skeleton width="w-16" height="h-3" />
                  </div>
                  <Skeleton width="w-full" height="h-1.5" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3" data-testid="dashboard.storage.grid">
          {sortedStorage?.map((box: any) => (
            <StorageBox
              key={box.box_no}
              boxNo={box.box_no}
              description={box.description}
              totalLocations={box.total_locations}
              occupiedLocations={box.occupied_locations}
              usagePercentage={box.usage_percentage}
              onClick={handleBoxClick}
              dataset={{ 'data-utilization': String(box.usage_percentage) }}
            />
          ))}
          </div>
        )}

        {/* Summary Stats */}
        <div className="mt-6 pt-4 border-t" data-testid="dashboard.storage.stats">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-lg font-semibold" data-testid="dashboard.storage.stats.total">{totalBoxes}</div>
              <div className="text-xs text-muted-foreground">Total Boxes</div>
            </div>
            <div>
              <div className="text-lg font-semibold" data-testid="dashboard.storage.stats.active">{activeBoxes}</div>
              <div className="text-xs text-muted-foreground">Active Boxes</div>
            </div>
            <div>
              <div className="text-lg font-semibold" data-testid="dashboard.storage.stats.occupied">{occupiedLocations}</div>
              <div className="text-xs text-muted-foreground">Used Locations</div>
            </div>
            <div>
              <div className={`text-lg font-semibold ${
                overallUtilization >= 80 ? 'text-red-600' :
                overallUtilization >= 60 ? 'text-amber-600' :
                'text-green-600'
              }`} data-testid="dashboard.storage.stats.utilization">
                {Math.round(overallUtilization)}%
              </div>
              <div className="text-xs text-muted-foreground">Overall Utilization</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
