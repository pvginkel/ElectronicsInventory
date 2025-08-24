import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormField, FormLabel, FormError } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAddStock, useMoveStock, useRemoveStock } from '@/hooks/use-parts';
import { useLocationSuggestions } from '@/hooks/use-types';
import { formatLocation } from '@/lib/utils/locations';

interface AddStockDialogProps {
  partId: string;
  typeId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddStockDialog({ partId, typeId, open, onOpenChange, onSuccess }: AddStockDialogProps) {
  const [formData, setFormData] = useState({
    boxNo: '',
    locNo: '',
    quantity: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const addStockMutation = useAddStock();
  const { data: suggestions } = useLocationSuggestions(typeId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const boxNo = parseInt(formData.boxNo, 10);
    const locNo = parseInt(formData.locNo, 10);
    const qty = parseInt(formData.quantity, 10);

    const newErrors: Record<string, string> = {};
    if (isNaN(boxNo) || boxNo < 1) newErrors.boxNo = 'Valid box number required';
    if (isNaN(locNo) || locNo < 1) newErrors.locNo = 'Valid location number required';
    if (isNaN(qty) || qty < 1) newErrors.quantity = 'Valid quantity required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      await addStockMutation.mutateAsync({
        path: { part_id4: partId },
        body: { box_no: boxNo, loc_no: locNo, qty }
      });
      
      setFormData({ boxNo: '', locNo: '', quantity: '' });
      setErrors({});
      onSuccess();
      onOpenChange(false);
    } catch {
      setErrors({ submit: 'Failed to add stock. Please try again.' });
    }
  };

  const handleUseSuggestion = () => {
    if (suggestions && suggestions.length > 0) {
      const suggestion = suggestions[0];
      setFormData(prev => ({
        ...prev,
        boxNo: suggestion.box_no.toString(),
        locNo: suggestion.loc_no.toString(),
      }));
    }
  };

