import { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { ShoppingListConceptLine } from '@/types/shopping-lists';

interface ConceptLineRowProps {
  line: ShoppingListConceptLine;
  onEdit: (line: ShoppingListConceptLine) => void;
  onDelete: (line: ShoppingListConceptLine) => void;
  highlighted?: boolean;
}

export const ConceptLineRow = forwardRef<HTMLTableRowElement, ConceptLineRowProps>(function ConceptLineRow(
  { line, onEdit, onDelete, highlighted = false },
  ref,
) {
  const sellerName = line.seller?.name ?? line.effectiveSeller?.name ?? '—';
  const statusLabel = line.status.charAt(0).toUpperCase() + line.status.slice(1);
  const note = line.note?.trim();

  return (
    <tr
      ref={ref}
      data-line-id={line.id}
      data-testid={`shopping-lists.concept.row.${line.id}`}
      className={highlighted ? 'bg-amber-50/70 transition-colors' : undefined}
    >
      <td className="align-top px-4 py-3 text-sm">
        <div className="font-medium text-foreground" data-testid={`shopping-lists.concept.row.${line.id}.part`}>
          {line.part.description}
        </div>
        <div className="text-xs text-muted-foreground space-x-2">
          <span>Key {line.part.key}</span>
          {line.part.manufacturerCode && <span>MPN {line.part.manufacturerCode}</span>}
          <span>Status {statusLabel}</span>
        </div>
      </td>
      <td className="align-middle px-4 py-3 text-sm text-muted-foreground" data-testid={`shopping-lists.concept.row.${line.id}.seller`}>
        {sellerName}
      </td>
      <td className="align-middle px-4 py-3 text-sm font-medium text-right" data-testid={`shopping-lists.concept.row.${line.id}.needed`}>
        {line.needed}
      </td>
      <td className="align-middle px-4 py-3 text-sm text-right text-muted-foreground" data-testid={`shopping-lists.concept.row.${line.id}.ordered`}>
        {line.ordered}
      </td>
      <td className="align-middle px-4 py-3 text-sm text-right text-muted-foreground" data-testid={`shopping-lists.concept.row.${line.id}.received`}>
        {line.received}
      </td>
      <td className="align-top px-4 py-3 text-sm text-muted-foreground" data-testid={`shopping-lists.concept.row.${line.id}.note`}>
        {note || '—'}
      </td>
      <td className="align-middle px-4 py-3 text-right">
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
