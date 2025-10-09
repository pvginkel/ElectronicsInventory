import { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useFormState } from '@/hooks/use-form-state';
import { useFormInstrumentation } from '@/hooks/use-form-instrumentation';
import { useUpdateSellerOrderNoteMutation } from '@/hooks/use-shopping-lists';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ShoppingListConceptLine, ShoppingListSellerGroup } from '@/types/shopping-lists';
import { ReadyLineRow } from './ready-line-row';

interface SellerGroupCardProps {
  listId: number;
  group: ShoppingListSellerGroup;
  onOpenOrderLine: (line: ShoppingListConceptLine, trigger?: HTMLElement | null) => void;
  onOpenOrderGroup: (group: ShoppingListSellerGroup, trigger?: HTMLElement | null) => void;
  onRevertLine: (line: ShoppingListConceptLine) => void;
  onEditLine: (line: ShoppingListConceptLine) => void;
  onUpdateStock: (line: ShoppingListConceptLine) => void;
  pendingLineIds: Set<number>;
  highlightedLineId?: number | null;
}

interface OrderNoteFormValues extends Record<string, unknown> {
  note: string;
}

const NOTE_LIMIT = 500;

export function SellerGroupCard({
  listId,
  group,
  onOpenOrderLine,
  onOpenOrderGroup,
  onRevertLine,
  onEditLine,
  onUpdateStock,
  pendingLineIds,
  highlightedLineId,
}: SellerGroupCardProps) {
  const { showSuccess, showError } = useToast();
  const updateNoteMutation = useUpdateSellerOrderNoteMutation();

  const canEditNote = group.sellerId != null;
  const initialNote = useMemo(() => group.orderNote ?? '', [group.orderNote]);
  const validationRules = {
    note: (value: unknown) => {
      const raw = (value as string) ?? '';
      if (raw.trim().length > NOTE_LIMIT) {
        return `Order note must be ${NOTE_LIMIT} characters or fewer`;
      }
      return undefined;
    },
  };

  const form = useFormState<OrderNoteFormValues>({
    initialValues: { note: initialNote },
    validationRules,
    onSubmit: async (values) => {
      if (!canEditNote || group.sellerId == null) {
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

        if (trimmed.length > 0) {
          showSuccess(`Saved order note for ${group.sellerName}`);
        } else {
          showSuccess(`Cleared order note for ${group.sellerName}`);
        }
      } catch (error) {
        instrumentation.trackError({
          listId,
          sellerId: group.sellerId,
          noteLength: trimmed.length,
        });
        const message = error instanceof Error ? error.message : 'Failed to update order note';
        showError(message);
      }
    },
  });

  useEffect(() => {
    form.setValue('note', initialNote);
    form.setFieldTouched('note', false);
  }, [form, initialNote]);

  const instrumentation = useFormInstrumentation({
    formId: canEditNote ? `ShoppingListSellerOrderNote:${group.sellerId}` : `ShoppingListSellerOrderNote:${group.groupKey}`,
    isOpen: true,
    snapshotFields: () => ({
      listId,
      sellerId: group.sellerId,
      noteLength: form.values.note.trim().length,
    }),
  });

  const trimmedInitial = initialNote.trim();
  const trimmedCurrent = form.values.note.trim();
  const noteChanged = trimmedInitial !== trimmedCurrent;
  const saveDisabled = !noteChanged || !!form.errors.note || updateNoteMutation.isPending;

  const readyLines = group.lines;
  const hasOrderableLines = readyLines.some(line => line.status !== 'done');

  return (
    <div
      className="rounded-lg border border-border bg-card shadow-sm"
      data-testid={`shopping-lists.ready.group.card.${group.groupKey}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground" data-testid={`shopping-lists.ready.group.${group.groupKey}.name`}>
            {group.sellerName}
          </h3>
          {group.sellerWebsite ? (
            <a
              href={group.sellerWebsite}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              {group.sellerWebsite}
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">No website on file</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <div className="flex flex-col text-right">
            <span className="text-xs uppercase tracking-wide">Needed</span>
            <span className="font-semibold text-foreground">{group.totals.needed}</span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-xs uppercase tracking-wide">Ordered</span>
            <span className="font-semibold text-foreground">{group.totals.ordered}</span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-xs uppercase tracking-wide">Received</span>
            <span className="font-semibold text-foreground">{group.totals.received}</span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasOrderableLines}
            onClick={(event) => onOpenOrderGroup(group, event.currentTarget as HTMLElement)}
            data-testid={`shopping-lists.ready.group.${group.groupKey}.order-group`}
          >
            Mark group as Ordered
          </Button>
        </div>
      </div>

      {canEditNote && (
        <form
          onSubmit={form.handleSubmit}
          className="space-y-2 border-b px-4 py-4"
          data-testid={`shopping-lists.ready.group.${group.groupKey}.order-note.form`}
        >
          <label
            htmlFor={`ready-note-${group.groupKey}`}
            className="text-sm font-medium text-foreground"
          >
            Order Note
          </label>
          <textarea
            id={`ready-note-${group.groupKey}`}
            className={cn(
              'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
              'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50 min-h-[96px]'
            )}
            maxLength={NOTE_LIMIT}
            value={form.values.note}
            onChange={(event) => form.setValue('note', event.target.value)}
            onBlur={() => form.setFieldTouched('note')}
            disabled={updateNoteMutation.isPending}
            aria-invalid={form.errors.note ? 'true' : undefined}
            data-testid={`shopping-lists.ready.group.${group.groupKey}.order-note.input`}
          />
          {form.errors.note && (
            <p className="text-sm text-destructive">{form.errors.note}</p>
          )}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{trimmedCurrent.length}/{NOTE_LIMIT} characters</span>
            <div className="flex items-center gap-2">
              {noteChanged && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    form.setValue('note', initialNote);
                    form.setFieldTouched('note', false);
                  }}
                  disabled={updateNoteMutation.isPending}
                  data-testid={`shopping-lists.ready.group.${group.groupKey}.order-note.cancel`}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                size="sm"
                loading={updateNoteMutation.isPending}
                disabled={saveDisabled}
                data-testid={`shopping-lists.ready.group.${group.groupKey}.order-note.save`}
              >
                Save note
              </Button>
            </div>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse" data-testid={`shopping-lists.ready.group.${group.groupKey}.lines`}>
          <thead>
            <tr className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-[28%] px-4 py-2 text-left">Part</th>
              <th className="w-[8%] px-4 py-2 text-right">Needed</th>
              <th className="w-[12%] px-4 py-2 text-right">Ordered</th>
              <th className="w-[10%] px-4 py-2 text-right">Received</th>
              <th className="w-[24%] px-4 py-2 text-left">Note</th>
              <th className="w-[8%] px-4 py-2 text-right">Status</th>
              <th className="w-[10%] px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {readyLines.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-center text-sm text-muted-foreground">
                  No lines remain for this seller group.
                </td>
              </tr>
            ) : (
              readyLines.map(line => (
                <ReadyLineRow
                  key={line.id}
                  line={line}
                  onOpenOrderDialog={onOpenOrderLine}
                  onRevertLine={onRevertLine}
                  onEditLine={onEditLine}
                  onUpdateStock={onUpdateStock}
                  highlight={highlightedLineId === line.id}
                  disabled={pendingLineIds.has(line.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
