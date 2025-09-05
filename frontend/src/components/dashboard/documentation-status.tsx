import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useDashboardData } from '@/hooks/use-dashboard'
import { useNavigate } from '@tanstack/react-router'
import { useState, useMemo } from 'react'

interface CircularProgressProps {
  value: number
  size?: number
  strokeWidth?: number
  showAnimation?: boolean
}

function CircularProgress({ value, size = 120, strokeWidth = 8, showAnimation = true }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const strokeDasharray = circumference
  const strokeDashoffset = circumference - (value / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={`text-primary transition-all duration-1000 ease-out ${showAnimation ? '' : 'transition-none'}`}
        />
      </svg>
      
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-bold text-primary">
          {Math.round(value)}%
        </div>
      </div>
    </div>
  )
}

interface MilestoneBadgeProps {
  milestone: number
  achieved: boolean
  current: number
}

function MilestoneBadge({ milestone, achieved, current }: MilestoneBadgeProps) {
  const isNext = !achieved && current < milestone && (current + 20) >= milestone

  return (
    <div className={`
      relative inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold
      transition-all duration-300
      ${achieved 
        ? 'bg-green-500 text-white shadow-md' 
        : isNext
        ? 'bg-primary/20 text-primary border-2 border-primary animate-pulse'
        : 'bg-muted text-muted-foreground'
      }
    `}>
      {milestone}%
      {achieved && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-600 rounded-full flex items-center justify-center">
          <span className="text-white text-xs">✓</span>
        </div>
      )}
    </div>
  )
}

interface UndocumentedPartProps {
  partKey: string
  partDescription: string
  onAddDocumentation: () => void
  onViewPart: () => void
}

function UndocumentedPartItem({ partKey, partDescription, onAddDocumentation, onViewPart }: UndocumentedPartProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-sm font-semibold">{partKey}</span>
        </div>
        <p className="text-sm text-muted-foreground truncate" title={partDescription}>
          {partDescription}
        </p>
      </div>
      
      <div className="flex items-center gap-2 ml-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onAddDocumentation}
          className="h-8 px-3 text-xs"
        >
          📄 Add Docs
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onViewPart}
          className="h-8 px-2"
        >
          →
        </Button>
      </div>
    </div>
  )
}

