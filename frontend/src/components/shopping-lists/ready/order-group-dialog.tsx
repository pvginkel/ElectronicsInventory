import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, type DialogContentProps } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useFormInstrumentation } from '@/hooks/use-form-instrumentation';
import type { ShoppingListSellerGroup } from '@/types/shopping-lists';

interface OrderGroupDialogProps {
  open: boolean;
  listId: number;
  group: ShoppingListSellerGroup | null;
  onClose: () => void;
  onSubmit: (lines: Array<{ lineId: number; orderedQuantity: number }>) => Promise<void>;
  isSubmitting: boolean;
  restoreFocusElement?: HTMLElement | null;
}

type QuantityState = Record<number, string>;
type QuantityErrors = Record<number, string | undefined>;

function buildFormId(group: ShoppingListSellerGroup | null): string {
  if (!group) {
    return 'ShoppingListGroupOrder:group:none';
  }
  return `ShoppingListGroupOrder:group:${group.groupKey}`;
}

export function OrderGroupDialog({
  open,
  listId,
  group,
  onClose,
  onSubmit,
  isSubmitting,
  restoreFocusElement,
}: OrderGroupDialogProps) {
  const editableLines = useMemo(() => {
    if (!group) {
      return [];
    }
    return group.lines.filter(line => line.status !== 'done');
  }, [group]);

  const [quantities, setQuantities] = useState<QuantityState>({});
  const [errors, setErrors] = useState<QuantityErrors>({});

  useEffect(() => {
    if (!open) {
      return;
    }
    const nextQuantities: QuantityState = {};
    for (const line of editableLines) {
      nextQuantities[line.id] = String(line.needed);
    }
    setQuantities(nextQuantities);
    setErrors({});
  }, [open, editableLines]);

  useEffect(() => {
    if (open) {
      return;
    }
    if (restoreFocusElement) {
      requestAnimationFrame(() => {
        restoreFocusElement.focus();
      });
    }
  }, [open, restoreFocusElement]);

  const instrumentation = useFormInstrumentation({
    formId: buildFormId(group),
    isOpen: open,
    snapshotFields: () => ({
      listId,
      groupKey: group?.groupKey,
      lineCount: editableLines.length,
      totalOrdered: editableLines.reduce((total, line) => {
        const raw = quantities[line.id];
        const parsed = Number(raw);
        return total + (Number.isFinite(parsed) ? parsed : 0);
      }, 0),
    }),
  });

  const handleClose = () => {
    onClose();
  };

  const validate = (): QuantityErrors => {
    const nextErrors: QuantityErrors = {};
    for (const line of editableLines) {
      const value = quantities[line.id];
      const raw = String(value ?? '');
      if (!raw.trim().length) {
        nextErrors[line.id] = 'Required';
        continue;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        nextErrors[line.id] = 'Enter an integer';
      } else if (parsed < 0) {
        nextErrors[line.id] = 'Cannot be negative';
      }
    }
    setErrors(nextErrors);
    return nextErrors;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!group || editableLines.length === 0) {
      handleClose();
      return;
    }

    const validationErrors = validate();
    const hasErrors = Object.values(validationErrors).some(Boolean);
    if (hasErrors) {
      const normalizedErrors = Object.entries(validationErrors).reduce<Record<string, string | undefined>>((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});
      instrumentation.trackValidationErrors(normalizedErrors);
      return;
    }

    const payload = editableLines.map(line => ({
      lineId: line.id,
      orderedQuantity: Number(quantities[line.id]),
    }));

    const totalOrdered = payload.reduce((sum, item) => sum + item.orderedQuantity, 0);

    instrumentation.trackSubmit({
      listId,
      groupKey: group.groupKey,
      lineCount: payload.length,
      totalOrdered,
    });

    try {
      await onSubmit(payload);
      instrumentation.trackSuccess({
        listId,
        groupKey: group.groupKey,
        lineCount: payload.length,
        totalOrdered,
      });
      handleClose();
    } catch (error) {
      instrumentation.trackError({
        listId,
        groupKey: group.groupKey,
        lineCount: payload.length,
        totalOrdered,
      });
      throw error;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && handleClose()}
      contentProps={{ 'data-testid': 'shopping-lists.ready.order-group.dialog' } as DialogContentProps}
    >
      <DialogContent>
        <Form onSubmit={handleSubmit} data-testid="shopping-lists.ready.order-group.form">
          <DialogHeader>
            <DialogTitle>
              {group ? `Order ${group.sellerName}` : 'Order seller group'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {editableLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All lines in this group are already received. Nothing to order.
              </p>
            ) : (
              editableLines.map(line => (
                <FormField key={line.id}>
                  <FormLabel required>
                    {line.part.description} <span className="text-muted-foreground">({line.part.key})</span>
                  </FormLabel>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={quantities[line.id] ?? ''}
                    onChange={(event) => {
                      const next = event.target.value;
                      setQuantities(prev => ({ ...prev, [line.id]: next }));
                    }}
                    data-testid={`shopping-lists.ready.order-group.field.${line.id}`}
                    disabled={isSubmitting}
                    aria-invalid={errors[line.id] ? 'true' : undefined}
                  />
                  {errors[line.id] && (
                    <p className="text-sm text-destructive">{errors[line.id]}</p>
                  )}
                </FormField>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              preventValidation
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting || editableLines.length === 0}
              data-testid="shopping-lists.ready.order-group.submit"
            >
              Save ordered quantities
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
