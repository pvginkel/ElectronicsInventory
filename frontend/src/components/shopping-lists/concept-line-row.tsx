import { forwardRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { PartInlineSummary } from '@/components/parts/part-inline-summary';
import { cn } from '@/lib/utils';
import type { ShoppingListConceptLine } from '@/types/shopping-lists';
import { LINE_TABLE_WIDTHS } from './table-layout';
import { Pencil, Trash2 } from 'lucide-react';

interface ConceptLineRowProps {
  line: ShoppingListConceptLine;
  onEdit: (line: ShoppingListConceptLine) => void;
  onDelete: (line: ShoppingListConceptLine) => void;
  highlighted?: boolean;
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

export const ConceptLineRow = forwardRef<HTMLTableRowElement, ConceptLineRowProps>(function ConceptLineRow(
  { line, onEdit, onDelete, highlighted = false },
  ref,
) {
  const sellerName = line.seller?.name ?? line.effectiveSeller?.name ?? null;
  const statusBadgeProps = getLineStatusBadgeProps(line.status);
  const note = line.note?.trim();

  return (
    <tr
      ref={ref}
      data-line-id={line.id}
      data-testid={`shopping-lists.concept.row.${line.id}`}
      className={cn('transition-colors', highlighted && 'bg-accent/10 ring-2 ring-primary/30')}
    >
      <td className={cn(LINE_TABLE_WIDTHS.part, 'align-top px-4 py-3 text-sm')}>
        <PartInlineSummary
          partKey={line.part.key}
          description={line.part.description}
          manufacturerCode={line.part.manufacturerCode}
          testId={`shopping-lists.concept.row.${line.id}.part`}
          link={true}
        />
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
        className={cn(LINE_TABLE_WIDTHS.status, 'align-middle px-4 py-3 text-sm text-center')}
        data-testid={`shopping-lists.concept.row.${line.id}.status`}
      >
        <StatusBadge
          {...statusBadgeProps}
          testId={`shopping-lists.concept.row.${line.id}.status.badge`}
        />
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
        <div className="line-clamp-2 overflow-hidden" title={note}>
          {note || '—'}
        </div>
      </td>
      <td className={cn(LINE_TABLE_WIDTHS.actions, 'align-middle px-4 py-3 text-right')}>
        <div className="flex items-center justify-end gap-2 flex-nowrap" data-testid={`shopping-lists.concept.row.${line.id}.actions`}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            aria-label={`Edit line for ${line.part.description}`}
            onClick={() => onEdit(line)}
            data-testid={`shopping-lists.concept.row.${line.id}.edit`}
            title="Edit line"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            aria-label={`Delete line for ${line.part.description}`}
            onClick={() => onDelete(line)}
            data-testid={`shopping-lists.concept.row.${line.id}.delete`}
            title="Delete line"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
});
