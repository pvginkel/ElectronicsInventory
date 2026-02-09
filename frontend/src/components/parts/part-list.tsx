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
import { useGetTypes, type PartWithTotalSchemaList_a9993e3_PartWithTotalSchema } from '@/lib/api/generated/hooks';
import { useAllParts } from '@/hooks/use-all-parts';
import { formatPartForDisplay } from '@/lib/utils/parts';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import type {
  PartKitMembershipSummary,
  PartKitUsageSummary,
  PartKitStatus,
} from '@/hooks/use-part-kit-memberships';
import type {
  ShoppingListMembership,
  ShoppingListMembershipSummary,
} from '@/types/shopping-lists';
import { PartListItem } from './part-card';

interface PartListProps {
  searchTerm?: string;
  hasStockFilter?: boolean;
  onShoppingListFilter?: boolean;
  onCreatePart?: () => void;
  onCreateWithAI?: () => void;
}

export function PartList({ searchTerm = '', hasStockFilter, onShoppingListFilter, onCreatePart, onCreateWithAI }: PartListProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: '/parts' });
  const {
    data: parts = [],
    isLoading: partsLoading,
    isFetching: partsFetching,
    error: partsError,
    pagesFetched,
  } = useAllParts();
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
    queryClient.invalidateQueries({ queryKey: ['parts.list'] });
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

  // Build shopping list indicator map from consolidated response
  // Map shopping lists field from parts to match ShoppingListMembership type
  const shoppingIndicatorMap = useMemo(() => {
    const map = new Map<string, ShoppingListMembershipSummary>();

    for (const part of parts) {
      const rawMemberships = part.shopping_lists ?? [];

      // Map snake_case API response to camelCase domain model
      const memberships: ShoppingListMembership[] = rawMemberships.map(raw => ({
        listId: raw.shopping_list_id,
        listName: raw.shopping_list_name,
        listStatus: raw.shopping_list_status,
        lineId: raw.line_id,
        lineStatus: raw.line_status,
        needed: raw.needed,
        ordered: raw.ordered,
        received: raw.received,
        note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null,
        seller: raw.seller ? {
          id: raw.seller.id,
          name: raw.seller.name,
          website: raw.seller.website ?? null,
        } : null,
      }));

      // Filter to active memberships only
      const activeMemberships = memberships.filter(
        m => m.listStatus !== 'done' && m.lineStatus !== 'done'
      );

      const conceptMemberships = activeMemberships.filter(m => m.listStatus === 'concept');
      const readyMemberships = activeMemberships.filter(m => m.listStatus === 'ready');
      const listNames = Array.from(new Set(activeMemberships.map(m => m.listName)));
      const conceptListIds = Array.from(new Set(conceptMemberships.map(m => m.listId)));

      map.set(part.key, {
        partKey: part.key,
        memberships,
        hasActiveMembership: activeMemberships.length > 0,
        listNames,
        conceptListIds,
        activeCount: activeMemberships.length,
        conceptCount: conceptMemberships.length,
        readyCount: readyMemberships.length,
        completedCount: memberships.length - activeMemberships.length,
      });
    }

    return map;
  }, [parts]);

  // Filter parts sequentially: search term (if present), stock filter (if active), shopping list filter (if active).
  // All filters combine with AND logic.
  const filteredParts = useMemo(() => {
    let result = parts;

    // Apply search term filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((part: PartWithTotalSchemaList_a9993e3_PartWithTotalSchema) => {
        const { displayId, displayDescription, displayManufacturerCode, displayManufacturer } = formatPartForDisplay(part);
        const typeName = part.type_id ? typeMap.get(part.type_id) : '';

        const sellerName = part.seller?.name;

        return (
          displayId.toLowerCase().includes(term) ||
          displayDescription.toLowerCase().includes(term) ||
          (displayManufacturerCode && displayManufacturerCode.toLowerCase().includes(term)) ||
          (displayManufacturer && displayManufacturer.toLowerCase().includes(term)) ||
          (sellerName && sellerName.toLowerCase().includes(term)) ||
          (typeName && typeName.toLowerCase().includes(term)) ||
          (part.tags && part.tags.some(tag => tag.toLowerCase().includes(term)))
        );
      });
    }

    // Apply stock filter
    if (hasStockFilter) {
      result = result.filter((part: PartWithTotalSchemaList_a9993e3_PartWithTotalSchema) => {
        return part.total_quantity > 0;
      });
    }

    // Apply shopping list filter
    if (onShoppingListFilter) {
      result = result.filter((part: PartWithTotalSchemaList_a9993e3_PartWithTotalSchema) => {
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

  // Build kit indicator map for ALL parts from consolidated response
  // Consistent with shopping list indicators; simpler approach; enables future filtering
  const kitIndicatorMap = useMemo(() => {
    const map = new Map<string, PartKitMembershipSummary>();

    for (const part of parts) {
      const rawKits = part.kits ?? [];

      // Map snake_case API response to camelCase domain model
      const kits: PartKitUsageSummary[] = rawKits.map(raw => ({
        kitId: raw.kit_id,
        kitName: raw.kit_name?.trim() ?? '',
        status: raw.status as PartKitStatus,
        buildTarget: raw.build_target ?? 0,
        requiredPerUnit: raw.required_per_unit ?? 0,
        reservedQuantity: raw.reserved_quantity ?? 0,
        updatedAt: raw.updated_at,
      }));

      // Sort kits: active status first, then alphabetically by name
      const sortedKits = [...kits].sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === 'active' ? -1 : 1;
        }
        return a.kitName.localeCompare(b.kitName, undefined, { numeric: true, sensitivity: 'base' });
      });

      const activeCount = sortedKits.filter(kit => kit.status === 'active').length;
      const archivedCount = sortedKits.length - activeCount;
      const kitNames = sortedKits.map(kit => kit.kitName);

      map.set(part.key, {
        partKey: part.key,
        kits: sortedKits,
        hasMembership: sortedKits.length > 0,
        activeCount,
        archivedCount,
        kitNames,
      });
    }

    return map;
  }, [parts]);

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
        <Button onClick={onCreateWithAI} variant="ai_assisted" data-testid="parts.list.add-with-ai">
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
      {sortedParts.map((part: PartWithTotalSchemaList_a9993e3_PartWithTotalSchema) => (
        <PartListItem
          key={part.key}
          part={part}
          typeMap={typeMap}
          to="/parts/$partId"
          params={{ partId: part.key }}
          search={{ search: searchTerm || undefined, hasStock: hasStockFilter, onShoppingList: onShoppingListFilter }}
          shoppingIndicatorSummary={shoppingIndicatorMap.get(part.key)}
          shoppingIndicatorStatus="success"
          shoppingIndicatorFetchStatus="idle"
          shoppingIndicatorError={null}
          kitIndicatorSummary={kitIndicatorMap.get(part.key)}
          kitIndicatorStatus="success"
          kitIndicatorFetchStatus="idle"
          kitIndicatorError={null}
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
