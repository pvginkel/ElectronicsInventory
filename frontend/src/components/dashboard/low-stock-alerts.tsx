import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDashboardLowStock } from '@/hooks/use-dashboard'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

interface LowStockItemProps {
  partKey: string
  partDescription: string
  currentQty: number
  onAddToShoppingList: () => void
  onQuickAddStock: (quantity: number) => void
  onViewPart: () => void
  onDismiss: () => void
}

function LowStockItem({
  partKey,
  partDescription,
  currentQty,
  onAddToShoppingList,
  onQuickAddStock,
  onViewPart,
  onDismiss
}: LowStockItemProps) {
  const [quickAddAmount, setQuickAddAmount] = useState('')
  const [showQuickAdd, setShowQuickAdd] = useState(false)

  // Criticality levels as per plan
  const getCriticalityLevel = (qty: number) => {
    if (qty <= 2) return 'critical'  // 0-2: Critical
    if (qty <= 5) return 'low'       // 3-5: Low
    if (qty <= 10) return 'warning'  // 6-10: Warning
    return 'normal'
  }

  const criticality = getCriticalityLevel(currentQty)

  const getCriticalityColors = (level: string) => {
    switch (level) {
      case 'critical':
        return {
          bg: 'bg-red-50 border-red-200',
          text: 'text-red-800',
          badge: 'bg-red-500 text-white',
          animation: 'animate-pulse'
        }
      case 'low':
        return {
          bg: 'bg-amber-50 border-amber-200',
          text: 'text-amber-800',
          badge: 'bg-amber-500 text-white',
          animation: ''
        }
      case 'warning':
        return {
          bg: 'bg-yellow-50 border-yellow-200',
          text: 'text-yellow-800',
          badge: 'bg-yellow-500 text-white',
          animation: ''
        }
      default:
        return {
          bg: 'bg-muted/30 border-muted',
          text: 'text-foreground',
          badge: 'bg-muted text-muted-foreground',
          animation: ''
        }
    }
  }

  const colors = getCriticalityColors(criticality)

  const handleQuickAdd = () => {
    const amount = parseInt(quickAddAmount)
    if (amount > 0) {
      onQuickAddStock(amount)
      setQuickAddAmount('')
      setShowQuickAdd(false)
    }
  }

  return (
    <div
      className={`
      rounded-lg border p-4 space-y-3 transition-all duration-300
      ${colors.bg} ${colors.animation}
    `}
      data-testid="dashboard.low-stock.item"
      data-part-key={partKey}
      data-criticality={criticality}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-bold" data-testid="dashboard.low-stock.item.part">{partKey}</span>
          <div className={`px-2 py-1 rounded-full text-xs font-medium ${colors.badge}`} data-testid="dashboard.low-stock.item.badge">
            {currentQty} left
          </div>
          {criticality === 'critical' && (
            <div className="text-red-500 text-sm">⚠️</div>
          )}
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground h-6 w-6 p-0"
          data-testid="dashboard.low-stock.item.dismiss"
        >
          ×
        </Button>
      </div>

      {/* Description */}
      <p
        className={`text-sm font-medium truncate ${colors.text}`}
        title={partDescription}
        data-testid="dashboard.low-stock.item.description"
      >
        {partDescription}
      </p>

      {/* Quick Add Stock Input */}
      {showQuickAdd && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="Qty"
            value={quickAddAmount}
            onChange={(e) => setQuickAddAmount(e.target.value)}
            className="h-8 text-sm flex-1"
            min="1"
            onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
          />
          <Button
            size="sm"
            onClick={handleQuickAdd}
            disabled={!quickAddAmount || parseInt(quickAddAmount) <= 0}
            className="h-8 px-3"
            data-testid="dashboard.low-stock.item.quick-add.confirm"
          >
            Add
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowQuickAdd(false)
              setQuickAddAmount('')
            }}
            className="h-8 px-2"
            data-testid="dashboard.low-stock.item.quick-add.cancel"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onAddToShoppingList}
          className="flex-1 h-8 text-xs"
          data-testid="dashboard.low-stock.item.shopping-list"
        >
          🛒 Add to List
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowQuickAdd(!showQuickAdd)}
          className="flex-1 h-8 text-xs"
          data-testid="dashboard.low-stock.item.quick-add.toggle"
        >
          ➕ Quick Add
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={onViewPart}
          className="h-8 px-2"
          data-testid="dashboard.low-stock.item.view"
        >
          →
        </Button>
      </div>
    </div>
  )
}

