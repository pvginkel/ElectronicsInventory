import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useDashboardCategories } from '@/hooks/use-dashboard'
import { useNavigate } from '@tanstack/react-router'
import { useState, useMemo } from 'react'

interface CategoryBarProps {
  categoryName: string
  count: number
  maxCount: number
  color: string
  onCategoryClick: (categoryName: string) => void
}

function CategoryBar({ categoryName, count, maxCount, color, onCategoryClick }: CategoryBarProps) {
  const [isHovered, setIsHovered] = useState(false)
  const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0

  return (
    <div 
      className="group cursor-pointer transition-all duration-200 hover:scale-105 relative"
      onClick={() => onCategoryClick(categoryName)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid="dashboard.categories.bar"
      data-category={categoryName}
      data-count={count}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium truncate" title={categoryName} data-testid="dashboard.categories.bar.name">
          {categoryName}
        </span>
        <span className="text-sm font-semibold ml-2" data-testid="dashboard.categories.bar.count">
          {count.toLocaleString()}
        </span>
      </div>
      
      <div className="relative w-full bg-muted/50 rounded-full h-3 overflow-hidden" data-testid="dashboard.categories.bar.track">
        <div
          className={`
            h-3 rounded-full transition-all duration-500 ease-out relative
            ${isHovered ? 'brightness-110 shadow-sm' : ''}
          `}
          style={{ 
            width: `${Math.max(percentage, 2)}%`,
            backgroundColor: color,
          }}
          data-testid="dashboard.categories.bar.fill"
        >
          {/* Shine effect on hover */}
          {isHovered && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
          )}
        </div>
        
        {/* Percentage label */}
        {percentage >= 20 && (
          <div className="absolute inset-0 flex items-center justify-end pr-2">
            <span className="text-xs font-medium text-white/90">
              {Math.round(percentage)}%
            </span>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {isHovered && (
        <div className="absolute bottom-full left-0 mb-2 z-[70] bg-popover border rounded-lg px-3 py-2 shadow-lg text-sm pointer-events-none max-w-xs whitespace-nowrap" data-testid="dashboard.categories.bar.tooltip">
          <div className="font-semibold">{categoryName}</div>
          <div className="text-muted-foreground">{count} parts ({Math.round(percentage)}%)</div>
        </div>
      )}
    </div>
  )
}

interface SmartInsightProps {
  insight: {
    type: 'consolidation' | 'new_category' | 'dominance'
    message: string
    severity: 'info' | 'warning' | 'success'
  }
}

function SmartInsight({ insight }: SmartInsightProps) {
  const getInsightStyles = (severity: string) => {
    switch (severity) {
      case 'warning':
        return {
          bg: 'bg-amber-50 border-amber-200',
          text: 'text-amber-800',
          icon: '⚠️'
        }
      case 'success':
        return {
          bg: 'bg-green-50 border-green-200',
          text: 'text-green-800',
          icon: '✅'
        }
      default:
        return {
          bg: 'bg-blue-50 border-blue-200',
          text: 'text-blue-800',
          icon: '💡'
        }
    }
  }

  const styles = getInsightStyles(insight.severity)

  return (
    <div className={`rounded-lg border p-3 ${styles.bg}`} data-testid="dashboard.categories.insight" data-severity={insight.severity}>
      <div className="flex items-start gap-2">
        <span className="text-lg">{styles.icon}</span>
        <p className={`text-sm ${styles.text}`}>
          {insight.message}
        </p>
      </div>
    </div>
  )
}

function CategoryDistributionSkeleton() {
  return (
    <div className="space-y-6" data-testid="dashboard.categories.skeleton">
      {/* Chart Skeleton */}
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between">
              <div className="w-20 h-4 bg-muted rounded animate-pulse" />
              <div className="w-8 h-4 bg-muted rounded animate-pulse" />
            </div>
            <div className="w-full h-3 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
      
      {/* Insights Skeleton */}
      <div className="space-y-2">
        <div className="h-4 w-24 bg-muted rounded animate-pulse" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-3">
            <div className="flex gap-2">
              <div className="w-6 h-6 bg-muted rounded animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="w-3/4 h-4 bg-muted rounded animate-pulse" />
                <div className="w-1/2 h-3 bg-muted rounded animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Predefined category colors for consistency
const CATEGORY_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#ec4899', // pink
  '#6b7280', // gray
]

export function CategoryDistribution() {
  const { data: categories, isLoading } = useDashboardCategories()
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(false)

  // Process categories and generate insights
  const processedData = useMemo(() => {
    if (!categories || categories.length === 0) return null

    // Sort by part_count (descending)
    const sorted = [...categories].sort((a: any, b: any) => b.part_count - a.part_count)
    
    // Assign colors
    const withColors = sorted.map((category: any, index) => ({
      ...category,
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length]
    }))

    const maxCount = sorted[0]?.part_count || 1
    const totalParts = sorted.reduce((sum: number, cat: any) => sum + cat.part_count, 0)

    // Generate smart insights
    const insights: any[] = []

    // Dominance insight
    const topCategory = sorted[0]
    if (topCategory && (topCategory.part_count / totalParts) > 0.4) {
      insights.push({
        type: 'dominance',
        severity: 'info',
        message: `${topCategory.type_name} dominates your inventory (${Math.round(topCategory.part_count / totalParts * 100)}% of all parts)`
      })
    }

    // Consolidation suggestion
    const topCategories = sorted.slice(0, 3)
    if (topCategories.length >= 3) {
      insights.push({
        type: 'consolidation',
        severity: 'warning',
        message: `Top 3 categories (${topCategories.map((c: any) => c.type_name).join(', ')}) could benefit from better organization`
      })
    }

    // New category detection (simulated - would need historical data)
    const smallCategories = sorted.filter((c: any) => c.part_count <= 5)
    if (smallCategories.length > 0) {
      insights.push({
        type: 'new_category',
        severity: 'success',
        message: `${smallCategories.length} emerging categories with small quantities detected`
      })
    }

    return {
      categories: withColors,
      maxCount,
      totalParts,
      insights
    }
  }, [categories])

  const handleCategoryClick = (categoryName: string) => {
    // TODO: Navigate to parts filtered by category
    navigate({ to: '/parts', search: { search: categoryName } })
    console.log('Filter by category:', categoryName)
  }

  if (isLoading && !processedData) {
    return (
      <Card data-testid="dashboard.categories" data-state="loading">
        <CardHeader>
          <CardTitle>Category Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryDistributionSkeleton />
        </CardContent>
      </Card>
    )
  }

  if (!processedData) {
    return (
      <Card data-testid="dashboard.categories" data-state="empty">
        <CardHeader>
          <CardTitle>Category Distribution</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-12" data-testid="dashboard.categories.empty">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="font-medium mb-2">No categories found</h3>
          <p className="text-sm text-muted-foreground">
            Add parts with categories to see distribution
          </p>
        </CardContent>
      </Card>
    )
  }

  const { categories: sortedCategories, maxCount, totalParts, insights } = processedData

  // Limit to 10 categories initially, similar to low stock alerts
  const displayedCategories = showAll ? sortedCategories : sortedCategories.slice(0, 10)
  const hasMore = sortedCategories.length > 10

  return (
    <Card data-testid="dashboard.categories" data-state="ready">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle>Category Distribution</CardTitle>
          <div className="text-sm text-muted-foreground" data-testid="dashboard.categories.summary">
            {totalParts.toLocaleString()} total parts
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Interactive Bar Chart */}
        <div className="space-y-4" data-testid="dashboard.categories.list">
          {displayedCategories.map((category: any) => (
            <CategoryBar
              key={category.type_name}
              categoryName={category.type_name}
              count={category.part_count}
              maxCount={maxCount}
              color={category.color}
              onCategoryClick={handleCategoryClick}
            />
          ))}
        </div>

        {/* Show More Button */}
        {hasMore && !showAll && (
          <Button
            variant="outline"
            onClick={() => setShowAll(true)}
            className="w-full"
            size="sm"
            data-testid="dashboard.categories.show-more"
          >
            Show {sortedCategories.length - 10} More
          </Button>
        )}

        {showAll && hasMore && (
          <Button
            variant="outline"
            onClick={() => setShowAll(false)}
            className="w-full"
            size="sm"
            data-testid="dashboard.categories.show-less"
          >
            Show Less
          </Button>
        )}

        {/* Smart Insights */}
        {insights.length > 0 && (
          <div className="space-y-3" data-testid="dashboard.categories.insights">
            <h3 className="text-sm font-semibold">Insights</h3>
            <div className="space-y-2">
              {insights.map((insight, index) => (
                <SmartInsight key={index} insight={insight} />
              ))}
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="pt-4 border-t" data-testid="dashboard.categories.stats">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-lg font-semibold" data-testid="dashboard.categories.stats.count">{sortedCategories.length}</div>
              <div className="text-xs text-muted-foreground">Categories</div>
            </div>
            <div>
              <div className="text-lg font-semibold">
                {sortedCategories.length > 0 
                  ? Math.round(totalParts / sortedCategories.length)
                  : 0
                }
              </div>
              <div className="text-xs text-muted-foreground">Avg per Category</div>
            </div>
          </div>
        </div>

        {/* View All Link */}
        <div className="pt-2 border-t">
          <button
            onClick={() => navigate({ to: '/types' })}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="dashboard.categories.manage"
          >
            Manage Categories →
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
