import { useEffect } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, type DialogContentProps } from '@/components/ui/dialog';
import { Form, FormField, FormLabel } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFormState } from '@/hooks/use-form-state';
import { useFormInstrumentation } from '@/hooks/use-form-instrumentation';
import { useUpdateSellerOrderNoteMutation } from '@/hooks/use-shopping-lists';
import { useToast } from '@/hooks/use-toast';
import type { ShoppingListSellerGroup } from '@/types/shopping-lists';

interface SellerGroupOrderNoteDialogProps {
  open: boolean;
  listId: number;
  group: ShoppingListSellerGroup | null;
  onClose: () => void;
}

interface OrderNoteFormValues extends Record<string, unknown> {
  note: string;
}

const NOTE_LIMIT = 500;

function buildFormId(group: ShoppingListSellerGroup | null): string {
  if (!group) {
    return 'ShoppingListSellerOrderNote:none';
  }
  const sellerIdentifier = group.sellerId ?? group.groupKey;
  return `ShoppingListSellerOrderNote:${sellerIdentifier}`;
}

export function SellerGroupOrderNoteDialog({
  open,
  listId,
  group,
  onClose,
}: SellerGroupOrderNoteDialogProps) {
  const { showSuccess, showException } = useToast();
  const updateNoteMutation = useUpdateSellerOrderNoteMutation();
  const canEdit = Boolean(group?.sellerId);
  const formId = buildFormId(group);
  const initialNote = group?.orderNote ?? '';

  const form = useFormState<OrderNoteFormValues>({
    initialValues: { note: initialNote },
    validationRules: {
      note: (value: unknown) => {
        const raw = typeof value === 'string' ? value : '';
        if (raw.trim().length > NOTE_LIMIT) {
          return `Order note must be ${NOTE_LIMIT} characters or fewer`;
        }
        return undefined;
      },
    },
    onSubmit: async (values) => {
      if (!group || !canEdit || group.sellerId == null) {
        onClose();
        return;
      }

      const trimmed = values.note.trim();
      const payload = {
        listId,
        sellerId: group.sellerId,
        note: trimmed,
      };

      instrumentation.trackSubmit({
        listId,
        sellerId: group.sellerId,
        noteLength: trimmed.length,
      });

      try {
        await updateNoteMutation.mutateAsync(payload);
        instrumentation.trackSuccess({
          listId,
          sellerId: group.sellerId,
          noteLength: trimmed.length,
        });

        if (trimmed) {
          showSuccess(`Saved order note for ${group.sellerName}`);
        } else {
          showSuccess(`Cleared order note for ${group.sellerName}`);
        }
        onClose();
      } catch (error) {
        instrumentation.trackError({
          listId,
          sellerId: group.sellerId,
          noteLength: trimmed.length,
        });
        const message = error instanceof Error ? error.message : 'Failed to update order note';
        showException(message, error);
      }
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    form.setValue('note', initialNote);
    form.setFieldTouched('note', false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNote, open]);

  const instrumentation = useFormInstrumentation({
    formId,
    isOpen: open,
    snapshotFields: () => ({
      listId,
      sellerId: group?.sellerId,
      noteLength: form.values.note.trim().length,
    }),
  });

  const trimmed = form.values.note.trim();
  const noteChanged = trimmed !== initialNote.trim();
  const disableSave = !noteChanged || !!form.errors.note || updateNoteMutation.isPending || !canEdit;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      contentProps={{ 'data-testid': 'shopping-lists.ready.group.note-dialog' } as DialogContentProps}
    >
      <DialogContent>
        <Form onSubmit={form.handleSubmit} data-testid={`${formId}.form`}>
          <DialogHeader>
            <DialogTitle>Edit group</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <FormField>
              <FormLabel>Order note</FormLabel>
              <textarea
                className={cn(
                  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                  'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50 min-h-[120px]'
                )}
                maxLength={NOTE_LIMIT}
                value={form.values.note}
                onChange={(event) => form.setValue('note', event.target.value)}
                onBlur={() => form.setFieldTouched('note')}
                aria-invalid={form.errors.note ? 'true' : undefined}
                disabled={!canEdit || updateNoteMutation.isPending}
                data-testid={`${formId}.field.note`}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{trimmed.length}/{NOTE_LIMIT} characters</span>
                {form.errors.note && (
                  <span className="text-destructive">{form.errors.note}</span>
                )}
              </div>
            </FormField>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              preventValidation
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={updateNoteMutation.isPending}
              disabled={disableSave}
            >
              Save Notes
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
