import { useMemo } from 'react';
import {
  useGetDashboardStats,
  useGetDashboardRecentActivity,
  useGetDashboardLowStock,
  useGetDashboardStorageSummary,
  useGetDashboardCategoryDistribution,
  useGetDashboardPartsWithoutDocuments,
} from '@/lib/api/generated/hooks';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { useUiStateInstrumentation } from '@/lib/test/ui-state';

const CACHE_TIMES = {
  stats: 30,
  activity: 0,
  storage: 60,
  lowStock: 45,
  categories: 300,
  documentation: 120,
};

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

interface DashboardWidgetInstrumentationOptions {
  isLoading: boolean;
  isFetching?: boolean;
  error?: unknown;
  getReadyMetadata?: () => Record<string, unknown> | undefined;
  getErrorMetadata?: (error: unknown) => Record<string, unknown> | undefined;
}

function useDashboardWidgetInstrumentation(
  scope: string,
  options: DashboardWidgetInstrumentationOptions,
): void {
  const { isLoading, isFetching = false, error, getReadyMetadata, getErrorMetadata } = options;

  const buildErrorMetadata = (err: unknown) => {
    if (!err) {
      return getErrorMetadata?.(err);
    }

    const metadata = getErrorMetadata?.(err);
    if (metadata) {
      return metadata;
    }

    return { message: formatError(err) };
  };

  useListLoadingInstrumentation({
    scope,
    isLoading,
    isFetching,
    error,
    getReadyMetadata,
    getErrorMetadata: (err) => buildErrorMetadata(err),
  });

  useUiStateInstrumentation(scope, {
    isLoading,
    error,
    getReadyMetadata,
    getErrorMetadata: (err) => buildErrorMetadata(err),
  });
}

export function useDashboardMetrics() {
  const statsQuery = useGetDashboardStats(
    {},
    {
      staleTime: CACHE_TIMES.stats * 1000,
      refetchInterval: CACHE_TIMES.stats * 1000,
    },
  );

  const lowStockQuery = useGetDashboardLowStock(
    {},
    {
      staleTime: CACHE_TIMES.lowStock * 1000,
    },
  );

  const error = statsQuery.error ?? lowStockQuery.error;
  const isLoading = statsQuery.isLoading || lowStockQuery.isLoading;
  const isFetching = statsQuery.isFetching || lowStockQuery.isFetching;

  const totals = {
    parts: statsQuery.data?.total_parts ?? 0,
    boxes: statsQuery.data?.total_boxes ?? 0,
  };
  const lowStockCount = lowStockQuery.data?.length ?? statsQuery.data?.low_stock_count ?? 0;

  useDashboardWidgetInstrumentation('dashboard.metrics', {
    isLoading,
    isFetching,
    error,
    getReadyMetadata: () => ({
      totals,
      lowStockCount,
      queries: {
        stats: statsQuery.status,
        lowStock: lowStockQuery.status,
      },
    }),
    getErrorMetadata: () => ({
      queries: {
        stats: statsQuery.error ? formatError(statsQuery.error) : statsQuery.status,
        lowStock: lowStockQuery.error ? formatError(lowStockQuery.error) : lowStockQuery.status,
      },
    }),
  });

  return {
    stats: statsQuery.data,
    lowStock: lowStockQuery.data,
    isLoading,
    isFetching,
    error,
  };
}

