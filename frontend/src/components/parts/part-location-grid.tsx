import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog, type DialogContentProps } from '@/components/ui/dialog';
import { usePartLocations, useAddStock, useRemoveStock } from '@/hooks/use-parts';
import { useLocationSuggestions } from '@/hooks/use-types';
import { useGetBoxes } from '@/lib/api/generated/hooks';
import { useToast } from '@/hooks/use-toast';
import { BoxSelector } from './box-selector';
import { AdjustStockDialog } from './adjust-stock-dialog';
import { Pencil, Trash2 } from 'lucide-react';

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
  const { data: boxes = [] } = useGetBoxes();
  const [editingLocation, setEditingLocation] = useState<string | null>(null);
  const [showAddRow, setShowAddRow] = useState(false);

  // Create a mapping of box_no to description for quick lookup
  const boxMapping = useMemo(() => {
    const mapping = new Map<number, string>();
    if (boxes) {
      boxes.forEach((box) => {
        mapping.set(box.box_no, box.description);
      });
    }
    return mapping;
  }, [boxes]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center mb-4">
          <Skeleton width="w-32" height="h-5" />
          <Skeleton width="w-20" height="h-4" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-2 border rounded">
              <Skeleton width="w-16" height="h-4" />
              <Skeleton width="w-12" height="h-4" />
              <Skeleton width="w-20" height="h-8" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (locations.length === 0 && totalQuantity === 0) {
    return (
      <div className="space-y-4" data-testid="parts.locations.empty">
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
    <div className="space-y-2" data-testid="parts.locations">
      <div className="flex justify-between items-center mb-4" data-testid="parts.locations.total">
        <div className="text-sm text-muted-foreground">
          Total: {totalQuantity}
        </div>
      </div>

      <div className="space-y-1">
        {locations.sort((a, b) => a.box_no - b.box_no || a.loc_no - b.loc_no).map((location: PartLocation) => (
          <LocationRow
            key={`${location.box_no}-${location.loc_no}`}
            location={location}
            boxDescription={boxMapping.get(location.box_no) || ''}
            partId={partId}
            allLocations={locations}
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
          data-testid="parts.locations.add-location"
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
  boxDescription: string;
  partId: string;
  allLocations: PartLocation[];
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onQuantityChange: () => void;
  onRemove: () => void;
}

function LocationRow({
  location,
  boxDescription,
  partId,
  allLocations,
  isEditing,
  onStartEdit,
  onStopEdit,
  onQuantityChange,
  onRemove
}: LocationRowProps) {
  const { showSuccess } = useToast();
  const removeStockMutation = useRemoveStock();
  const addStockMutation = useAddStock();

  // Adjust stock dialog state
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);

  // Edit mode state
  const [editBoxNo, setEditBoxNo] = useState<number | undefined>(location.box_no);
  const [editLocNo, setEditLocNo] = useState(location.loc_no.toString());
  const [editQty, setEditQty] = useState(location.qty.toString());

  // Merge confirmation dialog state
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [pendingMergeTarget, setPendingMergeTarget] = useState<PartLocation | null>(null);

  // Reset edit form when editing starts
  const handleStartEdit = () => {
    setEditBoxNo(location.box_no);
    setEditLocNo(location.loc_no.toString());
    setEditQty(location.qty.toString());
    onStartEdit();
  };

  // Handle stock adjustment from dialog
  const handleAdjust = async (delta: number) => {
    if (delta > 0) {
      await addStockMutation.mutateAsync({
        path: { part_key: partId },
        body: {
          box_no: location.box_no,
          loc_no: location.loc_no,
          qty: delta
        }
      });
    } else if (delta < 0) {
      const newQty = location.qty + delta;
      if (newQty <= 0) {
        // Remove the entire location
        await removeStockMutation.mutateAsync({
          path: { part_key: partId },
          body: {
            box_no: location.box_no,
            loc_no: location.loc_no,
            qty: location.qty
          }
        });
      } else {
        await removeStockMutation.mutateAsync({
          path: { part_key: partId },
          body: {
            box_no: location.box_no,
            loc_no: location.loc_no,
            qty: Math.abs(delta)
          }
        });
      }
    }
    onQuantityChange();
  };

  // Handle save from inline edit mode
  const handleSave = async () => {
    const newBoxNo = editBoxNo;
    const newLocNo = parseInt(editLocNo, 10);
    const newQty = parseInt(editQty, 10);

    if (!newBoxNo || isNaN(newLocNo) || isNaN(newQty) || newQty < 0) return;

    // Check if quantity is zero - treat as remove
    if (newQty === 0) {
      await handleRemove();
      return;
    }

    // Check if location changed
    const locationChanged = newBoxNo !== location.box_no || newLocNo !== location.loc_no;

    if (locationChanged) {
      // Check if target location already exists
      const existingLocation = allLocations.find(
        loc => loc.box_no === newBoxNo && loc.loc_no === newLocNo
      );

      if (existingLocation) {
        // Show merge confirmation dialog
        setPendingMergeTarget(existingLocation);
        setMergeDialogOpen(true);
        return;
      }

      // Move stock to new location: remove from old, add to new
      await removeStockMutation.mutateAsync({
        path: { part_key: partId },
        body: {
          box_no: location.box_no,
          loc_no: location.loc_no,
          qty: location.qty
        }
      });

      await addStockMutation.mutateAsync({
        path: { part_key: partId },
        body: {
          box_no: newBoxNo,
          loc_no: newLocNo,
          qty: newQty
        }
      });
    } else {
      // Only quantity changed at same location
      const diff = newQty - location.qty;

      if (diff === 0) {
        onStopEdit();
        return;
      }

      if (diff > 0) {
        await addStockMutation.mutateAsync({
          path: { part_key: partId },
          body: {
            box_no: location.box_no,
            loc_no: location.loc_no,
            qty: diff
          }
        });
      } else {
        await removeStockMutation.mutateAsync({
          path: { part_key: partId },
          body: {
            box_no: location.box_no,
            loc_no: location.loc_no,
            qty: Math.abs(diff)
          }
        });
      }
    }

    onStopEdit();
    onQuantityChange();
  };

  // Handle merge confirmation
  const handleMergeConfirm = async () => {
    if (!pendingMergeTarget || !editBoxNo) return;

    const newQty = parseInt(editQty, 10);
    if (isNaN(newQty) || newQty < 0) return;

    // Remove from original location
    await removeStockMutation.mutateAsync({
      path: { part_key: partId },
      body: {
        box_no: location.box_no,
        loc_no: location.loc_no,
        qty: location.qty
      }
    });

    // Add to target location (this will merge with existing quantity)
    await addStockMutation.mutateAsync({
      path: { part_key: partId },
      body: {
        box_no: editBoxNo,
        loc_no: parseInt(editLocNo, 10),
        qty: newQty
      }
    });

    setMergeDialogOpen(false);
    setPendingMergeTarget(null);
    onStopEdit();
    onQuantityChange();
  };

  // Handle remove with toast+undo
  const handleRemove = async () => {
    const removedLocation = { ...location };

    await removeStockMutation.mutateAsync({
      path: { part_key: partId },
      body: {
        box_no: location.box_no,
        loc_no: location.loc_no,
        qty: location.qty
      }
    });

    onRemove();

    // Show toast with undo action
    showSuccess(`Removed stock from #${removedLocation.box_no} Location ${removedLocation.loc_no}`, {
      action: {
        id: 'undo',
        label: 'Undo',
        testId: `parts.locations.toast.undo.${removedLocation.box_no}-${removedLocation.loc_no}`,
        onClick: async () => {
          // Re-add the stock
          await addStockMutation.mutateAsync({
            path: { part_key: partId },
            body: {
              box_no: removedLocation.box_no,
              loc_no: removedLocation.loc_no,
              qty: removedLocation.qty
            }
          });
          onQuantityChange();
        },
      },
    });
  };

  const handleCancel = () => {
    setEditBoxNo(location.box_no);
    setEditLocNo(location.loc_no.toString());
    setEditQty(location.qty.toString());
    onStopEdit();
  };

  // Handle keyboard events in edit mode
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const isMutating = removeStockMutation.isPending || addStockMutation.isPending;

  if (isEditing) {
    // Inline edit mode - similar to AddLocationRow
    return (
      <>
        <div
          className="flex items-center gap-2 p-2 border rounded bg-muted/30"
          data-testid="parts.locations.row"
          data-box={location.box_no}
          data-location={location.loc_no}
          data-editing="true"
        >
          <BoxSelector
            value={editBoxNo}
            onChange={setEditBoxNo}
            placeholder="Select box..."
            testId="parts.locations.edit-box-selector"
          />
          <Input
            type="number"
            placeholder="Location"
            value={editLocNo}
            onChange={(e) => setEditLocNo(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-20 h-8"
            min="1"
            data-testid="parts.locations.edit-location-input"
          />
          <Input
            type="number"
            placeholder="Quantity"
            value={editQty}
            onChange={(e) => setEditQty(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-20 h-8"
            min="0"
            data-testid="parts.locations.edit-quantity-input"
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isMutating || !editBoxNo || !editLocNo || !editQty}
            loading={isMutating}
            data-testid="parts.locations.edit-save"
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancel}
            disabled={isMutating}
            data-testid="parts.locations.edit-cancel"
          >
            Cancel
          </Button>
        </div>

        {/* Merge confirmation dialog */}
        <ConfirmDialog
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          title="Merge Stock Locations?"
          description={pendingMergeTarget
            ? `Stock already exists at #${pendingMergeTarget.box_no} Location ${pendingMergeTarget.loc_no} (${pendingMergeTarget.qty} units). Merge the quantities together?`
            : ''
          }
          confirmText="Merge"
          cancelText="Cancel"
          onConfirm={handleMergeConfirm}
          contentProps={{ 'data-testid': 'parts.locations.merge-dialog' } as DialogContentProps}
        />
      </>
    );
  }

  // Read-only display mode
  return (
    <>
      <div
        className="flex items-center py-1 gap-4 w-fit"
        data-testid="parts.locations.row"
        data-box={location.box_no}
        data-location={location.loc_no}
      >
        <div className="flex-shrink-0 pb-0.5">
          <span className="text-sm">#{location.box_no}</span>
          <span className="text-sm text-muted-foreground ml-1">{boxDescription}</span>
        </div>

        <div className="w-12 text-center flex-shrink-0 pb-0.5">
          <span className="text-sm">{location.loc_no}</span>
        </div>

        <div className="w-16 text-center flex-shrink-0 pb-0.5">
          <span className="text-sm" data-testid="parts.locations.quantity">
            {location.qty}
          </span>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAdjustDialogOpen(true)}
            disabled={isMutating}
            data-testid="parts.locations.adjust-stock"
          >
            Adjust Stock
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleStartEdit}
            disabled={isMutating}
            className="h-8 w-8 p-0"
            aria-label="Edit location"
            data-testid="parts.locations.edit"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRemove}
            disabled={isMutating}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            aria-label="Remove location"
            data-testid="parts.locations.remove"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Adjust stock dialog */}
      <AdjustStockDialog
        open={adjustDialogOpen}
        onOpenChange={setAdjustDialogOpen}
        currentQuantity={location.qty}
        boxNo={location.box_no}
        locNo={location.loc_no}
        boxDescription={boxDescription}
        onAdjust={handleAdjust}
        isLoading={isMutating}
      />
    </>
  );
}

interface AddLocationRowProps {
  partId: string;
  typeId?: number;
  onAdd: () => void;
  onCancel: () => void;
}

function AddLocationRow({ partId, typeId, onAdd, onCancel }: AddLocationRowProps) {
  const [boxNo, setBoxNo] = useState<number | undefined>(undefined);
  const [locNo, setLocNo] = useState('');
  const [quantity, setQuantity] = useState('');

  const addStockMutation = useAddStock();
  const { data: suggestions } = useLocationSuggestions(typeId);

  const handleAdd = async () => {
    const loc = parseInt(locNo, 10);
    const qty = parseInt(quantity, 10);

    if (!boxNo || isNaN(loc) || isNaN(qty) || qty <= 0) {
      return;
    }

    await addStockMutation.mutateAsync({
      path: { part_key: partId },
      body: {
        box_no: boxNo,
        loc_no: loc,
        qty: qty
      }
    });

    // Clear form fields for consecutive additions
    setBoxNo(undefined);
    setLocNo('');
    setQuantity('');

    onAdd();
  };

  const handleUseSuggestion = () => {
    if (suggestions && Array.isArray(suggestions) && suggestions.length > 0) {
      const suggestion = suggestions[0];
      setBoxNo(suggestion.box_no);
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
    <div className="flex items-center gap-2 p-2 border rounded bg-muted/30" data-testid="parts.locations.add-row">
      <BoxSelector
        value={boxNo}
        onChange={setBoxNo}
        placeholder="Select box..."
        testId="parts.locations.box-selector"
      />
      <Input
        type="number"
        placeholder="Location"
        value={locNo}
        onChange={(e) => setLocNo(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-20 h-8"
        min="1"
        data-testid="parts.locations.location-input"
      />
      <Input
        type="number"
        placeholder="Quantity"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-20 h-8"
        min="1"
        data-testid="parts.locations.quantity-add"
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
        data-testid="parts.locations.add-save"
      >
        Add Location
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onCancel}
        disabled={addStockMutation.isPending}
        data-testid="parts.locations.add-cancel"
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
    <div className="text-center py-8" data-testid="parts.locations.empty-state">
      <div className="text-sm text-muted-foreground mb-4">
        No stock locations assigned
      </div>
      <Button onClick={onAddStock} size="sm">
        Add Stock
      </Button>
    </div>
  );
}
