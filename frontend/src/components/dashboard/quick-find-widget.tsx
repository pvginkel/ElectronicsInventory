import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { CoverImageDisplay } from '@/components/documents/cover-image-display';
import { useGetPartsWithLocations, useGetTypes, type PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema } from '@/lib/api/generated/hooks';
import { formatPartForDisplay } from '@/lib/utils/parts';
import { QuantityBadge } from '@/components/parts/quantity-badge';

interface QuickFindWidgetProps {
  className?: string;
}

export function QuickFindWidget({ className }: QuickFindWidgetProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data: parts = [], isLoading } = useGetPartsWithLocations();
  const { data: types = [] } = useGetTypes();

  // Create a lookup map for type names
  const typeMap = useMemo(() => {
    const map = new Map();
    types.forEach(type => {
      map.set(type.id, type.name);
    });
    return map;
  }, [types]);

  // Filter parts with debounced search (200ms as per plan)
  const filteredParts = useMemo(() => {
    if (!searchTerm.trim()) return [];

    const term = searchTerm.toLowerCase();
    return parts
      .filter((part: PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema) => {
        const { displayId, displayDescription, displayManufacturerCode } = formatPartForDisplay(part);
        const typeName = part.type_id ? typeMap.get(part.type_id) : '';
        
        return (
          displayId.toLowerCase().includes(term) ||
          displayDescription.toLowerCase().includes(term) ||
          (displayManufacturerCode && displayManufacturerCode.toLowerCase().includes(term)) ||
          (typeName && typeName.toLowerCase().includes(term)) ||
          (part.tags && part.tags.some(tag => tag.toLowerCase().includes(term)))
        );
      })
      .slice(0, 10); // Limit to 10 results for performance
  }, [parts, searchTerm, typeMap]);

  // Auto-focus on page load
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredParts]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults || filteredParts.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredParts.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredParts[selectedIndex]) {
          handleSelectPart(filteredParts[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowResults(false);
        inputRef.current?.blur();
        break;
    }
  };

  const handleSelectPart = (part: PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema) => {
    const { displayId } = formatPartForDisplay(part);
    navigate({ to: '/parts/$partId', params: { partId: displayId } });
    setShowResults(false);
    setSearchTerm('');
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    setShowResults(value.trim().length > 0);
  };

  const handleInputFocus = () => {
    if (searchTerm.trim().length > 0) {
      setShowResults(true);
    }
  };

  const handleInputBlur = () => {
    // Delay hiding results to allow clicks on results
    setTimeout(() => setShowResults(false), 200);
  };

  const getLocationText = (part: PartWithTotalAndLocationsSchemaList_a9993e3_PartWithTotalAndLocationsSchema) => {
    if (!part.locations || part.locations.length === 0) return 'No location';
    if (part.locations.length === 1) {
      const loc = part.locations[0];
      return `${loc.box_no}-${loc.loc_no}`;
    }
    return `${part.locations.length} locations`;
  };

  return (
    <div className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          placeholder="Start typing to search parts..."
          value={searchTerm}
          onChange={handleSearchChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          className={`w-full text-base transition-all duration-200 ${
            showResults && filteredParts.length > 0 
              ? 'border-primary shadow-md' 
              : 'border-border'
          }`}
        />
        {isLoading && searchTerm && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}
      </div>

      {/* Search Results */}
      {showResults && (
        <Card className="absolute top-full left-0 right-0 z-50 mt-1 max-h-96 overflow-y-auto shadow-lg border-primary/20">
          {filteredParts.length > 0 ? (
            <div className="py-2">
              {filteredParts.map((part, index) => {
                const { displayId, displayDescription } = formatPartForDisplay(part);
                const typeName = part.type_id ? typeMap.get(part.type_id) : '';
                
                return (
                  <div
                    key={displayId}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      index === selectedIndex 
                        ? 'bg-primary/10 border-l-2 border-l-primary' 
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => handleSelectPart(part)}
                  >
                    {/* Thumbnail */}
                    <div className="flex-shrink-0 w-12 h-12 bg-muted rounded-md overflow-hidden">
                      <CoverImageDisplay 
                        partId={displayId} 
                        size="small"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Part Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-semibold">{displayId}</span>
                        <QuantityBadge quantity={part.locations?.reduce((sum, loc) => sum + loc.qty, 0) || 0} />
                      </div>
                      <p className="text-sm text-foreground truncate" title={displayDescription}>
                        {displayDescription}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {typeName && <span className="bg-muted px-2 py-0.5 rounded">{typeName}</span>}
                        <span>{getLocationText(part)}</span>
                      </div>
                    </div>

                    {/* Quick Action Hint */}
                    <div className="flex-shrink-0 text-xs text-muted-foreground">
                      ↵
                    </div>
                  </div>
                );
              })}
            </div>
          ) : searchTerm.trim().length > 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <div className="mb-2">🔍</div>
              <p>No parts found.</p>
              <p className="text-xs mt-1">Try different keywords.</p>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}