export function useDashboardHealth() {
  const statsQuery = useGetDashboardStats(
    {},
    {
      staleTime: CACHE_TIMES.stats * 1000,
      refetchInterval: CACHE_TIMES.stats * 1000,
    },
  );

  const documentationQuery = useGetDashboardPartsWithoutDocuments(
    {},
    {
      staleTime: CACHE_TIMES.documentation * 1000,
    },
  );

  const storageQuery = useGetDashboardStorageSummary(
    {},
    {
      staleTime: CACHE_TIMES.storage * 1000,
    },
  );

  const lowStockQuery = useGetDashboardLowStock(
    {},
    {
      staleTime: CACHE_TIMES.lowStock * 1000,
    },
  );

  const activityQuery = useGetDashboardRecentActivity(
    {},
    {
      staleTime: CACHE_TIMES.activity * 1000,
      refetchInterval: 5000,
    },
  );

  const error =
    statsQuery.error ||
    documentationQuery.error ||
    storageQuery.error ||
    lowStockQuery.error ||
    activityQuery.error;

  const isLoading =
    statsQuery.isLoading ||
    documentationQuery.isLoading ||
    storageQuery.isLoading ||
    lowStockQuery.isLoading ||
    activityQuery.isLoading;

  const isFetching =
    statsQuery.isFetching ||
    documentationQuery.isFetching ||
    storageQuery.isFetching ||
    lowStockQuery.isFetching ||
    activityQuery.isFetching;

  const healthScore = useMemo(() => {
    if (!statsQuery.data || !documentationQuery.data || !storageQuery.data) {
      return 0;
    }

    const totalParts = statsQuery.data.total_parts || 1;
    const undocumentedCount = documentationQuery.data.count || 0;
    const documentedParts = totalParts - undocumentedCount;
    const documentationScore = (documentedParts / totalParts) * 100;

    const lowStockCount = lowStockQuery.data?.length || statsQuery.data.low_stock_count || 0;
    const stockScore = Math.max(0, 100 - (lowStockCount / totalParts) * 100);

    const totalBoxes = storageQuery.data.length || 1;
    const usedBoxes = storageQuery.data.filter((box) => (box.occupied_locations || 0) > 0).length;
    const avgUtilization =
      storageQuery.data.reduce((sum, box) => {
        const occupied = box.occupied_locations ?? 0;
        const total = box.total_locations ?? 1;
        return sum + occupied / total;
      }, 0) / totalBoxes;
    const organizationScore = (usedBoxes / totalBoxes) * 50 + avgUtilization * 50;

    const recentActivityCount = activityQuery.data?.length || 0;
    const activityScore = Math.min(100, recentActivityCount * 10);

    const finalScore =
      documentationScore * 0.4 +
      stockScore * 0.25 +
      organizationScore * 0.2 +
      activityScore * 0.15;

    return Math.round(finalScore);
  }, [
    statsQuery.data,
    documentationQuery.data,
    storageQuery.data,
    lowStockQuery.data,
    activityQuery.data,
  ]);

  useDashboardWidgetInstrumentation('dashboard.health', {
    isLoading,
    isFetching,
    error,
    getReadyMetadata: () => ({
      healthScore,
      totals: {
        parts: statsQuery.data?.total_parts ?? 0,
        boxes: storageQuery.data?.length ?? 0,
      },
      undocumentedCount: documentationQuery.data?.count ?? 0,
      lowStockCount: lowStockQuery.data?.length ?? 0,
      activityCount: activityQuery.data?.length ?? 0,
    }),
    getErrorMetadata: () => ({
      queries: {
        stats: statsQuery.error ? formatError(statsQuery.error) : statsQuery.status,
        documentation: documentationQuery.error
          ? formatError(documentationQuery.error)
          : documentationQuery.status,
        storage: storageQuery.error ? formatError(storageQuery.error) : storageQuery.status,
        lowStock: lowStockQuery.error ? formatError(lowStockQuery.error) : lowStockQuery.status,
        activity: activityQuery.error ? formatError(activityQuery.error) : activityQuery.status,
      },
    }),
  });

  return {
    healthScore,
    stats: statsQuery.data,
    documentation: documentationQuery.data,
    storage: storageQuery.data,
    lowStock: lowStockQuery.data,
    activity: activityQuery.data,
    isLoading,
    isFetching,
    error,
  };
}

export function useDashboardStorage() {
  const storageQuery = useGetDashboardStorageSummary(
    {},
    {
      staleTime: CACHE_TIMES.storage * 1000,
    },
  );

  const error = storageQuery.error;
  const isLoading = storageQuery.isLoading;
  const isFetching = storageQuery.isFetching;

  const totalBoxes = storageQuery.data?.length ?? 0;
  const activeBoxes = storageQuery.data?.filter((box) => (box.occupied_locations ?? 0) > 0).length ?? 0;
  const totalLocations = storageQuery.data?.reduce((sum, box) => sum + (box.total_locations ?? 0), 0) ?? 0;
  const occupiedLocations = storageQuery.data?.reduce((sum, box) => sum + (box.occupied_locations ?? 0), 0) ?? 0;

  useDashboardWidgetInstrumentation('dashboard.storage', {
    isLoading,
    isFetching,
    error,
    getReadyMetadata: () => ({
      totalBoxes,
      activeBoxes,
      totalLocations,
      occupiedLocations,
    }),
  });

  return {
    data: storageQuery.data,
    isLoading,
    isFetching,
    error,
  };
}

