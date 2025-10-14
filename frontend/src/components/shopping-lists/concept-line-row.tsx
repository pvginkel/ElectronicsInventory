import { forwardRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ShoppingListConceptLine } from '@/types/shopping-lists';
import { LINE_TABLE_WIDTHS } from './table-layout';

interface ConceptLineRowProps {
  line: ShoppingListConceptLine;
  onEdit: (line: ShoppingListConceptLine) => void;
  onDelete: (line: ShoppingListConceptLine) => void;
  highlighted?: boolean;
}

const STATUS_VARIANT: Record<ShoppingListConceptLine['status'], 'default' | 'secondary' | 'outline'> = {
  new: 'default',
  ordered: 'secondary',
  done: 'outline',
};

export const ConceptLineRow = forwardRef<HTMLTableRowElement, ConceptLineRowProps>(function ConceptLineRow(
  { line, onEdit, onDelete, highlighted = false },
  ref,
) {
  const sellerName = line.seller?.name ?? line.effectiveSeller?.name ?? null;
  const statusLabel = line.status.charAt(0).toUpperCase() + line.status.slice(1);
  const note = line.note?.trim();
  const statusVariant = STATUS_VARIANT[line.status] ?? 'secondary';

  return (
    <tr
      ref={ref}
      data-line-id={line.id}
      data-testid={`shopping-lists.concept.row.${line.id}`}
      className={highlighted ? 'bg-amber-50/70 transition-colors' : undefined}
    >
      <td className={cn(LINE_TABLE_WIDTHS.part, 'align-top px-4 py-3 text-sm')}>
        <div className="font-medium text-foreground" data-testid={`shopping-lists.concept.row.${line.id}.part`}>
          {line.part.description}
        </div>
        <div className="text-xs text-muted-foreground space-x-2">
          <span>Key {line.part.key}</span>
          {line.part.manufacturerCode && <span>MPN {line.part.manufacturerCode}</span>}
        </div>
      </td>
      <td
        className={cn(LINE_TABLE_WIDTHS.seller, 'align-middle px-4 py-3 text-sm text-muted-foreground')}
        data-testid={`shopping-lists.concept.row.${line.id}.seller`}
      >
        {sellerName ? (
          <Badge
            variant="outline"
            className="max-w-full truncate"
            title={sellerName}
            data-testid={`shopping-lists.concept.row.${line.id}.seller.badge`}
          >
            {sellerName}
          </Badge>
        ) : (
          <span
            className="text-muted-foreground"
            data-testid={`shopping-lists.concept.row.${line.id}.seller.empty`}
          >
            No seller set
          </span>
        )}
      </td>
      <td
        className={cn(LINE_TABLE_WIDTHS.status, 'align-middle px-4 py-3 text-sm')}
        data-testid={`shopping-lists.concept.row.${line.id}.status`}
      >
        <Badge
          variant={statusVariant}
          className="font-medium"
          title={`Line status: ${statusLabel}`}
          data-testid={`shopping-lists.concept.row.${line.id}.status.badge`}
        >
          {statusLabel}
        </Badge>
      </td>
      <td
        className={cn(LINE_TABLE_WIDTHS.needed, 'align-middle px-4 py-3 text-sm font-medium text-right')}
        data-testid={`shopping-lists.concept.row.${line.id}.needed`}
      >
        {line.needed}
      </td>
      <td
        className={cn(LINE_TABLE_WIDTHS.ordered, 'align-middle px-4 py-3 text-sm text-right text-muted-foreground')}
        data-testid={`shopping-lists.concept.row.${line.id}.ordered`}
      >
        {line.ordered}
      </td>
      <td
        className={cn(LINE_TABLE_WIDTHS.received, 'align-middle px-4 py-3 text-sm text-right text-muted-foreground')}
        data-testid={`shopping-lists.concept.row.${line.id}.received`}
      >
        {line.received}
      </td>
      <td
        className={cn(LINE_TABLE_WIDTHS.note, 'align-top px-4 py-3 text-sm text-muted-foreground')}
        data-testid={`shopping-lists.concept.row.${line.id}.note`}
      >
        {note || '—'}
      </td>
      <td className={cn(LINE_TABLE_WIDTHS.actions, 'align-middle px-4 py-3 text-right')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Actions for ${line.part.description}`}
              data-testid={`shopping-lists.concept.row.${line.id}.actions`}
            >
              ⋯
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(line)} data-testid={`shopping-lists.concept.row.${line.id}.edit`}>
              Edit line
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(line)} data-testid={`shopping-lists.concept.row.${line.id}.delete`}>
              Delete line
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
});
