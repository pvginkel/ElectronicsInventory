import { createFileRoute } from '@tanstack/react-router'
import { MetricsCard } from '@/components/dashboard/metrics-card'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="text-center py-4 md:py-8">
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight">Electronics Inventory</h1>
        <p className="text-base md:text-lg text-muted-foreground mt-2">
          Manage your electronic components with ease
        </p>
      </div>

      {/* Metrics Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
        <MetricsCard
          title="Total Parts"
          value={1247}
          icon="🔧"
          trend={{ value: 12, isPositive: true }}
          subtitle="Last month"
        />
        <MetricsCard
          title="Storage Boxes"
          value={8}
          icon="📦"
          subtitle="Active locations"
        />
        <MetricsCard
          title="Active Projects"
          value={3}
          icon="⚡"
          trend={{ value: 5, isPositive: false }}
          subtitle="In progress"
        />
        <MetricsCard
          title="Shopping List"
          value={23}
          icon="🛒"
          subtitle="Items to order"
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl md:text-2xl font-semibold mb-4">Quick Actions</h2>
        <QuickActions />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                <span className="text-lg">➕</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">Added 50x Resistor 10kΩ</p>
                  <p className="text-xs text-muted-foreground">Box 2, Location 15 • 2 hours ago</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                <span className="text-lg">📦</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">Reorganized Box 3</p>
                  <p className="text-xs text-muted-foreground">Grouped all capacitors • 1 day ago</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                <span className="text-lg">🔧</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">Used 5x Arduino Nano</p>
                  <p className="text-xs text-muted-foreground">Project: LED Matrix • 2 days ago</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Suggestions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                <span className="text-lg">💡</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">Consider organizing Box 4</p>
                  <p className="text-xs text-muted-foreground">Mixed component types detected</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                <span className="text-lg">🛒</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">Restock reminder</p>
                  <p className="text-xs text-muted-foreground">Running low on 0.1µF capacitors</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                <span className="text-lg">📄</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">Missing datasheets</p>
                  <p className="text-xs text-muted-foreground">3 parts could use documentation</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}