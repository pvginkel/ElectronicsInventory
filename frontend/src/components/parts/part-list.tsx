import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ListScreenLayout } from '@/components/layout/list-screen-layout';
import { ListScreenCounts } from '@/components/layout/list-screen-counts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CollectionGrid, EmptyState } from '@/components/ui';
import { DebouncedSearchInput } from '@/components/ui/debounced-search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetTypes, type PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema } from '@/lib/api/generated/hooks';
import { useAllPartsWithLocations } from '@/hooks/use-all-parts-with-locations';
import { formatPartForDisplay } from '@/lib/utils/parts';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { useShoppingListMembershipIndicators } from '@/hooks/use-part-shopping-list-memberships';
import { usePartKitMembershipIndicators } from '@/hooks/use-part-kit-memberships';
import { PartListItem } from './part-card';

interface PartListProps {
  searchTerm?: string;
  hasStockFilter?: boolean;
  onShoppingListFilter?: boolean;
  onSelectPart?: (partId: string) => void;
  onCreatePart?: () => void;
  onCreateWithAI?: () => void;
}

export function PartList({ searchTerm = '', hasStockFilter, onShoppingListFilter, onSelectPart, onCreatePart, onCreateWithAI }: PartListProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: '/parts' });
  const {
    data: parts = [],
    isLoading: partsLoading,
    isFetching: partsFetching,
    error: partsError,
    pagesFetched,
  } = useAllPartsWithLocations();
  const {
    data: types = [],
    isLoading: typesLoading,
    isFetching: typesFetching,
    error: typesError,
  } = useGetTypes();

  const [showLoading, setShowLoading] = useState(
    partsLoading || partsFetching || typesLoading || typesFetching
  );
  const hideLoadingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Trigger invalidation for parts pagination hook
    queryClient.invalidateQueries({ queryKey: ['getPartsWithLocations'] });
    queryClient.invalidateQueries({ queryKey: ['getTypes'] });
  }, [queryClient]);

  useEffect(() => {
    if (partsLoading || typesLoading || partsFetching || typesFetching) {
      if (hideLoadingTimeoutRef.current) {
        window.clearTimeout(hideLoadingTimeoutRef.current);
        hideLoadingTimeoutRef.current = null;
      }
// eslint-disable-next-line react-hooks/set-state-in-effect -- Debounced loading visibility state for UX (minimum 200ms display)
      setShowLoading(true);
      return;
    }

    hideLoadingTimeoutRef.current = window.setTimeout(() => {
      setShowLoading(false);
      hideLoadingTimeoutRef.current = null;
    }, 200);

    return () => {
      if (hideLoadingTimeoutRef.current) {
        window.clearTimeout(hideLoadingTimeoutRef.current);
        hideLoadingTimeoutRef.current = null;
      }
    };
  }, [partsFetching, partsLoading, typesFetching, typesLoading]);

  const combinedError = partsError ?? typesError;

  // Create a lookup map for type names
  const typeMap = useMemo(() => {
    const map = new Map();
    types.forEach(type => {
      map.set(type.id, type.name);
    });
    return map;
  }, [types]);

  // Load shopping list indicators for ALL parts (not just filtered)
  const allPartKeys = useMemo(
    () => parts.map((part: PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema) => part.key),
    [parts],
  );
  const shoppingIndicators = useShoppingListMembershipIndicators(allPartKeys);
  const shoppingIndicatorMap = shoppingIndicators.summaryByPartKey;

  // Filter parts sequentially: search term (if present), stock filter (if active), shopping list filter (if active).
  // All filters combine with AND logic.
  const filteredParts = useMemo(() => {
    let result = parts;

    // Apply search term filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((part: PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema) => {
        const { displayId, displayDescription, displayManufacturerCode } = formatPartForDisplay(part);
        const typeName = part.type_id ? typeMap.get(part.type_id) : '';

        return (
          displayId.toLowerCase().includes(term) ||
          displayDescription.toLowerCase().includes(term) ||
          (displayManufacturerCode && displayManufacturerCode.toLowerCase().includes(term)) ||
          (typeName && typeName.toLowerCase().includes(term)) ||
          (part.tags && part.tags.some(tag => tag.toLowerCase().includes(term)))
        );
      });
    }

    // Apply stock filter
    if (hasStockFilter) {
      result = result.filter((part: PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema) => {
        return part.total_quantity > 0;
      });
    }

    // Apply shopping list filter
    if (onShoppingListFilter) {
      result = result.filter((part: PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema) => {
        return shoppingIndicatorMap.get(part.key)?.hasActiveMembership === true;
      });
    }

    return result;
  }, [parts, searchTerm, typeMap, hasStockFilter, onShoppingListFilter, shoppingIndicatorMap]);

  const sortedParts = useMemo(
    () => [...filteredParts].sort((a, b) => a.description.localeCompare(b.description, undefined, { numeric: true, sensitivity: 'base' })),
    [filteredParts],
  );

  const totalCount = parts.length;
  const visibleCount = filteredParts.length;
  const searchActive = searchTerm.trim().length > 0;
  const filtersOrSearchActive = searchActive || hasStockFilter || onShoppingListFilter;
  const filteredCount = filtersOrSearchActive && visibleCount < totalCount ? visibleCount : undefined;

  // Load kit indicators for filtered parts only (for display)
  const filteredPartKeys = useMemo(
    () => filteredParts.map((part: PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema) => part.key),
    [filteredParts],
  );
  const kitIndicators = usePartKitMembershipIndicators(filteredPartKeys);
  const kitIndicatorMap = kitIndicators.summaryByPartKey;

  // Build activeFilters array for instrumentation
  const activeFilters: string[] = [];
  if (hasStockFilter) activeFilters.push('hasStock');
  if (onShoppingListFilter) activeFilters.push('onShoppingList');

  useListLoadingInstrumentation({
    scope: 'parts.list',
    isLoading: partsLoading || typesLoading,
    isFetching: partsFetching || typesFetching,
    error: combinedError,
    getReadyMetadata: () => ({
      status: 'success',
      queries: {
        parts: 'success',
        types: 'success',
      },
      counts: {
        parts: parts.length,
        types: types.length,
      },
      totalCount,
      visibleCount,
      ...(typeof filteredCount === 'number' ? { filteredCount } : {}),
      searchTerm: searchActive ? searchTerm : null,
      activeFilters,
      paginationInfo: {
        pagesFetched,
        limit: 1000,
      },
    }),
    getErrorMetadata: () => {
      const metadata: Record<string, unknown> = {
        status: 'error',
        queries: {
          parts: partsError ? 'error' : 'success',
          types: typesError ? 'error' : 'success',
        },
        counts: {
          parts: parts.length,
          types: types.length,
        },
        totalCount,
        visibleCount,
        ...(typeof filteredCount === 'number' ? { filteredCount } : {}),
        searchTerm: searchActive ? searchTerm : null,
        activeFilters,
      };

      if (partsError) {
        metadata.partsMessage = partsError instanceof Error ? partsError.message : String(partsError);
      }

      if (typesError) {
        metadata.typesMessage = typesError instanceof Error ? typesError.message : String(typesError);
      }

      return metadata;
    },
    getAbortedMetadata: () => ({
      status: 'aborted',
      queries: {
        parts: 'aborted',
        types: 'aborted',
      },
      counts: {
        parts: parts.length,
        types: types.length,
      },
      totalCount,
      visibleCount,
      ...(typeof filteredCount === 'number' ? { filteredCount } : {}),
      searchTerm: searchActive ? searchTerm : null,
      activeFilters,
    }),
  });

  // Filter toggle handlers
  const handleToggleStockFilter = () => {
    navigate({
      to: '/parts',
      search: (prev) => ({ ...prev, hasStock: prev.hasStock ? undefined : true }),
      replace: true,
    });
  };

  const handleToggleShoppingListFilter = () => {
    navigate({
      to: '/parts',
      search: (prev) => ({ ...prev, onShoppingList: prev.onShoppingList ? undefined : true }),
      replace: true,
    });
  };

  const breadcrumbsNode = (
    <span data-testid="parts.overview.breadcrumb">Parts</span>
  );

  const actionsNode = (onCreatePart || onCreateWithAI) ? (
    <div className="flex flex-wrap gap-2">
      {onCreateWithAI && (
        <Button onClick={onCreateWithAI} variant="ai_assisted">
          Add Part with AI
        </Button>
      )}
      {onCreatePart && (
        <Button onClick={onCreatePart} data-testid="parts.list.add">
          Add Part
        </Button>
      )}
    </div>
  ) : undefined;

  const searchNode = (
    <DebouncedSearchInput
      searchTerm={searchTerm}
      routePath="/parts"
      placeholder="Search..."
      testIdPrefix="parts.list"
    />
  );

  const filtersNode = (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="filter"
        size="md"
        onClick={handleToggleStockFilter}
        aria-pressed={hasStockFilter}
        data-testid="parts.list.filter.hasStock"
      >
        In Stock
      </Button>
      <Button
        variant="filter"
        size="md"
        onClick={handleToggleShoppingListFilter}
        aria-pressed={onShoppingListFilter}
        data-testid="parts.list.filter.onShoppingList"
      >
        On Shopping List
      </Button>
    </div>
  );

  const countsNode = (
    <div data-testid="parts.overview.summary">
      <div data-testid="parts.list.summary">
        {showLoading ? (
          <span className="text-sm text-muted-foreground">Loading...</span>
        ) : (
          <ListScreenCounts
            visible={visibleCount}
            total={totalCount}
            noun={{ singular: 'part', plural: 'parts' }}
            filtered={filteredCount}
          />
        )}
      </div>
    </div>
  );

  const loadingContent = (
    <CollectionGrid testId="parts.list.loading">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} data-testid="parts.list.loading.skeleton">
          <Skeleton height="h-48" />
        </div>
      ))}
    </CollectionGrid>
  );

  const errorMessage = combinedError
    ? (combinedError instanceof Error ? combinedError.message : String(combinedError))
    : '';

  const errorContent = (
    <Card className="p-6" data-testid="parts.list.error">
      <div className="text-center">
        <h2 className="mb-2 text-lg font-semibold">Failed to load parts</h2>
        <p className="text-muted-foreground">
          There was an error loading the parts list. Please try again.
        </p>
        {errorMessage && (
          <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
        )}
      </div>
    </Card>
  );

  const emptyContent = (
    <EmptyState
      testId="parts.list.empty"
      title="No parts yet"
      description="Get started by adding your first part to the inventory."
      action={
        onCreatePart
          ? {
              label: 'Create your first part',
              onClick: onCreatePart,
              testId: 'parts.list.empty.cta',
            }
          : undefined
      }
    />
  );

  const noResultsContent = (
    <EmptyState
      testId="parts.list.no-results"
      title="No parts found"
      description="Try adjusting your search terms or create a new part."
    />
  );

  const listContent = (
    <CollectionGrid testId="parts.list.container">
      {sortedParts.map((part: PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema) => (
        <PartListItem
          key={part.key}
          part={part}
          typeMap={typeMap}
          onClick={() => onSelectPart?.(part.key)}
          shoppingIndicatorSummary={shoppingIndicatorMap.get(part.key)}
          shoppingIndicatorStatus={shoppingIndicators.status}
          shoppingIndicatorFetchStatus={shoppingIndicators.fetchStatus}
          shoppingIndicatorError={shoppingIndicators.error}
          kitIndicatorSummary={kitIndicatorMap.get(part.key)}
          kitIndicatorStatus={kitIndicators.status}
          kitIndicatorFetchStatus={kitIndicators.fetchStatus}
          kitIndicatorError={kitIndicators.error}
        />
      ))}
    </CollectionGrid>
  );

  let contentNode: ReactNode;
  if (combinedError) {
    contentNode = errorContent;
  } else if (showLoading) {
    contentNode = loadingContent;
  } else if (visibleCount === 0) {
    contentNode = filtersOrSearchActive ? noResultsContent : emptyContent;
  } else {
    contentNode = listContent;
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="parts.list">
      <ListScreenLayout
        rootTestId="parts.overview"
        headerTestId="parts.overview.header"
        contentTestId="parts.overview.content"
        breadcrumbs={breadcrumbsNode}
        title="Parts"
        actions={actionsNode}
        search={searchNode}
        filters={filtersNode}
        counts={countsNode}
      >
        {contentNode}
      </ListScreenLayout>
    </div>
  );
}
