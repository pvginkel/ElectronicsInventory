# Dashboard Feature - Technical Plan

## Description
Replace the current placeholder dashboard with a functional, data-driven dashboard that displays real-time inventory statistics, recent activity, storage utilization, and actionable insights for managing electronics parts inventory.

## Files to Create

### Backend
- `app/services/dashboard_service.py` - Service layer for aggregating dashboard data
- `app/api/dashboard.py` - API endpoints for dashboard data
- `app/schemas/dashboard.py` - Pydantic schemas for dashboard responses

### Frontend  
- `src/hooks/use-dashboard-stats.ts` - Hook for fetching dashboard statistics
- `src/hooks/use-recent-activity.ts` - Hook for fetching recent activity
- `src/hooks/use-storage-summary.ts` - Hook for fetching storage utilization
- `src/components/dashboard/storage-grid.tsx` - Component for box usage visualization
- `src/components/dashboard/activity-feed.tsx` - Component for recent activity display
- `src/components/dashboard/category-distribution.tsx` - Component for type distribution chart
- `src/components/dashboard/low-stock-alerts.tsx` - Component for low stock warnings

## Files to Modify

### Backend
- `app/api/__init__.py` - Register dashboard blueprint
- `app/services/container.py` - Add dashboard_service to dependency injection container

### Frontend
- `src/routes/index.tsx` - Replace placeholder content with real dashboard components
- `src/components/dashboard/metrics-card.tsx` - Connect to real data instead of hardcoded values
- `src/components/dashboard/quick-actions.tsx` - Wire up navigation to actual routes

## Implementation Details

### Backend Service Methods

#### `dashboard_service.py`
1. `get_dashboard_stats()` - Returns aggregated statistics:
   - Query total parts count from `parts` table
   - Calculate total quantity sum from `part_locations` table
   - Count active boxes from `boxes` table
   - Count types from `types` table
   - Count quantity changes in last 7 and 30 days from `quantity_history`
   - Count parts with total quantity ≤ 5

2. `get_recent_activity(limit: int)` - Returns recent stock changes:
   - Query `quantity_history` joined with `parts` table
   - Order by timestamp descending
   - Include part key, description, delta quantity, location reference
   - Group by relative time (today, yesterday, this week)

3. `get_storage_summary()` - Returns box utilization:
   - Query all boxes with their capacities
   - Count occupied locations per box from `part_locations`
   - Calculate usage percentage for each box
   - Return box_no, description, total_locations, occupied_locations, usage_percentage

4. `get_low_stock_items(threshold: int)` - Returns parts below threshold:
   - Query parts with aggregated quantities from `part_locations`
   - Filter where total quantity ≤ threshold
   - Include part key, description, type, current quantity
   - Order by quantity ascending

5. `get_category_distribution()` - Returns part counts by type:
   - Query types with part count using existing `type_service.get_all_types_with_part_counts()`
   - Return type name, color, part count
   - Order by part count descending

6. `get_parts_without_documents()` - Returns undocumented parts:
   - Query parts without entries in `part_attachments` table
   - Return count and first 10 part details

### API Endpoints

#### `dashboard.py`
1. `GET /api/dashboard/stats`
   - Calls `dashboard_service.get_dashboard_stats()`
   - Returns `DashboardStatsSchema`
   - Cache for 60 seconds

2. `GET /api/dashboard/recent-activity?limit=20`
   - Calls `dashboard_service.get_recent_activity(limit)`
   - Returns list of `RecentActivitySchema`
   - No caching (real-time data)

3. `GET /api/dashboard/storage-summary`
   - Calls `dashboard_service.get_storage_summary()`
   - Returns list of `StorageSummarySchema`
   - Cache for 60 seconds

4. `GET /api/dashboard/low-stock?threshold=5`
   - Calls `dashboard_service.get_low_stock_items(threshold)`
   - Returns list of `LowStockItemSchema`
   - Cache for 60 seconds

5. `GET /api/dashboard/category-distribution`
   - Calls `dashboard_service.get_category_distribution()`
   - Returns list of `CategoryDistributionSchema`
   - Cache for 300 seconds

### Frontend Data Flow

1. Dashboard route (`index.tsx`) mounts and triggers parallel data fetches
2. Custom hooks call respective API endpoints using fetch or axios
3. Components receive data via hooks and render:
   - MetricsCard displays stats with real values
   - StorageGrid shows box utilization with color coding
   - ActivityFeed displays recent changes chronologically
   - CategoryDistribution renders chart (using existing chart library)
   - LowStockAlerts shows warning cards

### Database Query Optimizations

1. Use SQLAlchemy query builder with proper joins
2. Create composite index on `quantity_history(timestamp, part_id)`
3. Use `func.sum()` and `func.count()` for aggregations
4. Limit subqueries by using CTEs where appropriate
5. Cache expensive queries at service level using Flask-Caching

## Implementation Phases

### Phase 1: Core Dashboard Data (Priority 1)
1. Create dashboard service with basic stats method
2. Create dashboard API with stats endpoint
3. Update frontend dashboard to display real metrics
4. Wire up existing quick actions to proper routes

### Phase 2: Activity and Storage (Priority 2)
1. Add recent activity service method and endpoint
2. Add storage summary service method and endpoint
3. Create activity feed component
4. Create storage grid component
5. Integrate both into dashboard

### Phase 3: Insights and Alerts (Priority 3)
1. Add low stock items service method and endpoint
2. Add category distribution service method and endpoint
3. Add parts without documents service method
4. Create alert components
5. Add category chart visualization