function LowStockSkeleton() {
  return (
    <div className="space-y-3" data-testid="dashboard.low-stock.skeleton">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="border rounded-lg p-4 space-y-3" data-testid="dashboard.low-stock.skeleton.card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-4 bg-muted rounded animate-pulse" />
              <div className="w-16 h-5 bg-muted rounded animate-pulse" />
            </div>
            <div className="w-6 h-6 bg-muted rounded animate-pulse" />
          </div>
          <div className="w-3/4 h-4 bg-muted rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="flex-1 h-8 bg-muted rounded animate-pulse" />
            <div className="flex-1 h-8 bg-muted rounded animate-pulse" />
            <div className="w-8 h-8 bg-muted rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function LowStockAlerts() {
  const { data: lowStockItems, isLoading, error } = useDashboardLowStock()
  const navigate = useNavigate()
  const [dismissedItems, setDismissedItems] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)

  const handleAddToShoppingList = (partKey: string) => {
    // TODO: Implement shopping list functionality
    console.log('Add to shopping list:', partKey)
  }

  const handleQuickAddStock = (partKey: string, quantity: number) => {
    // TODO: Implement quick add stock functionality
    console.log('Quick add stock:', partKey, quantity)
  }

  const handleViewPart = (partKey: string) => {
    navigate({ to: '/parts/$partId', params: { partId: partKey } })
  }

  const handleDismiss = (partKey: string) => {
    setDismissedItems(prev => new Set([...prev, partKey]))
  }

  // Filter out dismissed items and sort by criticality
  const filteredItems = lowStockItems
    ?.filter((item: any) => !dismissedItems.has(item.part_key))
    ?.sort((a: any, b: any) => {
      // Sort by current quantity (ascending) - most critical first
      return (a.current_quantity ?? 0) - (b.current_quantity ?? 0)
    })

  const displayedItems = showAll ? filteredItems : filteredItems?.slice(0, 3)
  const hasMore = filteredItems && filteredItems.length > 3

  if (isLoading && (!lowStockItems || lowStockItems.length === 0)) {
    return (
      <Card data-testid="dashboard.low-stock" data-state="loading">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            ⚠️ Low Stock Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LowStockSkeleton />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card data-testid="dashboard.low-stock" data-state="error">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            ⚠️ Low Stock Alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8" data-testid="dashboard.low-stock.error">
          <div className="text-4xl mb-2">❌</div>
          <p className="text-muted-foreground">Failed to load low stock items</p>
        </CardContent>
      </Card>
    )
  }

  if (!filteredItems || filteredItems.length === 0) {
    return (
      <Card data-testid="dashboard.low-stock" data-state="empty">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            ✅ Stock Status
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-12" data-testid="dashboard.low-stock.empty">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="font-medium mb-2 text-green-600">All stock levels good!</h3>
          <p className="text-sm text-muted-foreground">
            No parts are currently running low
          </p>
        </CardContent>
      </Card>
    )
  }

  const criticalCount = filteredItems.filter((item: any) => (item.current_quantity ?? 0) <= 2).length

  return (
    <Card data-testid="dashboard.low-stock" data-state="ready">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            ⚠️ Low Stock Alerts
          </CardTitle>
          <div className="text-sm text-muted-foreground" data-testid="dashboard.low-stock.summary">
            {criticalCount > 0 && (
              <span className="text-red-600 font-medium mr-2">
                {criticalCount} critical
              </span>
            )}
            {filteredItems.length} total
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="space-y-3" data-testid="dashboard.low-stock.list">
          {displayedItems?.map((item: any) => (
            <LowStockItem
              key={item.part_key}
              partKey={item.part_key}
              partDescription={item.part_description}
              currentQty={item.current_quantity}
              onAddToShoppingList={() => handleAddToShoppingList(item.part_key)}
              onQuickAddStock={(qty) => handleQuickAddStock(item.part_key, qty)}
              onViewPart={() => handleViewPart(item.part_key)}
              onDismiss={() => handleDismiss(item.part_key)}
            />
          ))}
        </div>

        {hasMore && !showAll && (
          <Button
            variant="outline"
            onClick={() => setShowAll(true)}
            className="w-full"
            size="sm"
            data-testid="dashboard.low-stock.show-more"
          >
            Show {filteredItems.length - 3} More
          </Button>
        )}

        {showAll && hasMore && (
          <Button
            variant="outline"
            onClick={() => setShowAll(false)}
            className="w-full"
            size="sm"
            data-testid="dashboard.low-stock.show-less"
          >
            Show Less
          </Button>
        )}

        {dismissedItems.size > 0 && (
          <div className="pt-4 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDismissedItems(new Set())}
              className="w-full text-xs text-muted-foreground"
              data-testid="dashboard.low-stock.restore-dismissed"
            >
              Show {dismissedItems.size} dismissed alerts
            </Button>
          </div>
        )}

        <div className="pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: '/parts' })} // TODO: Navigate to parts with low stock filter
            className="w-full text-xs"
            data-testid="dashboard.low-stock.manage-all"
          >
            Manage All Low Stock Items →
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
