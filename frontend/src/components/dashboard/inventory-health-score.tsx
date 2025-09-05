import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useDashboardData } from '@/hooks/use-dashboard'
import { useState } from 'react'

interface CircularProgressProps {
  value: number
  size?: number
  strokeWidth?: number
  className?: string
}

function CircularProgress({ value, size = 200, strokeWidth = 8, className }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const strokeDasharray = circumference
  const strokeDashoffset = circumference - (value / 100) * circumference

  // Determine color based on score
  const getColor = (score: number) => {
    if (score >= 90) return 'text-green-500'
    if (score >= 70) return 'text-blue-500'
    if (score >= 50) return 'text-amber-500'
    return 'text-red-500'
  }

  const getLabel = (score: number) => {
    if (score >= 90) return 'Excellent'
    if (score >= 70) return 'Good'
    if (score >= 50) return 'Needs Attention'
    return 'Critical'
  }

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
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
          className={`${getColor(value)} transition-all duration-1000 ease-out`}
          style={{
            animation: value > 0 ? 'progress-animation 1s ease-out' : 'none',
          }}
        />
      </svg>
      
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`text-4xl font-bold ${getColor(value)}`}>
          {Math.round(value)}%
        </div>
        <div className="text-sm font-medium text-muted-foreground mt-1">
          {getLabel(value)}
        </div>
      </div>

    </div>
  )
}

interface HealthBreakdownTooltipProps {
  isVisible: boolean
  onClose: () => void
  stats?: any
  documentation?: any
  storage?: any
  lowStock?: any
  activity?: any
}

function HealthBreakdownTooltip({ 
  isVisible, 
  onClose, 
  stats, 
  documentation, 
  storage, 
  lowStock, 
  activity 
}: HealthBreakdownTooltipProps) {
  if (!isVisible || !stats) return null

  const totalParts = stats.total_parts || 1
  const documentedParts = totalParts - (documentation?.count || 0)
  const documentationScore = (documentedParts / totalParts) * 100

  const lowStockCount = lowStock?.length || 0
  const stockScore = Math.max(0, 100 - (lowStockCount / totalParts) * 100)

  const totalBoxes = storage?.length || 1
  const usedBoxes = storage?.filter((box: any) => (box.used_locations || 0) > 0).length || 0
  const avgUtilization = storage?.reduce((sum: number, box: any) => 
    sum + ((box.used_locations || 0) / (box.total_locations || 1)), 0
  ) / totalBoxes || 0
  const organizationScore = (usedBoxes / totalBoxes) * 50 + avgUtilization * 50

  const recentActivityCount = activity?.length || 0
  const activityScore = Math.min(100, recentActivityCount * 10)

  const breakdown = [
    { 
      label: 'Documentation', 
      score: documentationScore, 
      weight: 40, 
      description: `${documentedParts}/${totalParts} parts documented`
    },
    { 
      label: 'Stock Levels', 
      score: stockScore, 
      weight: 25, 
      description: `${lowStockCount} parts low on stock`
    },
    { 
      label: 'Organization', 
      score: organizationScore, 
      weight: 20, 
      description: `${usedBoxes}/${totalBoxes} boxes active`
    },
    { 
      label: 'Recent Activity', 
      score: activityScore, 
      weight: 15, 
      description: `${recentActivityCount} recent changes`
    },
  ]

  return (
    <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-80 bg-popover border rounded-lg shadow-lg p-4 z-10">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-sm">Health Score Breakdown</h3>
        <button 
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-lg leading-none"
        >
          ×
        </button>
      </div>
      
      <div className="space-y-3">
        {breakdown.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium">{item.label} ({item.weight}%)</span>
              <span className={`font-semibold ${
                item.score >= 70 ? 'text-green-600' : 
                item.score >= 50 ? 'text-amber-600' : 'text-red-600'
              }`}>
                {Math.round(item.score)}%
              </span>
            </div>
            <div className="w-full bg-muted/50 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  item.score >= 70 ? 'bg-green-500' : 
                  item.score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.max(item.score, 5)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
      
      <div className="mt-4 pt-3 border-t text-xs text-muted-foreground">
        Click to view detailed health report
      </div>
    </div>
  )
}

export function InventoryHealthScore() {
  const { healthScore, isLoading, stats, documentation, storage, lowStock, activity } = useDashboardData()
  const [showTooltip, setShowTooltip] = useState(false)

  const handleClick = () => {
    // TODO: Navigate to detailed health report
    console.log('Navigate to detailed health report')
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Inventory Health</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <div className="relative">
            <div className="w-48 h-48 rounded-full bg-muted animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-8 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="relative">
      <CardHeader>
        <CardTitle>Inventory Health</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center">
        <div 
          className="relative cursor-pointer transition-transform hover:scale-105"
          onClick={handleClick}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <CircularProgress 
            value={healthScore} 
            size={200}
            strokeWidth={12}
          />
          
          <HealthBreakdownTooltip
            isVisible={showTooltip}
            onClose={() => setShowTooltip(false)}
            stats={stats}
            documentation={documentation}
            storage={storage}
            lowStock={lowStock}
            activity={activity}
          />
        </div>
        
        <p className="text-sm text-muted-foreground mt-4 text-center max-w-sm">
          Overall system health based on documentation, stock levels, organization, and activity
        </p>
      </CardContent>
    </Card>
  )
}