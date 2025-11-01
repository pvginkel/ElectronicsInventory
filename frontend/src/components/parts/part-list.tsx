import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ListScreenLayout } from '@/components/layout/list-screen-layout';
import { ListScreenCounts } from '@/components/layout/list-screen-counts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { CoverImageDisplay } from '@/components/documents/cover-image-display';
import { DebouncedSearchInput } from '@/components/ui/debounced-search-input';
import { useGetPartsWithLocations, useGetTypes, type PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema } from '@/lib/api/generated/hooks';
import { formatPartForDisplay } from '@/lib/utils/parts';
import { QuantityBadge } from './quantity-badge';
import { InformationBadge } from '@/components/ui';
import { LocationSummary } from './location-summary';
import { VendorInfo } from './vendor-info';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { CircuitBoard, ShoppingCart } from 'lucide-react';
import { useShoppingListMembershipIndicators } from '@/hooks/use-part-shopping-list-memberships';
import { usePartKitMembershipIndicators, type PartKitMembershipSummary } from '@/hooks/use-part-kit-memberships';
import type { ShoppingListMembershipSummary } from '@/types/shopping-lists';
import { Badge } from '@/components/ui/badge';
import { MembershipIndicator } from '@/components/ui/membership-indicator';

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
        <div key={index} className="animate-pulse" data-testid="parts.list.loading.skeleton">
          <div className="h-48 rounded-lg bg-muted" />
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

interface PartListItemProps {
  part: PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema;
  typeMap: Map<number, string>;
  onClick?: () => void;
  shoppingIndicatorSummary?: ShoppingListMembershipSummary;
  shoppingIndicatorStatus: 'pending' | 'error' | 'success';
  shoppingIndicatorFetchStatus: 'idle' | 'fetching' | 'paused';
  shoppingIndicatorError: unknown;
  kitIndicatorSummary?: PartKitMembershipSummary;
  kitIndicatorStatus: 'pending' | 'error' | 'success';
  kitIndicatorFetchStatus: 'idle' | 'fetching' | 'paused';
  kitIndicatorError: unknown;
}

function PartListItem({
  part,
  typeMap,
  onClick,
  shoppingIndicatorSummary,
  shoppingIndicatorStatus,
  shoppingIndicatorFetchStatus,
  shoppingIndicatorError,
  kitIndicatorSummary,
  kitIndicatorStatus,
  kitIndicatorFetchStatus,
  kitIndicatorError,
}: PartListItemProps) {
  const { displayId, displayDescription, displayManufacturerCode } = formatPartForDisplay(part);

  return (
    <Card 
      className={`p-4 transition-all duration-200 rounded-lg shadow-sm border ${
        onClick 
          ? 'cursor-pointer hover:shadow-md hover:scale-[1.02] hover:border-primary/50' 
          : ''
      } active:scale-[0.98]`}
      onClick={onClick}
      data-testid="parts.list.card"
      data-part-key={part.key}
    >
      {/* Header Section */}
      <div className="flex items-start gap-3 mb-3">
        {/* Cover Image */}
        <div className="flex-shrink-0">
          <CoverImageDisplay 
            partId={part.key} 
            hasCoverAttachment={part.has_cover_attachment}
            size="medium"
            className="w-16 h-16 rounded-md shadow-sm"
            showPlaceholder={true}
          />
        </div>
        
        {/* Main Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-foreground mb-1 leading-tight">
            {displayDescription}
          </h3>
          {displayManufacturerCode && (
            <p className="text-sm text-muted-foreground mb-2">
              {displayManufacturerCode}
            </p>
          )}
        </div>
        
        {/* Quantity & Indicator */}
        <div className="flex flex-col items-end gap-2">
          <QuantityBadge quantity={part.total_quantity} />
          <MembershipIndicator<ShoppingListMembershipSummary>
            summary={shoppingIndicatorSummary}
            status={shoppingIndicatorStatus}
            fetchStatus={shoppingIndicatorFetchStatus}
            error={shoppingIndicatorError}
            testId="parts.list.card.shopping-list-indicator"
            icon={ShoppingCart}
            ariaLabel={getPartShoppingIndicatorLabel}
            hasMembership={partHasShoppingMembership}
            renderTooltip={renderPartShoppingTooltip}
            errorMessage="Failed to load shopping list data."
          />
          <MembershipIndicator<PartKitMembershipSummary>
            summary={kitIndicatorSummary}
            status={kitIndicatorStatus}
            fetchStatus={kitIndicatorFetchStatus}
            error={kitIndicatorError}
            testId="parts.list.card.kit-indicator"
            icon={CircuitBoard}
            ariaLabel={getPartKitIndicatorLabel}
            hasMembership={partHasKitMembership}
            renderTooltip={renderPartKitTooltip}
            errorMessage="Failed to load kit data."
          />
        </div>
      </div>

      {/* Part ID Section */}
      <div className="mb-3">
        <div className="inline-block bg-muted px-2 py-1 rounded font-mono text-sm">
          {displayId}
        </div>
      </div>

      {/* Metadata Badges Row */}
      <div className="flex flex-wrap gap-2 mb-3">
        {part.type_id && typeMap.get(part.type_id) && (
          <InformationBadge icon="🏷️" testId={`parts.list.card.badge.type-${part.key}`}>
            {typeMap.get(part.type_id)!}
          </InformationBadge>
        )}
        {part.package && (
          <InformationBadge icon="📏" testId={`parts.list.card.badge.package-${part.key}`}>
            {part.package}
          </InformationBadge>
        )}
        {part.pin_pitch && (
          <InformationBadge icon="📏" testId={`parts.list.card.badge.pin-pitch-${part.key}`}>
            {part.pin_pitch}
          </InformationBadge>
        )}
        {(part.voltage_rating || part.input_voltage || part.output_voltage) && (
          <InformationBadge
            icon="⚡"
            testId={`parts.list.card.badge.voltage-${part.key}`}
          >
            {[
              part.voltage_rating,
              part.input_voltage ? `I: ${part.input_voltage}` : null,
              part.output_voltage ? `O: ${part.output_voltage}` : null
            ]
            .filter(Boolean)
            .join(' ∣ ')}
          </InformationBadge>
        )}
        {part.mounting_type && (
          <InformationBadge icon="📐" testId={`parts.list.card.badge.mounting-type-${part.key}`}>
            {part.mounting_type}
          </InformationBadge>
        )}
      </div>

      {/* Vendor and Location Section */}
      <div className="flex flex-wrap gap-2 text-sm">
        <VendorInfo 
          seller={part.seller} 
          sellerLink={part.seller_link} 
        />
        
        <LocationSummary
          locations={part.locations || []}
          testId={`parts.list.card.location-summary-${part.key}`}
        />
      </div>
    </Card>
  );
}

