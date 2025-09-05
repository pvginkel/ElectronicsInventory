import { useMemo } from 'react';
import {
  useGetDashboardStats,
  useGetDashboardRecentActivity,
  useGetDashboardLowStock,
  useGetDashboardStorageSummary,
  useGetDashboardCategoryDistribution,
  useGetDashboardPartsWithoutDocuments,
} from '@/lib/api/generated/hooks';

// Cache times based on plan specifications (in seconds)
const CACHE_TIMES = {
  stats: 30,           // Most dynamic
  activity: 0,         // No cache - Real-time
  storage: 60,         // Less frequent changes
  lowStock: 45,        // Important but not instant
  categories: 300,     // Rarely changes
  documentation: 120   // Moderate frequency
};

export function useDashboardData() {
  // Parallel fetching with stale-while-revalidate
  const statsQuery = useGetDashboardStats({}, {
    staleTime: CACHE_TIMES.stats * 1000,
    refetchInterval: CACHE_TIMES.stats * 1000,
  });

  const activityQuery = useGetDashboardRecentActivity({}, {
    staleTime: CACHE_TIMES.activity * 1000,
    refetchInterval: 5000, // Real-time updates every 5s
  });

  const lowStockQuery = useGetDashboardLowStock({}, {
    staleTime: CACHE_TIMES.lowStock * 1000,
  });

  const storageQuery = useGetDashboardStorageSummary({}, {
    staleTime: CACHE_TIMES.storage * 1000,
  });

  const categoriesQuery = useGetDashboardCategoryDistribution({}, {
    staleTime: CACHE_TIMES.categories * 1000,
  });

  const documentationQuery = useGetDashboardPartsWithoutDocuments({}, {
    staleTime: CACHE_TIMES.documentation * 1000,
  });

  // Computed values
  const healthScore = useMemo(() => {
    if (!statsQuery.data || !documentationQuery.data || !storageQuery.data) return 0;

    const stats = statsQuery.data;
    const undocumented = documentationQuery.data;
    const storage = storageQuery.data;

    // Health scoring algorithm from plan (User-Friendly Weights):
    // 40% - Documentation (most important for finding parts)
    // 25% - Stock levels (avoid running out)
    // 20% - Organization (efficient storage)
    // 15% - Recent activity (system usage)

    const totalParts = stats.total_parts || 1;
    const documentedParts = totalParts - (undocumented.count || 0);
    const documentationScore = (documentedParts / totalParts) * 100;

    // Stock levels based on low stock ratio
    const lowStockCount = lowStockQuery.data?.length || 0;
    const stockScore = Math.max(0, 100 - (lowStockCount / totalParts) * 100);

    // Organization score based on storage efficiency
    const totalBoxes = storage.length || 1;
    const usedBoxes = storage.filter(box => (box.occupied_locations || 0) > 0).length;
    const avgUtilization = storage.reduce((sum, box) => sum + ((box.occupied_locations || 0) / (box.total_locations || 1)), 0) / totalBoxes;
    const organizationScore = (usedBoxes / totalBoxes) * 50 + avgUtilization * 50;

    // Activity score based on recent changes
    const recentActivityCount = activityQuery.data?.length || 0;
    const activityScore = Math.min(100, recentActivityCount * 10); // 10 points per activity, max 100

    const finalScore = (
      documentationScore * 0.40 +
      stockScore * 0.25 +
      organizationScore * 0.20 +
      activityScore * 0.15
    );

    return Math.round(finalScore);
  }, [statsQuery.data, documentationQuery.data, storageQuery.data, lowStockQuery.data, activityQuery.data]);

  // Loading states
  const isLoading = statsQuery.isLoading || activityQuery.isLoading || lowStockQuery.isLoading || 
                   storageQuery.isLoading || categoriesQuery.isLoading || documentationQuery.isLoading;

  // Error states
  const error = statsQuery.error || activityQuery.error || lowStockQuery.error || 
               storageQuery.error || categoriesQuery.error || documentationQuery.error;

  return {
    // Raw data
    stats: statsQuery.data,
    activity: activityQuery.data,
    lowStock: lowStockQuery.data,
    storage: storageQuery.data,
    categories: categoriesQuery.data,
    documentation: documentationQuery.data,

    // Computed values
    healthScore,

    // Loading and error states
    isLoading,
    error,

    // Individual query states for granular loading
    queries: {
      stats: statsQuery,
      activity: activityQuery,
      lowStock: lowStockQuery,
      storage: storageQuery,
      categories: categoriesQuery,
      documentation: documentationQuery,
    },
  };
}

export function useDashboardStats() {
  const { stats, queries } = useDashboardData();
  
  return {
    data: stats,
    isLoading: queries.stats.isLoading,
    error: queries.stats.error,
  };
}

export function useDashboardActivity() {
  const { activity, queries } = useDashboardData();
  
  return {
    data: activity,
    isLoading: queries.activity.isLoading,
    error: queries.activity.error,
  };
}

export function useDashboardLowStock() {
  const { lowStock, queries } = useDashboardData();
  
  return {
    data: lowStock,
    isLoading: queries.lowStock.isLoading,
    error: queries.lowStock.error,
  };
}