import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { CoverImageDisplay } from '@/components/documents/cover-image-display';
import { useGetPartsWithLocations, useGetTypes, type PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema } from '@/lib/api/generated/hooks';
import { formatPartForDisplay } from '@/lib/utils/parts';
import { QuantityBadge } from './quantity-badge';
import { MetadataBadge } from './metadata-badge';
import { LocationSummary } from './location-summary';
import { VendorInfo } from './vendor-info';
import { ClearButtonIcon } from '@/components/icons/clear-button-icon';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { Loader2, ShoppingCart, AlertTriangle } from 'lucide-react';
import { useShoppingListMembershipIndicators } from '@/hooks/use-part-shopping-list-memberships';
import type { ShoppingListMembershipSummary } from '@/types/shopping-lists';
import { Badge } from '@/components/ui/badge';

interface PartListProps {
  searchTerm?: string;
  onSelectPart?: (partId: string) => void;
  onCreatePart?: () => void;
  onCreateWithAI?: () => void;
}

export function PartList({ searchTerm = '', onSelectPart, onCreatePart, onCreateWithAI }: PartListProps) {
  const navigate = useNavigate();
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
    }),
    getErrorMetadata: () => {
      const metadata: Record<string, unknown> = {
        status: 'error',
        queries: {
          parts: partsError ? 'error' : 'success',
          types: typesError ? 'error' : 'success',
        },
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
    }),
  });

  // Create a lookup map for type names
  const typeMap = useMemo(() => {
    const map = new Map();
    types.forEach(type => {
      map.set(type.id, type.name);
    });
    return map;
  }, [types]);

  const handleSearchChange = (value: string) => {
    if (value) {
      navigate({
        to: '/parts',
        search: { search: value },
        replace: true
      });
    } else {
      navigate({
        to: '/parts',
        replace: true
      });
    }
  };

  const handleClearSearch = () => {
    handleSearchChange('');
  };

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

  const partKeys = useMemo(() => filteredParts.map((part: PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema) => part.key), [filteredParts]);
  const membershipIndicators = useShoppingListMembershipIndicators(partKeys);
  const indicatorMap = membershipIndicators.summaryByPartKey;

  if (partsError) {
    return (
      <Card className="p-6" data-testid="parts.list.error">
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2">Failed to load parts</h2>
          <p className="text-muted-foreground">
            There was an error loading the parts list. Please try again.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="parts.list">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Parts</h1>
        {(onCreatePart || onCreateWithAI) && (
          <div className="flex gap-2">
            {onCreateWithAI && (
              <Button onClick={onCreateWithAI} variant="ai_assisted">
                Add with AI
              </Button>
            )}
            {onCreatePart && (
              <Button onClick={onCreatePart}>
                Add Part
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="w-full relative" data-testid="parts.list.search-container">
        <Input
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full pr-8"
          data-testid="parts.list.search"
        />
        {searchTerm && (
          <button
            onClick={handleClearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
            aria-label="Clear search"
          >
            <ClearButtonIcon />
          </button>
        )}
      </div>

      {/* Results Summary */}
      <div className="flex justify-between items-center text-sm text-muted-foreground" data-testid="parts.list.summary">
        <span>
          {showLoading
            ? 'Loading...'
            : `${filteredParts.length}`
              + (filteredParts.length == parts.length ? '' : ` of ${parts.length}`)
              + ' parts'
          }
        </span>
      </div>

      {/* Parts List */}
      <div>
        {showLoading ? (
          <div
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            data-testid="parts.list.loading"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse" data-testid="parts.list.loading.skeleton">
                <div className="h-48 bg-muted rounded-lg"></div>
              </div>
            ))}
          </div>
        ) : filteredParts.length === 0 ? (
          <Card
            className="p-8"
            data-testid={searchTerm ? 'parts.list.no-results' : 'parts.list.empty'}
          >
            <div className="text-center">
              <h3 className="text-lg font-medium mb-2">
                {searchTerm ? 'No parts found' : 'No parts yet'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm 
                  ? 'Try adjusting your search terms or create a new part.'
                  : 'Get started by adding your first part to the inventory.'}
              </p>
              {onCreatePart && !searchTerm && (
                <Button onClick={onCreatePart}>
                  Add First Part
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <div
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            data-testid="parts.list.container"
          >
            {filteredParts.sort((a, b) => a.description.localeCompare(b.description, undefined, { numeric: true, sensitivity: 'base' })).map((part: PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema) => (
              <PartListItem
                key={part.key}
                part={part}
                typeMap={typeMap}
                onClick={() => onSelectPart?.(part.key)}
                indicatorSummary={indicatorMap.get(part.key)}
                indicatorStatus={membershipIndicators.status}
                indicatorFetchStatus={membershipIndicators.fetchStatus}
                indicatorError={membershipIndicators.error}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface PartListItemProps {
  part: PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema;
  typeMap: Map<number, string>;
  onClick?: () => void;
  indicatorSummary?: ShoppingListMembershipSummary;
  indicatorStatus: 'pending' | 'error' | 'success';
  indicatorFetchStatus: 'idle' | 'fetching' | 'paused';
  indicatorError: unknown;
}

function PartListItem({
  part,
  typeMap,
  onClick,
  indicatorSummary,
  indicatorStatus,
  indicatorFetchStatus,
  indicatorError,
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
          <ShoppingListIndicator
            summary={indicatorSummary}
            status={indicatorStatus}
            fetchStatus={indicatorFetchStatus}
            error={indicatorError}
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
          <MetadataBadge icon="🏷️" label={typeMap.get(part.type_id)!} />
        )}
        {part.package && (
          <MetadataBadge icon="📏" label={part.package} />
        )}
        {part.pin_pitch && (
          <MetadataBadge icon="📏" label={part.pin_pitch} />
        )}
        {(part.voltage_rating || part.input_voltage || part.output_voltage) && (
          <MetadataBadge 
            icon="⚡" 
            label={
              [
                part.voltage_rating,
                part.input_voltage ? `I: ${part.input_voltage}` : null,
                part.output_voltage ? `O: ${part.output_voltage}` : null
              ]
              .filter(Boolean)
              .join(' ∣ ')
            }
            className="font-mono"
          />
        )}
        {part.mounting_type && (
          <MetadataBadge icon="📐" label={part.mounting_type} />
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
        />
      </div>
    </Card>
  );
}

interface ShoppingListIndicatorProps {
  summary?: ShoppingListMembershipSummary;
  status: 'pending' | 'error' | 'success';
  fetchStatus: 'idle' | 'fetching' | 'paused';
  error: unknown;
}

function ShoppingListIndicator({ summary, status, fetchStatus, error }: ShoppingListIndicatorProps) {
  const isPending = status === 'pending';
  const isRefetching = fetchStatus === 'fetching';

  if (isPending) {
    return (
      <div className="flex h-8 w-8 items-center justify-center" data-testid="parts.list.card.shopping-list-indicator.loading">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="group relative flex h-8 w-8 items-center justify-center"
        data-testid="parts.list.card.shopping-list-indicator.error"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-52 rounded-md border border-destructive/50 bg-background p-2 text-xs text-destructive shadow-lg group-hover:block">
          Failed to load shopping list data.
        </div>
      </div>
    );
  }

  if (!summary || !summary.hasActiveMembership) {
    if (isRefetching) {
      return (
        <div className="flex h-8 w-8 items-center justify-center" data-testid="parts.list.card.shopping-list-indicator.loading">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return null;
  }

  return (
    <div
      className="group relative flex h-8 w-8 items-center justify-center"
      data-testid="parts.list.card.shopping-list-indicator"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      tabIndex={0}
      role="button"
      aria-label={`Part appears on ${summary.activeCount} shopping ${summary.activeCount === 1 ? 'list' : 'lists'}`}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary transition group-hover:bg-primary/20">
        <ShoppingCart className="h-4 w-4" />
      </div>
      <div
        className="pointer-events-auto absolute right-0 top-full z-50 mt-2 hidden w-64 rounded-md border border-input bg-background p-3 text-sm shadow-lg group-hover:block group-focus-within:block"
        data-testid="parts.list.card.shopping-list-indicator.tooltip"
      >
        <p className="mb-2 text-xs font-medium text-muted-foreground">On shopping lists</p>
        <ul className="space-y-1">
          {summary.memberships.map((membership) => (
            <li key={membership.listId}>
              <Link
                to="/shopping-lists/$listId"
                params={{ listId: String(membership.listId) }}
                search={{ sort: 'description' }}
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
      </div>
    </div>
  );
}
