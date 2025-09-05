import { createFileRoute } from '@tanstack/react-router'
import { QuickFindWidget } from '@/components/dashboard/quick-find-widget'
import { EnhancedMetricsCards } from '@/components/dashboard/enhanced-metrics-cards'
import { InventoryHealthScore } from '@/components/dashboard/inventory-health-score'
import { StorageUtilizationGrid } from '@/components/dashboard/storage-utilization-grid'
import { RecentActivityTimeline } from '@/components/dashboard/recent-activity-timeline'
import { LowStockAlerts } from '@/components/dashboard/low-stock-alerts'
import { DocumentationStatus } from '@/components/dashboard/documentation-status'
import { CategoryDistribution } from '@/components/dashboard/category-distribution'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Quick Find Bar - Persistent, always accessible */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm py-4 -mx-6 px-6 border-b">
        <QuickFindWidget className="max-w-2xl mx-auto" />
      </div>

      {/* Key Metrics */}
      <EnhancedMetricsCards />

      {/* Main Dashboard Grid - Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Health Score (Visual Focus) */}
        <div className="lg:col-span-1">
          <InventoryHealthScore />
        </div>

        {/* Right Column - Activity Timeline */}
        <div className="lg:col-span-2">
          <RecentActivityTimeline />
        </div>
      </div>

      {/* Storage Utilization - Full Width */}
      <StorageUtilizationGrid />

      {/* Bottom Grid - Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Low Stock Alerts */}
        <LowStockAlerts />
        
        {/* Documentation Coverage */}
        <DocumentationStatus />
        
        {/* Categories Distribution */}
        <CategoryDistribution />
      </div>
    </div>
  )
}