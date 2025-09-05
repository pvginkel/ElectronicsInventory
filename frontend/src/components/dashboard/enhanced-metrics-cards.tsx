import { Card, CardContent } from '@/components/ui/card'
import { useDashboardStats, useDashboardLowStock } from '@/hooks/use-dashboard'
import { useMemo } from 'react'

interface MetricsCardProps {
  title: string
  value: number | string
  icon: string
  trend?: {
    value: number
    isPositive: boolean
    label?: string
  }
  subtitle?: string
  isLoading?: boolean
  className?: string
}

function MetricsCard({ title, value, icon, trend, subtitle, isLoading, className }: MetricsCardProps) {
  const formatValue = (val: number | string) => {
    if (isLoading) return '—'
    if (typeof val === 'number') {
      return val.toLocaleString()
    }
    return val
  }

  return (
    <Card variant="stats" className={className}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="flex items-baseline gap-2">
              <p className={`text-2xl font-bold ${isLoading ? 'animate-pulse' : ''}`}>
                {formatValue(value)}
              </p>
              {trend && !isLoading && (
                <span className={`text-xs font-medium flex items-center gap-1 ${
                  trend.isPositive ? 'text-green-600' : 'text-red-600'
                }`}>
                  <span className="text-sm">
                    {trend.isPositive ? '↗' : '↘'}
                  </span>
                  {Math.abs(trend.value)}{trend.label || '%'}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className={`text-3xl ${isLoading ? 'animate-pulse opacity-30' : 'opacity-60'}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function EnhancedMetricsCards() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: lowStock, isLoading: lowStockLoading } = useDashboardLowStock()

  // Calculate trends and additional metrics
  const metrics = useMemo(() => {
    if (!stats) {
      return {
        totalParts: { value: 0, trend: undefined },
        storageBoxes: { value: 0, trend: undefined },
        lowStock: { value: 0, trend: undefined },
        recentActivity: { value: 0, trend: undefined },
      }
    }

    // Calculate trend for recent activity (30d vs 7d extrapolated)
    const activityTrend = stats.changes_7d > 0 ? {
      value: Math.round(((stats.changes_7d * 4.3) - stats.changes_30d) / stats.changes_30d * 100),
      isPositive: (stats.changes_7d * 4.3) > stats.changes_30d
    } : undefined

    return {
      totalParts: {
        value: stats.total_parts,
        trend: undefined // We don't have historical part count data
      },
      storageBoxes: {
        value: stats.total_boxes,
        trend: undefined // Static data typically
      },
      lowStock: {
        value: lowStock?.length || stats.low_stock_count,
        trend: undefined // Would need historical low stock data
      },
      recentActivity: {
        value: stats.changes_7d,
        trend: activityTrend,
        label: ' this week'
      },
    }
  }, [stats, lowStock])

  const isLoading = statsLoading || lowStockLoading

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
      <MetricsCard
        title="Total Parts"
        value={metrics.totalParts.value}
        icon="🔧"
        trend={metrics.totalParts.trend}
        subtitle="Unique components"
        isLoading={isLoading}
      />
      
      <MetricsCard
        title="Storage Boxes"
        value={metrics.storageBoxes.value}
        icon="📦"
        trend={metrics.storageBoxes.trend}
        subtitle="Active locations"
        isLoading={isLoading}
      />
      
      <MetricsCard
        title="Low Stock"
        value={metrics.lowStock.value}
        icon="⚠️"
        trend={metrics.lowStock.trend}
        subtitle="Need attention"
        isLoading={isLoading}
        className="[&_p:first-child]:text-amber-600 dark:[&_p:first-child]:text-amber-400"
      />
      
      <MetricsCard
        title="Activity"
        value={metrics.recentActivity.value}
        icon="📈"
        trend={metrics.recentActivity.trend}
        subtitle="Changes this week"
        isLoading={isLoading}
      />
    </div>
  )
}

// Skeleton loader for metrics cards
export function MetricsCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} variant="stats">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="text-left space-y-2">
                <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                <div className="h-3 w-24 bg-muted rounded animate-pulse" />
              </div>
              <div className="w-8 h-8 bg-muted rounded animate-pulse" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}