function DocumentationSkeleton() {
  return (
    <div className="space-y-6">
      {/* Progress Ring Skeleton */}
      <div className="flex flex-col items-center space-y-4">
        <div className="w-32 h-32 rounded-full bg-muted animate-pulse" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-8 h-8 rounded-full bg-muted animate-pulse" />
          ))}
        </div>
      </div>
      
      {/* Parts List Skeleton */}
      <div className="space-y-3">
        <div className="h-4 w-32 bg-muted rounded animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex-1 space-y-2">
              <div className="w-12 h-4 bg-muted rounded animate-pulse" />
              <div className="w-3/4 h-3 bg-muted rounded animate-pulse" />
            </div>
            <div className="flex gap-2">
              <div className="w-20 h-8 bg-muted rounded animate-pulse" />
              <div className="w-8 h-8 bg-muted rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DocumentationStatus() {
  const { documentation, stats, isLoading } = useDashboardData()
  const navigate = useNavigate()
  const [showCelebration, setShowCelebration] = useState(false)

  const documentationStats = useMemo(() => {
    if (!stats || !documentation) return null

    const totalParts = stats.total_parts || 1
    const undocumentedCount = documentation.count || 0
    const documentedCount = totalParts - undocumentedCount
    const percentage = (documentedCount / totalParts) * 100

    // Milestone tracking
    const milestones = [50, 75, 90, 100]
    const achievedMilestones = milestones.filter(m => percentage >= m)

    // Check if we just hit 100%
    if (percentage === 100 && !showCelebration) {
      setShowCelebration(true)
      // Auto-hide celebration after 3 seconds
      setTimeout(() => setShowCelebration(false), 3000)
    }

    return {
      totalParts,
      documentedCount,
      undocumentedCount,
      percentage,
      milestones,
      achievedMilestones
    }
  }, [stats, documentation, showCelebration])

  const handleAddDocumentation = (partKey: string) => {
    navigate({ to: '/parts/$partId', params: { partId: partKey } })
  }

  const handleViewPart = (partKey: string) => {
    navigate({ to: '/parts/$partId', params: { partId: partKey } })
  }

  const handleBulkUpload = () => {
    // TODO: Open bulk document upload modal
    console.log('Open bulk upload modal')
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Documentation Status</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentationSkeleton />
        </CardContent>
      </Card>
    )
  }

  if (!documentationStats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Documentation Status</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <div className="text-4xl mb-2">❓</div>
          <p className="text-muted-foreground">Unable to load documentation status</p>
        </CardContent>
      </Card>
    )
  }

  const { 
    totalParts, 
    documentedCount, 
    undocumentedCount, 
    percentage, 
    milestones, 
    achievedMilestones 
  } = documentationStats

  return (
    <Card className="relative overflow-hidden">
      {/* Celebration Effect */}
      {showCelebration && percentage === 100 && (
        <div className="absolute inset-0 bg-green-500/10 animate-pulse z-10 pointer-events-none">
          <div className="absolute top-4 left-4 text-2xl animate-bounce">🎉</div>
          <div className="absolute top-6 right-6 text-2xl animate-bounce delay-150">🎊</div>
          <div className="absolute bottom-4 left-6 text-2xl animate-bounce delay-300">✨</div>
        </div>
      )}

      <CardHeader>
        <CardTitle>Documentation Status</CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Progress Ring and Milestones */}
        <div className="flex flex-col items-center space-y-4">
          <CircularProgress value={percentage} />
          
          <div className="text-center">
            <div className="text-sm text-muted-foreground">
              {documentedCount} of {totalParts} parts documented
            </div>
            {percentage === 100 && (
              <div className="text-sm font-semibold text-green-600 mt-1">
                Well documented! 🎉
              </div>
            )}
          </div>

          {/* Milestone Badges */}
          <div className="flex items-center gap-3">
            {milestones.map(milestone => (
              <MilestoneBadge
                key={milestone}
                milestone={milestone}
                achieved={achievedMilestones.includes(milestone)}
                current={percentage}
              />
            ))}
          </div>
        </div>

        {/* Quick Fix List */}
        {undocumentedCount > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Quick Fixes</h3>
              {documentation?.sample_parts && documentation.sample_parts.length > 3 && (
                <span className="text-xs text-muted-foreground">
                  Showing top 3 of {undocumentedCount}
                </span>
              )}
            </div>
            
            <div className="space-y-2">
              {documentation?.sample_parts?.slice(0, 3).map((part: any) => (
                <UndocumentedPartItem
                  key={part.part_key}
                  partKey={part.part_key}
                  partDescription={part.description}
                  onAddDocumentation={() => handleAddDocumentation(part.part_key)}
                  onViewPart={() => handleViewPart(part.part_key)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 pt-2 border-t">
          {undocumentedCount > 0 && (
            <>
              <Button
                variant="outline"
                onClick={handleBulkUpload}
                className="w-full"
                size="sm"
              >
                📎 Bulk Upload Documents
              </Button>
              
              {undocumentedCount > 3 && (
                <Button
                  variant="ghost"
                  onClick={() => navigate({ to: '/parts' })} // TODO: Add filter for undocumented
                  className="w-full text-xs"
                  size="sm"
                >
                  View All {undocumentedCount} Undocumented Parts →
                </Button>
              )}
            </>
          )}
          
          {percentage === 100 && (
            <div className="text-center py-2">
              <span className="text-sm text-green-600 font-medium">
                🏆 Perfect documentation achieved!
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}