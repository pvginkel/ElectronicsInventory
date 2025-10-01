import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
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
import { beginUiState, endUiState } from '@/lib/test/ui-state';
import { isTestMode } from '@/lib/config/test-mode';

interface PartListProps {
  searchTerm?: string;
  onSelectPart?: (partId: string) => void;
  onCreatePart?: () => void;
  onCreateWithAI?: () => void;
}

export function PartList({ searchTerm = '', onSelectPart, onCreatePart, onCreateWithAI }: PartListProps) {
  const navigate = useNavigate();
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

  const [showLoading, setShowLoading] = useState(partsLoading);
  const instrumentationActiveRef = useRef(false);
  const testMode = isTestMode();

  useEffect(() => {
    if (partsLoading) {
      setShowLoading(true);
      return;
    }

    if (!partsFetching) {
      setShowLoading(false);
    }
  }, [partsFetching, partsLoading]);

  useEffect(() => {
    if (!testMode) {
      instrumentationActiveRef.current = false;
      return;
    }

    const partsInFlight = partsLoading || partsFetching;
    const typesInFlight = typesLoading || typesFetching;
    const anyInFlight = partsInFlight || typesInFlight;

    if (anyInFlight && !instrumentationActiveRef.current) {
      instrumentationActiveRef.current = true;
      beginUiState('parts.list');
    }

    if (!anyInFlight && instrumentationActiveRef.current) {
      instrumentationActiveRef.current = false;

      const metadata: Record<string, unknown> = {
        status: partsError || typesError ? 'error' : 'success',
        queries: {
          parts: partsError ? 'error' : 'success',
          types: typesError ? 'error' : 'success',
        },
        counts: {
          parts: parts.length,
          types: types.length,
        },
      };

      if (partsError) {
        metadata.partsMessage = partsError instanceof Error ? partsError.message : String(partsError);
      }

      if (typesError) {
        metadata.typesMessage = typesError instanceof Error ? typesError.message : String(typesError);
      }

      endUiState('parts.list', metadata);
    }
  }, [parts, partsError, partsFetching, partsLoading, testMode, types, typesError, typesFetching, typesLoading]);

  useEffect(() => {
    if (!testMode) {
      return;
    }

    return () => {
      if (instrumentationActiveRef.current) {
        instrumentationActiveRef.current = false;
        endUiState('parts.list', {
          status: 'aborted',
        });
      }
    };
  }, [testMode]);

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
}

function PartListItem({ part, typeMap, onClick }: PartListItemProps) {
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
        
        {/* Quantity Badge */}
        <div className="flex-shrink-0">
          <QuantityBadge quantity={part.total_quantity} />
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
