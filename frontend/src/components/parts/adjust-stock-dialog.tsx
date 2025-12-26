import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  type DialogContentProps,
} from '@/components/ui/dialog';

interface AdjustStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentQuantity: number;
  boxNo: number;
  locNo: number;
  boxDescription: string;
  onAdjust: (delta: number) => Promise<void>;
  isLoading?: boolean;
}

export function AdjustStockDialog({
  open,
  onOpenChange,
  currentQuantity,
  boxNo,
  locNo,
  boxDescription,
  onAdjust,
  isLoading = false,
}: AdjustStockDialogProps) {
  const [adjustment, setAdjustment] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog closes (via onOpenChange handler)
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      // Reset state when closing
      setAdjustment('');
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  // Parse and validate the adjustment value
  const parsedAdjustment = useMemo(() => {
    if (!adjustment.trim()) return null;
    const value = parseInt(adjustment, 10);
    if (isNaN(value)) return null;
    return value;
  }, [adjustment]);

  const newQuantity = useMemo(() => {
    if (parsedAdjustment === null) return null;
    return currentQuantity + parsedAdjustment;
  }, [currentQuantity, parsedAdjustment]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (parsedAdjustment === null) {
      setError('Please enter a valid number');
      return;
    }

    if (parsedAdjustment === 0) {
      setError('Adjustment cannot be zero');
      return;
    }

    if (newQuantity !== null && newQuantity < 0) {
      setError('Result cannot be negative');
      return;
    }

    setError(null);
    await onAdjust(parsedAdjustment);
    handleOpenChange(false);
  };

  const handleClose = () => {
    if (!isLoading) {
      handleOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      contentProps={{ 'data-testid': 'parts.locations.adjust-stock-dialog' } as DialogContentProps}
    >
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
            <DialogDescription>
              Adjust stock for #{boxNo} {boxDescription} | Location {locNo}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter a positive number to add stock, or a negative number to remove stock.
            </p>

            <div>
              <label htmlFor="adjustment" className="text-sm font-medium block mb-2">
                Adjustment
              </label>
              <Input
                id="adjustment"
                type="text"
                inputMode="numeric"
                placeholder="e.g., +5 or -3"
                value={adjustment}
                onChange={(e) => {
                  setAdjustment(e.target.value);
                  setError(null);
                }}
                error={error ?? undefined}
                autoFocus
                data-testid="parts.locations.adjust-stock-dialog.input"
              />
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Current quantity:</span>
              <span className="font-medium" data-testid="parts.locations.adjust-stock-dialog.current">
                {currentQuantity}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">New quantity:</span>
              <span
                className={`font-medium ${newQuantity !== null && newQuantity < 0 ? 'text-destructive' : newQuantity === 0 ? 'text-warning' : ''}`}
                data-testid="parts.locations.adjust-stock-dialog.preview"
              >
                {newQuantity ?? currentQuantity}
                {newQuantity === 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">(will remove location)</span>
                )}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || parsedAdjustment === null || parsedAdjustment === 0 || (newQuantity !== null && newQuantity < 0)}
              loading={isLoading}
              data-testid="parts.locations.adjust-stock-dialog.submit"
            >
              Apply
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