  const handleCancel = () => {
    setFormData({ boxNo: '', locNo: '', quantity: '' });
    setErrors({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Stock to Part {partId}</DialogTitle>
        </DialogHeader>

        <Form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField>
              <FormLabel htmlFor="boxNo" required>Box Number</FormLabel>
              <Input
                id="boxNo"
                type="number"
                value={formData.boxNo}
                onChange={(e) => setFormData(prev => ({ ...prev, boxNo: e.target.value }))}
                min="1"
                error={errors.boxNo}
              />
              <FormError message={errors.boxNo} />
            </FormField>

            <FormField>
              <FormLabel htmlFor="locNo" required>Location Number</FormLabel>
              <Input
                id="locNo"
                type="number"
                value={formData.locNo}
                onChange={(e) => setFormData(prev => ({ ...prev, locNo: e.target.value }))}
                min="1"
                error={errors.locNo}
              />
              <FormError message={errors.locNo} />
            </FormField>
          </div>

          <FormField>
            <FormLabel htmlFor="quantity" required>Quantity</FormLabel>
            <Input
              id="quantity"
              type="number"
              value={formData.quantity}
              onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
              min="1"
              error={errors.quantity}
            />
            <FormError message={errors.quantity} />
          </FormField>

          {suggestions && suggestions.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Suggested: {formatLocation(suggestions[0].box_no, suggestions[0].loc_no)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUseSuggestion}
              >
                Use Suggestion
              </Button>
            </div>
          )}

          <FormError message={errors.submit} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" loading={addStockMutation.isPending}>
              Add Stock
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface MoveStockDialogProps {
  partId: string;
  fromLocation: { box_no: number; loc_no: number; qty: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function MoveStockDialog({ partId, fromLocation, open, onOpenChange, onSuccess }: MoveStockDialogProps) {
  const [formData, setFormData] = useState({
    toBoxNo: '',
    toLocNo: '',
    quantity: Math.min(fromLocation.qty, 1).toString(),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const moveStockMutation = useMoveStock();
  const maxQuantity = fromLocation.qty;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const toBoxNo = parseInt(formData.toBoxNo, 10);
    const toLocNo = parseInt(formData.toLocNo, 10);
    const qty = parseInt(formData.quantity, 10);

    const newErrors: Record<string, string> = {};
    if (isNaN(toBoxNo) || toBoxNo < 1) newErrors.toBoxNo = 'Valid box number required';
    if (isNaN(toLocNo) || toLocNo < 1) newErrors.toLocNo = 'Valid location number required';
    if (isNaN(qty) || qty < 1 || qty > maxQuantity) {
      newErrors.quantity = `Quantity must be between 1 and ${maxQuantity}`;
    }

    // Check if trying to move to same location
    if (toBoxNo === fromLocation.box_no && toLocNo === fromLocation.loc_no) {
      newErrors.toBoxNo = 'Cannot move to the same location';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      await moveStockMutation.mutateAsync({
        path: { part_id4: partId },
        body: {
          from_box_no: fromLocation.box_no,
          from_loc_no: fromLocation.loc_no,
          to_box_no: toBoxNo,
          to_loc_no: toLocNo,
          qty
        }
      });
      
      setFormData({ toBoxNo: '', toLocNo: '', quantity: '1' });
      setErrors({});
      onSuccess();
      onOpenChange(false);
    } catch {
      setErrors({ submit: 'Failed to move stock. Please try again.' });
    }
  };

  const handleCancel = () => {
    setFormData({ toBoxNo: '', toLocNo: '', quantity: '1' });
    setErrors({});
    onOpenChange(false);
  };

  const fromLocationString = formatLocation(fromLocation.box_no, fromLocation.loc_no);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move Stock</DialogTitle>
        </DialogHeader>

        <div className="mb-4">
          <p className="text-sm text-muted-foreground">
            Moving from: <strong>{fromLocationString}</strong> (Available: {maxQuantity})
          </p>
        </div>

        <Form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField>
              <FormLabel htmlFor="toBoxNo" required>To Box Number</FormLabel>
              <Input
                id="toBoxNo"
                type="number"
                value={formData.toBoxNo}
                onChange={(e) => setFormData(prev => ({ ...prev, toBoxNo: e.target.value }))}
                min="1"
                error={errors.toBoxNo}
              />
              <FormError message={errors.toBoxNo} />
            </FormField>

            <FormField>
              <FormLabel htmlFor="toLocNo" required>To Location Number</FormLabel>
              <Input
                id="toLocNo"
                type="number"
                value={formData.toLocNo}
                onChange={(e) => setFormData(prev => ({ ...prev, toLocNo: e.target.value }))}
                min="1"
                error={errors.toLocNo}
              />
              <FormError message={errors.toLocNo} />
            </FormField>
          </div>

          <FormField>
            <FormLabel htmlFor="moveQuantity" required>Quantity to Move</FormLabel>
            <Input
              id="moveQuantity"
              type="number"
              value={formData.quantity}
              onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
              min="1"
              max={maxQuantity}
              error={errors.quantity}
            />
            <FormError message={errors.quantity} />
          </FormField>

          <FormError message={errors.submit} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" loading={moveStockMutation.isPending}>
              Move Stock
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface RemoveStockDialogProps {
  partId: string;
  location: { box_no: number; loc_no: number; qty: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function RemoveStockDialog({ partId, location, open, onOpenChange, onSuccess }: RemoveStockDialogProps) {
  const [quantity, setQuantity] = useState(location.qty.toString());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const removeStockMutation = useRemoveStock();
  const locationString = formatLocation(location.box_no, location.loc_no);
  const maxQuantity = location.qty;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const qty = parseInt(quantity, 10);

    if (isNaN(qty) || qty < 1 || qty > maxQuantity) {
      setErrors({ quantity: `Quantity must be between 1 and ${maxQuantity}` });
      return;
    }

    try {
      await removeStockMutation.mutateAsync({
        path: { part_id4: partId },
        body: {
          box_no: location.box_no,
          loc_no: location.loc_no,
          qty
        }
      });
      
      setQuantity(location.qty.toString());
      setErrors({});
      onSuccess();
      onOpenChange(false);
    } catch {
      setErrors({ submit: 'Failed to remove stock. Please try again.' });
    }
  };

  const handleCancel = () => {
    setQuantity(location.qty.toString());
    setErrors({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Stock</DialogTitle>
        </DialogHeader>

        <div className="mb-4">
          <p className="text-sm text-muted-foreground">
            Removing from: <strong>{locationString}</strong> (Available: {maxQuantity})
          </p>
        </div>

        <Form onSubmit={handleSubmit} className="space-y-4">
          <FormField>
            <FormLabel htmlFor="removeQuantity" required>Quantity to Remove</FormLabel>
            <Input
              id="removeQuantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="1"
              max={maxQuantity}
              error={errors.quantity}
            />
            <FormError message={errors.quantity} />
          </FormField>

          <FormError message={errors.submit} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              loading={removeStockMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove Stock
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}