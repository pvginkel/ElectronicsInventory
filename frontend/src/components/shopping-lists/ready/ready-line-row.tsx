import { forwardRef, type MouseEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreVerticalIcon } from '@/components/icons/MoreVerticalIcon';
import { cn } from '@/lib/utils';
import type { ShoppingListConceptLine } from '@/types/shopping-lists';
import { Info, Pencil } from 'lucide-react';

type ReadyLineRowActionHandler = (line: ShoppingListConceptLine, trigger?: HTMLElement | null) => void;

interface ReadyLineRowProps {
  line: ShoppingListConceptLine;
  onOpenOrderDialog: ReadyLineRowActionHandler;
  onRevertLine: (line: ShoppingListConceptLine) => void;
  onEditLine: (line: ShoppingListConceptLine) => void;
  onUpdateStock: ReadyLineRowActionHandler;
  highlight?: boolean;
  disabled?: boolean;
}

function getStatusLabel(status: ShoppingListConceptLine['status']): string {
  switch (status) {
    case 'ordered':
      return 'Ordered';
    case 'done':
      return 'Received';
    case 'new':
    default:
      return 'New';
  }
}

export const ReadyLineRow = forwardRef<HTMLTableRowElement, ReadyLineRowProps>(function ReadyLineRow(
  {
    line,
    onOpenOrderDialog,
    onRevertLine,
    onEditLine,
    onUpdateStock,
    highlight = false,
    disabled = false,
  },
  ref,
) {
  const handleOpenOrder = (event: MouseEvent<HTMLElement>) => {
    onOpenOrderDialog(line, event.currentTarget as HTMLElement);
  };

  return (
    <tr
      ref={ref}
      data-testid={`shopping-lists.ready.line.${line.id}`}
      className={cn(highlight && 'bg-emerald-50/60 transition-colors')}
    >
      <td className="align-top px-4 py-3 text-sm">
        <div className="font-medium text-foreground" data-testid={`shopping-lists.ready.line.${line.id}.part`}>
          {line.part.description}
        </div>
        <div className="text-xs text-muted-foreground space-x-2">
          <span>Key {line.part.key}</span>
          {line.part.manufacturerCode && <span>MPN {line.part.manufacturerCode}</span>}
        </div>
      </td>
      <td className="align-middle px-4 py-3 text-right text-sm font-medium" data-testid={`shopping-lists.ready.line.${line.id}.needed`}>
        {line.needed}
      </td>
      <td className="align-middle px-4 py-3 text-right text-sm" data-testid={`shopping-lists.ready.line.${line.id}.ordered`}>
        <div className="flex items-center justify-end gap-2">
          <span className={cn('font-medium', line.ordered > 0 ? 'text-foreground' : 'text-muted-foreground')}>
            {line.ordered}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleOpenOrder}
            disabled={disabled || line.status === 'done'}
            aria-label={`Adjust ordered quantity for ${line.part.description}`}
            data-testid={`shopping-lists.ready.line.${line.id}.ordered.edit`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </td>
      <td className="align-middle px-4 py-3 text-right text-sm" data-testid={`shopping-lists.ready.line.${line.id}.received`}>
        <div className="flex items-center justify-end gap-2">
          <span className={cn('font-medium', line.hasQuantityMismatch ? 'text-amber-600' : 'text-muted-foreground')}>
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
      <td className="align-top px-4 py-3 text-sm text-muted-foreground" data-testid={`shopping-lists.ready.line.${line.id}.note`}>
        {line.note?.trim() ? line.note : '—'}
      </td>
      <td className="align-middle px-4 py-3 text-sm text-right" data-testid={`shopping-lists.ready.line.${line.id}.status`}>
        <Badge variant={line.status === 'ordered' ? 'secondary' : line.status === 'done' ? 'outline' : 'default'}>
          {getStatusLabel(line.status)}
        </Badge>
      </td>
      <td className="align-middle px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {line.status === 'ordered' && line.canReceive && (
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={(event) => onUpdateStock(line, event.currentTarget as HTMLElement)}
              data-testid={`shopping-lists.ready.line.${line.id}.update-stock`}
            >
              Update Stock
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={disabled}
                aria-label={`Ready actions for ${line.part.description}`}
                data-testid={`shopping-lists.ready.line.${line.id}.actions`}
              >
                <MoreVerticalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {line.status === 'new' && (
                <DropdownMenuItem
                  onClick={() => onOpenOrderDialog(line)}
                  disabled={!line.isOrderable || disabled}
                  data-testid={`shopping-lists.ready.line.${line.id}.actions.mark-ordered`}
                >
                  Mark as Ordered
                </DropdownMenuItem>
              )}
              {line.status === 'ordered' && (
                <DropdownMenuItem
                  onClick={() => onOpenOrderDialog(line)}
                  disabled={disabled}
                  data-testid={`shopping-lists.ready.line.${line.id}.actions.adjust-ordered`}
                >
                  Adjust ordered quantity
                </DropdownMenuItem>
              )}
              {line.isRevertible && (
                <DropdownMenuItem
                  onClick={() => onRevertLine(line)}
                  disabled={disabled}
                  data-testid={`shopping-lists.ready.line.${line.id}.actions.revert`}
                >
                  Revert to New
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => onEditLine(line)}
                disabled={disabled}
                data-testid={`shopping-lists.ready.line.${line.id}.actions.edit`}
              >
                Edit line
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
});
