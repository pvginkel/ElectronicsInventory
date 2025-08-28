import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useGetParts, type PartWithTotalSchemaList_a9993e3_PartWithTotalSchema } from '@/lib/api/generated/hooks';
import { formatPartForDisplay } from '@/lib/utils/parts';

interface PartListProps {
  onSelectPart?: (partId: string) => void;
  onCreatePart?: () => void;
}

export function PartList({ onSelectPart, onCreatePart }: PartListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const { data: parts = [], isLoading, error } = useGetParts();

  const filteredParts = useMemo(() => {
    if (!searchTerm.trim()) return parts;

    const term = searchTerm.toLowerCase();
    return parts.filter((part: PartWithTotalSchemaList_a9993e3_PartWithTotalSchema) => {
      const { displayId, displayDescription, displayManufacturerCode } = formatPartForDisplay(part);
      
      return (
        displayId.toLowerCase().includes(term) ||
        displayDescription.toLowerCase().includes(term) ||
        (displayManufacturerCode && displayManufacturerCode.toLowerCase().includes(term))
      );
    });
  }, [parts, searchTerm]);

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
        {onCreatePart && (
          <Button onClick={onCreatePart}>
            Add Part
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="w-full">
        <Input
          placeholder="Search parts by ID, description, manufacturer, type, or tags..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
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
      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-20 bg-muted rounded-md"></div>
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
          filteredParts.map((part: PartWithTotalSchemaList_a9993e3_PartWithTotalSchema) => (
            <PartListItem
              key={part.id4}
              part={part}
              onClick={() => onSelectPart?.(part.id4)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface PartListItemProps {
  part: {
    id4: string;
    description: string;
    manufacturer_code?: string | null;
    type?: { name: string } | null;
    tags?: string[] | null;
    total_quantity?: number;
    quantity?: number; // For backwards compatibility
  };
  onClick?: () => void;
}

function PartListItem({ part, onClick }: PartListItemProps) {
  const { displayId, displayDescription, displayManufacturerCode } = formatPartForDisplay(part);

  return (
    <Card 
      className={`p-4 transition-colors ${
        onClick 
          ? 'cursor-pointer hover:bg-accent hover:text-accent-foreground' 
          : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-2">
            <span className="font-semibold text-lg">{displayDescription}</span>
            <span className="text-muted-foreground">
              Total Quantity: {part.total_quantity ?? part.quantity ?? 0}
            </span>
          </div>
          
          <p className="font-mono text-sm mb-2">{displayId}</p>
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {displayManufacturerCode && (
              <span>
                <strong>Manufacturer Code:</strong> {displayManufacturerCode}
              </span>
            )}
            
            {part.type?.name && (
              <span>
                <strong>Type:</strong> {part.type.name}
              </span>
            )}
          </div>

          {part.tags && part.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {part.tags.map((tag: string, index: number) => (
                <span
                  key={index}
                  className="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded-md"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

      </div>
    </Card>
  );
}