function getPartShoppingIndicatorLabel(summary: ShoppingListMembershipSummary): string {
  const count = summary.activeCount;
  const noun = count === 1 ? 'list' : 'lists';
  return `Part appears on ${count} shopping ${noun}`;
}

function partHasShoppingMembership(summary: ShoppingListMembershipSummary): boolean {
  return summary.hasActiveMembership;
}

function renderPartShoppingTooltip(summary: ShoppingListMembershipSummary) {
  if (summary.memberships.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No active shopping lists.</p>
    );
  }

  return (
    <>
      <p className="mb-2 text-xs font-medium text-muted-foreground">On shopping lists</p>
      <ul className="space-y-1">
        {summary.memberships.map((membership) => (
          <li key={membership.listId}>
            <Link
              to="/shopping-lists/$listId"
              params={{ listId: String(membership.listId) }}
              search={{ sort: 'description', originSearch: undefined }}
              className="flex items-center justify-between gap-2 truncate text-sm hover:text-primary"
              onClick={(event) => event.stopPropagation()}
            >
              <span className="truncate">{membership.listName}</span>
              <Badge
                variant={membership.listStatus === 'ready' ? 'default' : 'secondary'}
                className="shrink-0 capitalize"
              >
                {membership.listStatus}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function getPartKitIndicatorLabel(summary: PartKitMembershipSummary): string {
  const active = summary.activeCount;
  const archived = summary.archivedCount;
  if (active > 0 && archived > 0) {
    return `Part used in ${active} active kits and ${archived} archived kits`;
  }
  if (active > 0) {
    const noun = active === 1 ? 'kit' : 'kits';
    return `Part used in ${active} active ${noun}`;
  }
  if (archived > 0) {
    const noun = archived === 1 ? 'kit' : 'kits';
    return `Part used in ${archived} archived ${noun}`;
  }
  return 'Part not used in any kits';
}

function partHasKitMembership(summary: PartKitMembershipSummary): boolean {
  return summary.hasMembership;
}

function renderPartKitTooltip(summary: PartKitMembershipSummary) {
  if (summary.kits.length === 0) {
    return <p className="text-sm text-muted-foreground">Not used in any kits.</p>;
  }

  return (
    <>
      <p className="mb-2 text-xs font-medium text-muted-foreground">Used in kits</p>
      <ul className="space-y-2">
        {summary.kits.map((kit) => (
          <li key={kit.kitId} className="space-y-1">
            <Link
              to="/kits/$kitId"
              params={{ kitId: String(kit.kitId) }}
              search={{ status: kit.status }}
              className="flex items-center justify-between gap-2 truncate text-sm hover:text-primary"
              onClick={(event) => event.stopPropagation()}
            >
              <span className="truncate">{kit.kitName}</span>
              <Badge
                variant={kit.status === 'active' ? 'default' : 'secondary'}
                className="shrink-0 capitalize"
              >
                {kit.status}
              </Badge>
            </Link>
            <p className="text-xs text-muted-foreground">
              {kit.requiredPerUnit} per kit • reserved {kit.reservedQuantity}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