export function useDashboardActivity() {
  const activityQuery = useGetDashboardRecentActivity(
    {},
    {
      staleTime: CACHE_TIMES.activity * 1000,
      refetchInterval: 5000,
    },
  );

  const error = activityQuery.error;
  const isLoading = activityQuery.isLoading;
  const isFetching = activityQuery.isFetching;

  useDashboardWidgetInstrumentation('dashboard.activity', {
    isLoading,
    isFetching,
    error,
    getReadyMetadata: () => ({
      activityCount: activityQuery.data?.length ?? 0,
    }),
  });

  return {
    data: activityQuery.data,
    isLoading,
    isFetching,
    error,
  };
}

export function useDashboardLowStock() {
  const lowStockQuery = useGetDashboardLowStock(
    {},
    {
      staleTime: CACHE_TIMES.lowStock * 1000,
    },
  );

  const error = lowStockQuery.error;
  const isLoading = lowStockQuery.isLoading;
  const isFetching = lowStockQuery.isFetching;

  const criticalCount = lowStockQuery.data?.filter((item) => (item.current_quantity ?? 0) <= 2).length ?? 0;

  useDashboardWidgetInstrumentation('dashboard.lowStock', {
    isLoading,
    isFetching,
    error,
    getReadyMetadata: () => ({
      total: lowStockQuery.data?.length ?? 0,
      critical: criticalCount,
    }),
  });

  return {
    data: lowStockQuery.data,
    isLoading,
    isFetching,
    error,
  };
}

export function useDashboardDocumentation() {
  const documentationQuery = useGetDashboardPartsWithoutDocuments(
    {},
    {
      staleTime: CACHE_TIMES.documentation * 1000,
    },
  );

  const statsQuery = useGetDashboardStats(
    {},
    {
      staleTime: CACHE_TIMES.stats * 1000,
      refetchInterval: CACHE_TIMES.stats * 1000,
    },
  );

  const error = documentationQuery.error ?? statsQuery.error;
  const isLoading = documentationQuery.isLoading || statsQuery.isLoading;
  const isFetching = documentationQuery.isFetching || statsQuery.isFetching;

  useDashboardWidgetInstrumentation('dashboard.documentation', {
    isLoading,
    isFetching,
    error,
    getReadyMetadata: () => ({
      undocumentedCount: documentationQuery.data?.count ?? 0,
      sampleCount: documentationQuery.data?.sample_parts?.length ?? 0,
      totalParts: statsQuery.data?.total_parts ?? 0,
    }),
    getErrorMetadata: () => ({
      queries: {
        documentation: documentationQuery.error
          ? formatError(documentationQuery.error)
          : documentationQuery.status,
        stats: statsQuery.error ? formatError(statsQuery.error) : statsQuery.status,
      },
    }),
  });

  return {
    data: documentationQuery.data,
    stats: statsQuery.data,
    isLoading,
    isFetching,
    error,
  };
}

export function useDashboardCategories() {
  const categoriesQuery = useGetDashboardCategoryDistribution(
    {},
    {
      staleTime: CACHE_TIMES.categories * 1000,
    },
  );

  const error = categoriesQuery.error;
  const isLoading = categoriesQuery.isLoading;
  const isFetching = categoriesQuery.isFetching;

  const categoryCount = categoriesQuery.data?.length ?? 0;
  const totalParts = categoriesQuery.data?.reduce((sum, category) => sum + (category.part_count ?? 0), 0) ?? 0;

  useDashboardWidgetInstrumentation('dashboard.categories', {
    isLoading,
    isFetching,
    error,
    getReadyMetadata: () => ({
      categoryCount,
      totalParts,
    }),
  });

  return {
    data: categoriesQuery.data,
    isLoading,
    isFetching,
    error,
  };
}
