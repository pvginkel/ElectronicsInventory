import { useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, type DialogContentProps } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useFormState } from '@/hooks/use-form-state';
import { useFormInstrumentation } from '@/hooks/use-form-instrumentation';
import type { ShoppingListConceptLine } from '@/types/shopping-lists';

interface OrderLineDialogProps {
  open: boolean;
  line: ShoppingListConceptLine | null;
  onClose: () => void;
  onSubmit: (quantity: number) => Promise<void>;
  isSubmitting: boolean;
  restoreFocusElement?: HTMLElement | null;
}

interface OrderLineFormValues extends Record<string, unknown> {
  orderedQuantity: string;
}

function buildFormId(line: ShoppingListConceptLine | null): string {
  if (!line) {
    return 'ShoppingListLineOrder:line:none';
  }
  return `ShoppingListLineOrder:line:${line.id}`;
}

export function OrderLineDialog({
  open,
  line,
  onClose,
  onSubmit,
  isSubmitting,
  restoreFocusElement,
}: OrderLineDialogProps) {
  const defaultQuantity = useMemo(() => {
    if (!line) {
      return '0';
    }
    return String(line.needed);
  }, [line]);

  const validationRules = {
    orderedQuantity: (value: unknown) => {
      const raw = String(value ?? '');
      if (!raw.trim().length) {
        return 'Ordered quantity is required';
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        return 'Ordered quantity must be an integer';
      }
      if (parsed < 0) {
        return 'Ordered quantity cannot be negative';
      }
      return undefined;
    },
  };

  const form = useFormState<OrderLineFormValues>({
    initialValues: {
      orderedQuantity: defaultQuantity,
    },
    validationRules,
    onSubmit: async (values) => {
      if (!line) {
        return;
      }
      const parsed = Number(values.orderedQuantity);
      instrumentation.trackSubmit({
        listId: line.shoppingListId,
        lineId: line.id,
        orderedQuantity: parsed,
      });

      try {
        await onSubmit(parsed);
        instrumentation.trackSuccess({
          listId: line.shoppingListId,
          lineId: line.id,
          orderedQuantity: parsed,
        });
        handleClose();
      } catch (error) {
        instrumentation.trackError({
          listId: line.shoppingListId,
          lineId: line.id,
          orderedQuantity: parsed,
        });
        throw error;
      }
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    if (line) {
      form.setValue('orderedQuantity', String(line.needed));
      form.setFieldTouched('orderedQuantity', false);
    } else {
      form.setValue('orderedQuantity', '0');
      form.setFieldTouched('orderedQuantity', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, line]);

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
    formId: buildFormId(line),
    isOpen: open,
    snapshotFields: () => ({
      listId: line?.shoppingListId,
      lineId: line?.id,
      orderedQuantity: Number(form.values.orderedQuantity) || 0,
    }),
  });

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()} contentProps={{ 'data-testid': 'shopping-lists.ready.order-line.dialog' } as DialogContentProps}>
      <DialogContent>
        <Form onSubmit={form.handleSubmit} data-testid="shopping-lists.ready.order-line.form">
          <DialogHeader>
            <DialogTitle>
              {line ? `Order ${line.part.description}` : 'Order line'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <FormField>
              <FormLabel required>Ordered quantity</FormLabel>
              <Input
                type="number"
                min={0}
                step={1}
                value={form.values.orderedQuantity}
                onChange={(event) => form.setValue('orderedQuantity', event.target.value)}
                onBlur={() => form.setFieldTouched('orderedQuantity')}
                error={form.errors.orderedQuantity}
                disabled={isSubmitting}
                data-testid="shopping-lists.ready.order-line.field.orderedQuantity"
              />
            </FormField>
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
              loading={isSubmitting || form.isSubmitting}
              disabled={isSubmitting || !form.isValid}
              data-testid="shopping-lists.ready.order-line.submit"
            >
              Save ordered quantity
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
