import { forwardRef, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui';
import { PartInlineSummary } from '@/components/parts/part-inline-summary';
import { cn } from '@/lib/utils';
import type { ShoppingListConceptLine } from '@/types/shopping-lists';
import { Info, Pencil, Trash2, Undo2 } from 'lucide-react';
import { LINE_TABLE_WIDTHS } from '../table-layout';

type ReadyLineRowActionHandler = (line: ShoppingListConceptLine, trigger?: HTMLElement | null) => void;

interface ReadyLineRowProps {
  line: ShoppingListConceptLine;
  onOpenOrderDialog: ReadyLineRowActionHandler;
  onRevertLine: (line: ShoppingListConceptLine) => void;
  onEditLine: (line: ShoppingListConceptLine) => void;
  onDeleteLine?: (line: ShoppingListConceptLine) => void;
  onUpdateStock: ReadyLineRowActionHandler;
  highlight?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
}

// Map line status to badge props
function getLineStatusBadgeProps(status: ShoppingListConceptLine['status']): { color: 'inactive' | 'active' | 'success'; label: string } {
  switch (status) {
    case 'new':
      return { color: 'inactive', label: 'New' };
    case 'ordered':
      return { color: 'active', label: 'Ordered' };
    case 'done':
      return { color: 'success', label: 'Completed' };
  }
}

export const ReadyLineRow = forwardRef<HTMLTableRowElement, ReadyLineRowProps>(function ReadyLineRow(
  {
    line,
    onOpenOrderDialog,
    onRevertLine,
    onEditLine,
    onDeleteLine,
    onUpdateStock,
    highlight = false,
    disabled = false,
    readOnly = false,
  },
  ref,
) {
  const handleOpenOrder = (event: MouseEvent<HTMLElement>) => {
    if (readOnly) {
      return;
    }
    onOpenOrderDialog(line, event.currentTarget as HTMLElement);
  };
  const statusBadgeProps = getLineStatusBadgeProps(line.status);
  const quantityMismatchTooltip = line.hasQuantityMismatch
    ? `Received ${line.received} vs ordered ${line.ordered}.`
    : undefined;
  const disableActions = disabled || readOnly;

  return (
    <tr
      ref={ref}
      data-testid={`shopping-lists.ready.line.${line.id}`}
      className={cn('transition-colors', highlight && 'bg-accent/10 ring-2 ring-primary/30')}
    >
      <td className={cn(LINE_TABLE_WIDTHS.part, 'align-top px-4 py-3 text-sm')}>
        <PartInlineSummary
          partKey={line.part.key}
          description={line.part.description}
          manufacturerCode={line.part.manufacturerCode}
          coverUrl={line.part.coverUrl}
          testId={`shopping-lists.ready.line.${line.id}.part`}
          link={true}
        />
      </td>
      <td
        className={cn(LINE_TABLE_WIDTHS.needed, 'align-middle px-4 py-3 text-right text-sm font-medium')}
        data-testid={`shopping-lists.ready.line.${line.id}.needed`}
      >
        {line.needed}
      </td>
      <td
        className={cn(LINE_TABLE_WIDTHS.ordered, 'align-middle px-4 py-3 text-right text-sm')}
        data-testid={`shopping-lists.ready.line.${line.id}.ordered`}
      >
        <div className="flex items-center justify-end gap-2 flex-nowrap">
          <span className={cn('font-medium', line.ordered > 0 ? 'text-foreground' : 'text-muted-foreground')}>
            {line.ordered}
          </span>
          {!readOnly && line.status !== 'done' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 shrink-0"
              disabled={disableActions}
              onClick={handleOpenOrder}
              aria-label={`Adjust ordered quantity for ${line.part.description}`}
              data-testid={`shopping-lists.ready.line.${line.id}.ordered.edit`}
              title="Adjust ordered quantity"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      </td>
      <td
        className={cn(LINE_TABLE_WIDTHS.received, 'align-middle px-4 py-3 text-right text-sm')}
        data-testid={`shopping-lists.ready.line.${line.id}.received`}
      >
        <div className="flex items-center justify-end gap-2">
          <span
            className={cn('font-medium', line.hasQuantityMismatch ? 'text-amber-600' : 'text-muted-foreground')}
            title={quantityMismatchTooltip}
          >
            {line.received}
          </span>
          {line.completionNote && (
            <span
              className="text-muted-foreground"
              title={line.completionNote}
              aria-label="Completion note"
              data-testid={`shopping-lists.ready.line.${line.id}.completion-note`}
            >
              <Info className="h-4 w-4" />
            </span>
          )}
        </div>
      </td>
      <td
        className={cn(LINE_TABLE_WIDTHS.note, 'align-top px-4 py-3 text-sm text-muted-foreground')}
        data-testid={`shopping-lists.ready.line.${line.id}.note`}
      >
        <div className="line-clamp-2 overflow-hidden" title={line.note ?? ''}>
          {line.note?.trim() ? line.note : '—'}
        </div>
      </td>
      <td
        className={cn(LINE_TABLE_WIDTHS.status, 'align-middle px-4 py-3 text-sm text-center')}
        data-testid={`shopping-lists.ready.line.${line.id}.status`}
      >
        <StatusBadge
          {...statusBadgeProps}
          testId={`shopping-lists.ready.line.${line.id}.status.badge`}
        />
      </td>
      <td className={cn(LINE_TABLE_WIDTHS.actions, 'align-middle px-4 py-3 text-right')}>
        {readOnly ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <div className="flex items-center justify-end gap-2 flex-nowrap" data-testid={`shopping-lists.ready.line.${line.id}.actions`}>
            {line.status === 'new' && (
              <Button
                variant="secondary"
                size="sm"
                className="whitespace-nowrap shrink-0"
                disabled={disableActions || !line.isOrderable}
                onClick={(event) => onOpenOrderDialog(line, event.currentTarget as HTMLElement)}
                data-testid={`shopping-lists.ready.line.${line.id}.actions.mark-ordered`}
                title="Mark as Ordered"
              >
                Mark as Ordered
              </Button>
            )}
            {line.status === 'ordered' && line.canReceive && (
              <Button
                variant="secondary"
                size="sm"
                className="whitespace-nowrap shrink-0"
                disabled={disableActions}
                onClick={(event) => onUpdateStock(line, event.currentTarget as HTMLElement)}
                data-testid={`shopping-lists.ready.line.${line.id}.update-stock`}
                title="Update stock"
              >
                Update Stock
              </Button>
            )}
            {line.isRevertible && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                disabled={disableActions}
                aria-label={`Revert ${line.part.description} to New`}
                onClick={() => onRevertLine(line)}
                data-testid={`shopping-lists.ready.line.${line.id}.actions.revert`}
                title="Revert to New"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            )}
            {line.status !== 'done' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                disabled={disableActions}
                aria-label={`Edit ${line.part.description}`}
                onClick={() => onEditLine(line)}
                data-testid={`shopping-lists.ready.line.${line.id}.actions.edit`}
                title="Edit line"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {line.status === 'new' && onDeleteLine && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                disabled={disableActions}
                aria-label={`Delete ${line.part.description}`}
                onClick={() => onDeleteLine(line)}
                data-testid={`shopping-lists.ready.line.${line.id}.actions.delete`}
                title="Delete line"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
});
