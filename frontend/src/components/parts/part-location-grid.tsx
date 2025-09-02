import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { usePartLocations, useAddStock, useRemoveStock } from '@/hooks/use-parts';
import { useLocationSuggestions } from '@/hooks/use-types';
import { formatLocation } from '@/lib/utils/locations';

interface PartLocation {
  box_no: number;
  loc_no: number;
  qty: number;
}

interface PartLocationGridProps {
  partId: string;
  typeId?: number;
}

export function PartLocationGrid({ partId, typeId }: PartLocationGridProps) {
  const { data: locations = [], totalQuantity, isLoading, refetch } = usePartLocations(partId);
  const [editingLocation, setEditingLocation] = useState<string | null>(null);
  const [showAddRow, setShowAddRow] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center mb-4">
          <div className="h-5 bg-muted rounded w-32 animate-pulse"></div>
          <div className="h-4 bg-muted rounded w-20 animate-pulse"></div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="flex items-center justify-between p-2 border rounded">
                <div className="h-4 bg-muted rounded w-16"></div>
                <div className="h-4 bg-muted rounded w-12"></div>
                <div className="h-8 bg-muted rounded w-20"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (locations.length === 0 && totalQuantity === 0) {
    return (
      <div className="space-y-4">
        <EmptyLocationsState onAddStock={() => setShowAddRow(true)} />
        {showAddRow && (
          <AddLocationRow
            partId={partId}
            typeId={typeId}
            onAdd={() => {
              // Keep showAddRow true for consecutive additions
              refetch();
            }}
            onCancel={() => setShowAddRow(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-medium">Stock Locations</h4>
        <div className="text-sm text-muted-foreground">
          Total: {totalQuantity}
        </div>
      </div>

      <div className="space-y-1">
        {locations.sort((a, b) => a.box_no - b.box_no || a.loc_no - b.loc_no).map((location: PartLocation) => (
          <LocationRow
            key={`${location.box_no}-${location.loc_no}`}
            location={location}
            partId={partId}
            isEditing={editingLocation === `${location.box_no}-${location.loc_no}`}
            onStartEdit={() => setEditingLocation(`${location.box_no}-${location.loc_no}`)}
            onStopEdit={() => setEditingLocation(null)}
            onQuantityChange={() => refetch()}
            onRemove={() => refetch()}
          />
        ))}
      </div>

      {!showAddRow ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddRow(true)}
          className="mt-2"
        >
          Add Location
        </Button>
      ) : (
        <AddLocationRow
          partId={partId}
          typeId={typeId}
          onAdd={() => {
            // Keep showAddRow true for consecutive additions
            refetch();
          }}
          onCancel={() => setShowAddRow(false)}
        />
      )}
    </div>
  );
}

interface LocationRowProps {
  location: PartLocation;
  partId: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onQuantityChange: () => void;
  onRemove: () => void;
}

function LocationRow({
  location,
  partId,
  isEditing,
  onStartEdit,
  onStopEdit,
  onQuantityChange,
  onRemove
}: LocationRowProps) {
  const [quantity, setQuantity] = useState(location.qty.toString());
  const removeStockMutation = useRemoveStock();
  const addStockMutation = useAddStock();

  const locationString = formatLocation(location.box_no, location.loc_no);

  const handleSave = async () => {
    const newQty = parseInt(quantity, 10);
    if (isNaN(newQty) || newQty < 0) return;

    if (newQty === 0) {
      handleRemove();
      return;
    }

    const currentQty = location.qty;
    const diff = newQty - currentQty;
    
    if (diff === 0) {
      onStopEdit();
      return;
    }

    if (diff > 0) {
      // Add stock
      await addStockMutation.mutateAsync({
        path: { part_key: partId },
        body: {
          box_no: location.box_no,
          loc_no: location.loc_no,
          qty: diff
        }
      });
    } else {
      // Remove stock
      await removeStockMutation.mutateAsync({
        path: { part_key: partId },
        body: {
          box_no: location.box_no,
          loc_no: location.loc_no,
          qty: Math.abs(diff)
        }
      });
    }
    
    onStopEdit();
    onQuantityChange();
  };

  const handleRemove = async () => {
    await removeStockMutation.mutateAsync({
      path: { part_key: partId },
      body: {
        box_no: location.box_no,
        loc_no: location.loc_no,
        qty: location.qty
      }
    });
    onRemove();
  };

  const handleCancel = () => {
    setQuantity(location.qty.toString());
    onStopEdit();
  };

  return (
    <div className="flex items-center gap-2 py-1">
      <div className="font-mono text-sm w-16">
        {locationString}
      </div>
      
      {isEditing ? (
        <>
          <Input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-20 h-8"
            min="0"
            autoFocus
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={removeStockMutation.isPending || addStockMutation.isPending}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancel}
            disabled={removeStockMutation.isPending || addStockMutation.isPending}
          >
            Cancel
          </Button>
        </>
      ) : (
        <>
          <button
            className="text-sm hover:bg-accent hover:text-accent-foreground px-2 py-1 rounded"
            onClick={onStartEdit}
          >
            {location.qty}
          </button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRemove}
            disabled={removeStockMutation.isPending}
            className="text-destructive hover:text-destructive"
          >
            Remove
          </Button>
        </>
      )}
    </div>
  );
}

interface AddLocationRowProps {
  partId: string;
  typeId?: number;
  onAdd: () => void;
  onCancel: () => void;
}

function AddLocationRow({ partId, typeId, onAdd, onCancel }: AddLocationRowProps) {
  const [boxNo, setBoxNo] = useState('');
  const [locNo, setLocNo] = useState('');
  const [quantity, setQuantity] = useState('');
  
  const addStockMutation = useAddStock();
  const { data: suggestions } = useLocationSuggestions(typeId);
  const boxInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the box input when component mounts
  useEffect(() => {
    if (boxInputRef.current) {
      boxInputRef.current.focus();
    }
  }, []);

  const handleAdd = async () => {
    const box = parseInt(boxNo, 10);
    const loc = parseInt(locNo, 10);
    const qty = parseInt(quantity, 10);

    if (isNaN(box) || isNaN(loc) || isNaN(qty) || qty <= 0) {
      return;
    }

    await addStockMutation.mutateAsync({
      path: { part_key: partId },
      body: {
        box_no: box,
        loc_no: loc,
        qty: qty
      }
    });
    
    // Clear form fields for consecutive additions
    setBoxNo('');
    setLocNo('');
    setQuantity('');
    
    // Focus back to box input for next addition
    if (boxInputRef.current) {
      boxInputRef.current.focus();
    }
    
    onAdd();
  };

  const handleUseSuggestion = () => {
    if (suggestions && Array.isArray(suggestions) && suggestions.length > 0) {
      const suggestion = suggestions[0];
      setBoxNo(suggestion.box_no.toString());
      setLocNo(suggestion.loc_no.toString());
    }
  };

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="flex items-center gap-2 p-2 border rounded bg-muted/30">
      <Input
        ref={boxInputRef}
        type="number"
        placeholder="Box"
        value={boxNo}
        onChange={(e) => setBoxNo(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-16 h-8"
        min="1"
        autoFocus
      />
      <span className="text-muted-foreground">-</span>
      <Input
        type="number"
        placeholder="Loc"
        value={locNo}
        onChange={(e) => setLocNo(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-16 h-8"
        min="1"
      />
      <Input
        type="number"
        placeholder="Qty"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-20 h-8"
        min="1"
      />
      
      {suggestions && Array.isArray(suggestions) && suggestions.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleUseSuggestion}
          disabled={addStockMutation.isPending}
        >
          Use Suggested
        </Button>
      )}
      
      <Button
        size="sm"
        onClick={handleAdd}
        disabled={!boxNo || !locNo || !quantity || addStockMutation.isPending}
        loading={addStockMutation.isPending}
      >
        Add
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onCancel}
        disabled={addStockMutation.isPending}
      >
        Cancel
      </Button>
    </div>
  );
}

interface EmptyLocationsStateProps {
  onAddStock: () => void;
}

function EmptyLocationsState({ onAddStock }: EmptyLocationsStateProps) {
  return (
    <div className="text-center py-8">
      <div className="text-sm text-muted-foreground mb-4">
        No stock locations assigned
      </div>
      <Button onClick={onAddStock} size="sm">
        Add Stock
      </Button>
    </div>
  );
}