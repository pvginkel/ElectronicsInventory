import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { IconBadge } from '@/components/ui'
import { useDashboardActivity } from '@/hooks/use-dashboard'
import { useNavigate } from '@tanstack/react-router'
import { useState, useMemo } from 'react'

interface ActivityItemProps {
  partKey: string
  partDescription: string
  deltaQty: number
  locationReference?: string
  timestamp: string
  onPartClick: (partId: string) => void
}

function ActivityItem({
  partKey,
  partDescription,
  deltaQty,
  locationReference,
  timestamp,
  onPartClick
}: ActivityItemProps) {
  const isAddition = deltaQty > 0
  const isRemoval = deltaQty < 0

  // Icon and variant based on activity type
  const getActivityIcon = () => {
    if (isAddition) return '➕'
    if (isRemoval) return '➖'
    return '🔄' // Move or other operations
  }

  const getActivityVariant = () => {
    if (isAddition) return 'success' as const
    if (isRemoval) return 'error' as const
    return 'info' as const
  }

  const getActivityColor = () => {
    if (isAddition) return 'text-green-600 bg-green-50 border-green-200'
    if (isRemoval) return 'text-amber-600 bg-amber-50 border-amber-200'
    return 'text-blue-600 bg-blue-50 border-blue-200'
  }

  const getActivityText = () => {
    if (isAddition) return `Added ${Math.abs(deltaQty)}x`
    if (isRemoval) return `Used ${Math.abs(deltaQty)}x`
    return 'Moved'
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(diffInHours * 60)
      return `${diffInMinutes}m ago`
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`
    } else {
      const diffInDays = Math.floor(diffInHours / 24)
      return `${diffInDays}d ago`
    }
  }

  return (
    <div
      className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={() => onPartClick(partKey)}
      data-testid="dashboard.activity.item"
      data-part-key={partKey}
      data-delta={deltaQty}
    >
      {/* Activity Icon */}
      <IconBadge
        size="sm"
        variant={getActivityVariant()}
        border
        testId="dashboard.activity.item.icon"
      >
        {getActivityIcon()}
      </IconBadge>

      {/* Activity Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-sm font-semibold" data-testid="dashboard.activity.item.part">
            {partKey}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded ${getActivityColor()}`} data-testid="dashboard.activity.item.badge">
            {getActivityText()}
          </span>
        </div>
        
        <p
          className="text-sm font-medium text-foreground truncate"
          title={partDescription}
          data-testid="dashboard.activity.item.description"
        >
          {partDescription}
        </p>
        
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          {locationReference && (
            <span className="bg-muted px-2 py-0.5 rounded" data-testid="dashboard.activity.item.location">
              {locationReference}
            </span>
          )}
          <span data-testid="dashboard.activity.item.timestamp">{formatTimestamp(timestamp)}</span>
        </div>
      </div>
    </div>
  )
}

function ActivityTimelineGroup({ 
  title, 
  activities, 
  onPartClick 
}: { 
  title: string
  activities: any[]
  onPartClick: (partId: string) => void 
}) {
  if (activities.length === 0) return null

  return (
    <div className="space-y-1" data-testid="dashboard.activity.group" data-group-title={title}>
      {/* Group Header - Sticky */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm py-2 border-b border-muted/50">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </h3>
      </div>
      
      {/* Group Activities */}
      <div className="space-y-1">
        {activities.map((activity, index) => (
          <ActivityItem
            key={`${activity.part_key}-${activity.timestamp}-${index}`}
            partKey={activity.part_key}
            partDescription={activity.part_description}
            deltaQty={activity.delta_qty}
            locationReference={activity.location_reference}
            timestamp={activity.timestamp}
            onPartClick={onPartClick}
          />
        ))}
      </div>
    </div>
  )
}

export function RecentActivityTimeline() {
  const { data: activities, isLoading, error } = useDashboardActivity()
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(false)

  const handlePartClick = (partId: string) => {
    navigate({ to: '/parts/$partId', params: { partId } })
  }

  // Group activities by time-based categories as per plan
  const groupedActivities = useMemo(() => {
    if (!activities) return {}

    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const groups: Record<string, any[]> = {
      'Just Now': [],
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'Earlier': []
    }

    activities.forEach((activity: any) => {
      const activityTime = new Date(activity.timestamp)
      
      if (activityTime > oneHourAgo) {
        groups['Just Now'].push(activity)
      } else if (activityTime > oneDayAgo) {
        groups['Today'].push(activity)
      } else if (activityTime > twoDaysAgo) {
        groups['Yesterday'].push(activity)
      } else if (activityTime > oneWeekAgo) {
        groups['This Week'].push(activity)
      } else {
        groups['Earlier'].push(activity)
      }
    })

    return groups
  }, [activities])

  const hasMore = activities && activities.length > 10

  if (isLoading && (!activities || activities.length === 0)) {
    return (
      <Card className="h-fit" data-testid="dashboard.activity" data-state="loading">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="max-h-96 overflow-y-auto">
          <div className="space-y-4" data-testid="dashboard.activity.skeleton">
            {Array.from({ length: 3 }).map((_, groupIndex) => (
              <div key={groupIndex} className="space-y-2">
                <Skeleton width="w-20" height="h-4" />
                {Array.from({ length: 2 }).map((_, itemIndex) => (
                  <div key={itemIndex} className="flex items-start gap-3 p-3">
                    <Skeleton variant="circular" width="w-8" height="h-8" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Skeleton width="w-12" height="h-4" />
                        <Skeleton width="w-16" height="h-4" />
                      </div>
                      <Skeleton width="w-3/4" height="h-4" />
                      <div className="flex gap-2">
                        <Skeleton width="w-12" height="h-3" />
                        <Skeleton width="w-16" height="h-3" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card data-testid="dashboard.activity" data-state="error">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8" data-testid="dashboard.activity.error">
          <div className="text-4xl mb-2">⚠️</div>
          <p className="text-muted-foreground">Failed to load activity</p>
        </CardContent>
      </Card>
    )
  }

  if (!activities || activities.length === 0) {
    return (
      <Card data-testid="dashboard.activity" data-state="empty">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-12" data-testid="dashboard.activity.empty">
          <div className="text-6xl mb-4 opacity-50">🏭</div>
          <h3 className="font-medium mb-2">No recent activity</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add your first part to get started
          </p>
          <Button
            onClick={() => navigate({ to: '/parts/new' })}
            variant="outline"
            size="sm"
            data-testid="dashboard.activity.empty.cta"
          >
            Add Part
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-fit" data-testid="dashboard.activity" data-state="ready">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle>Recent Activity</CardTitle>
          <div className="text-sm text-muted-foreground" data-testid="dashboard.activity.count">
            {activities.length} changes
          </div>
        </div>
      </CardHeader>
      <CardContent className="max-h-96 overflow-y-auto space-y-4" data-testid="dashboard.activity.groups">
        {Object.entries(groupedActivities).map(([groupTitle, groupActivities]) => (
          <ActivityTimelineGroup
            key={groupTitle}
            title={groupTitle}
            activities={groupActivities}
            onPartClick={handlePartClick}
          />
        ))}

        {hasMore && !showAll && (
          <div className="pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAll(true)}
              className="w-full"
              data-testid="dashboard.activity.show-more"
            >
              Show More ({activities.length - 10} more)
            </Button>
          </div>
        )}

        {showAll && hasMore && (
          <div className="pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAll(false)}
              className="w-full"
              data-testid="dashboard.activity.show-less"
            >
              Show Less
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
