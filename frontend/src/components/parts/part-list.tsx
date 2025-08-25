import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useGetParts, type PartListSchemaList_a9993e3_PartListSchema } from '@/lib/api/generated/hooks';
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
    return parts.filter((part: PartListSchemaList_a9993e3_PartListSchema) => {
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
        <h1 className="text-2xl font-bold">Parts</h1>
        {onCreatePart && (
          <Button onClick={onCreatePart}>
            Add New Part
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="flex gap-4">
        <Input
          placeholder="Search parts by ID, description, manufacturer, type, or tags..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
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
              {onCreatePart && (
                <Button onClick={onCreatePart}>
                  Add First Part
                </Button>
              )}
            </div>
          </Card>
        ) : (
          filteredParts.map((part: PartListSchemaList_a9993e3_PartListSchema) => (
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
    quantity?: number;
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
            <span className="font-mono font-semibold text-lg">{displayId}</span>
            <span className="text-muted-foreground">
              Total Qty: {part.quantity || 0}
            </span>
          </div>
          
          <p className="text-sm mb-2">{displayDescription}</p>
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {displayManufacturerCode && (
              <span>
                <strong>Manufacturer:</strong> {displayManufacturerCode}
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
              {part.tags.slice(0, 3).map((tag: string, index: number) => (
                <span
                  key={index}
                  className="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded-md"
                >
                  {tag}
                </span>
              ))}
              {part.tags.length > 3 && (
                <span className="px-2 py-1 text-xs text-muted-foreground">
                  +{part.tags.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>

      </div>
    </Card>
  );
}