import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ListScreenLayout } from '@/components/layout/list-screen-layout';
import { ListScreenCounts } from '@/components/layout/list-screen-counts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { DebouncedSearchInput } from '@/components/ui/debounced-search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetPartsWithLocations, useGetTypes, type PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema } from '@/lib/api/generated/hooks';
import { formatPartForDisplay } from '@/lib/utils/parts';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { useShoppingListMembershipIndicators } from '@/hooks/use-part-shopping-list-memberships';
import { usePartKitMembershipIndicators } from '@/hooks/use-part-kit-memberships';
import { PartListItem } from './part-card';

interface PartListProps {
  searchTerm?: string;
  onSelectPart?: (partId: string) => void;
  onCreatePart?: () => void;
  onCreateWithAI?: () => void;
}

export function PartList({ searchTerm = '', onSelectPart, onCreatePart, onCreateWithAI }: PartListProps) {
  const queryClient = useQueryClient();
  const {
    data: parts = [],
    isLoading: partsLoading,
    isFetching: partsFetching,
    error: partsError,
  } = useGetPartsWithLocations();
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
    queryClient.invalidateQueries({ queryKey: ['getPartsWithLocations'] });
    queryClient.invalidateQueries({ queryKey: ['getTypes'] });
  }, [queryClient]);

  useEffect(() => {
    if (partsLoading || typesLoading || partsFetching || typesFetching) {
      if (hideLoadingTimeoutRef.current) {
        window.clearTimeout(hideLoadingTimeoutRef.current);
        hideLoadingTimeoutRef.current = null;
      }
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

  const filteredParts = useMemo(() => {
    if (!searchTerm.trim()) return parts;

    const term = searchTerm.toLowerCase();
    return parts.filter((part: PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema) => {
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
  }, [parts, searchTerm, typeMap]);

  const sortedParts = useMemo(
    () => [...filteredParts].sort((a, b) => a.description.localeCompare(b.description, undefined, { numeric: true, sensitivity: 'base' })),
    [filteredParts],
  );

  const totalCount = parts.length;
  const visibleCount = filteredParts.length;
  const filteredCount = filteredParts.length < parts.length ? filteredParts.length : undefined;
  const searchActive = searchTerm.trim().length > 0;

  const partKeys = useMemo(
    () => filteredParts.map((part: PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema) => part.key),
    [filteredParts],
  );
  const shoppingIndicators = useShoppingListMembershipIndicators(partKeys);
  const shoppingIndicatorMap = shoppingIndicators.summaryByPartKey;
  const kitIndicators = usePartKitMembershipIndicators(partKeys);
  const kitIndicatorMap = kitIndicators.summaryByPartKey;

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
    }),
  });

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
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      data-testid="parts.list.loading"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} data-testid="parts.list.loading.skeleton">
          <Skeleton height="h-48" />
        </div>
      ))}
    </div>
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
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      data-testid="parts.list.container"
    >
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
    </div>
  );

  let contentNode: ReactNode;
  if (combinedError) {
    contentNode = errorContent;
  } else if (showLoading) {
    contentNode = loadingContent;
  } else if (visibleCount === 0) {
    contentNode = searchActive ? noResultsContent : emptyContent;
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
        counts={countsNode}
      >
        {contentNode}
      </ListScreenLayout>
    </div>
  );
}
