import { useMemo } from 'react';
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

interface PartListProps {
  searchTerm?: string;
  onSelectPart?: (partId: string) => void;
  onCreatePart?: () => void;
  onCreateWithAI?: () => void;
}

export function PartList({ searchTerm = '', onSelectPart, onCreatePart, onCreateWithAI }: PartListProps) {
  const navigate = useNavigate();
  const { data: parts = [], isLoading, error } = useGetPartsWithLocations();
  const { data: types = [] } = useGetTypes();

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

  if (error) {
    return (
      <Card className="p-6">
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
    <div className="space-y-6">
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
      <div className="w-full">
        <Input
          placeholder="Search parts by ID, description, manufacturer, type, or tags..."
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full"
        />
      </div>

      {/* Results Summary */}
      <div className="flex justify-between items-center text-sm text-muted-foreground">
        <span>
          {isLoading 
            ? 'Loading...' 
            : `${filteredParts.length} of ${parts.length} parts`}
        </span>
      </div>

      {/* Parts List */}
      <div>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-48 bg-muted rounded-lg"></div>
              </div>
            ))}
          </div>
        ) : filteredParts.length === 0 ? (
          <Card className="p-8">
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
    >
      {/* Header Section */}
      <div className="flex items-start gap-3 mb-3">
        {/* Cover Image */}
        <div className="flex-shrink-0">
          <CoverImageDisplay 
            partId={part.key} 
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