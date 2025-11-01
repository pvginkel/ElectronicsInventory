import { useEffect, useMemo, useRef } from 'react';
import { Alert } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SHOPPING_LIST_LINE_SORT_OPTIONS } from '@/hooks/use-shopping-lists';
import type { ShoppingListConceptLine, ShoppingListLineSortKey } from '@/types/shopping-lists';
import { ConceptLineRow } from './concept-line-row';
import { LINE_TABLE_WIDTHS } from './table-layout';
import { ArrowDownAZ } from 'lucide-react';

interface DuplicateNotice {
  lineId: number;
  partKey: string;
}

interface ConceptTableProps {
  lines: ShoppingListConceptLine[];
  sortKey: ShoppingListLineSortKey;
  onSortChange: (sortKey: ShoppingListLineSortKey) => void;
  onEditLine: (line: ShoppingListConceptLine) => void;
  onDeleteLine: (line: ShoppingListConceptLine) => void;
  onCreateLine: () => void;
  isMutating: boolean;
  duplicateNotice: DuplicateNotice | null;
  onDismissDuplicateNotice: () => void;
  highlightedLineId: number | null;
}

export function ConceptTable({
  lines,
  sortKey,
  onSortChange,
  onEditLine,
  onDeleteLine,
  onCreateLine,
  isMutating,
  duplicateNotice,
  onDismissDuplicateNotice,
  highlightedLineId,
}: ConceptTableProps) {
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    if (highlightedLineId == null) {
      return;
    }
    const row = rowRefs.current.get(highlightedLineId);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedLineId]);

  const noLines = lines.length === 0;

  const sortLabel = useMemo(() => {
    const option = SHOPPING_LIST_LINE_SORT_OPTIONS.find(item => item.key === sortKey);
    return option?.label ?? 'Part description';
  }, [sortKey]);

  return (
    <div className="rounded-lg border bg-card" data-testid="shopping-lists.concept.table">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Concept lines</h2>
          <p className="text-xs text-muted-foreground">Manage needed quantities and seller overrides.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={onCreateLine}
            disabled={isMutating}
            data-testid="shopping-lists.concept.table.add"
          >
            Add row
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0"
                aria-label="Change sort order"
                title={`Current sort: ${sortLabel}`}
                data-testid="shopping-lists.concept.sort.button"
              >
                <ArrowDownAZ className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SHOPPING_LIST_LINE_SORT_OPTIONS.map(option => (
                <DropdownMenuItem
                  key={option.key}
                  onClick={() => onSortChange(option.key)}
                  data-testid={`shopping-lists.concept.sort.${option.key}`}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {duplicateNotice && !isMutating && (
        <Alert
          variant="warning"
          icon={true}
          className="relative z-[60] rounded-none border-0 border-b pointer-events-auto"
          onDismiss={onDismissDuplicateNotice}
          testId="shopping-lists.concept.duplicate-banner"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const row = rowRefs.current.get(duplicateNotice.lineId);
                if (row) {
                  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
              data-testid="shopping-lists.concept.duplicate-banner.focus"
            >
              View existing line
            </Button>
          }
        >
          Part with key <strong>{duplicateNotice.partKey}</strong> already exists on this Concept list.
        </Alert>
      )}

      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <th className={`${LINE_TABLE_WIDTHS.part} px-4 py-2 text-left`}>Part</th>
              <th className={`${LINE_TABLE_WIDTHS.seller} px-4 py-2 text-left`}>Seller</th>
              <th className={`${LINE_TABLE_WIDTHS.status} px-4 py-2 text-center`}>Status</th>
              <th className={`${LINE_TABLE_WIDTHS.needed} px-4 py-2 text-right`}>Needed</th>
              <th className={`${LINE_TABLE_WIDTHS.ordered} px-4 py-2 text-right`}>Ordered</th>
              <th className={`${LINE_TABLE_WIDTHS.received} px-4 py-2 text-right`}>Received</th>
              <th className={`${LINE_TABLE_WIDTHS.note} px-4 py-2 text-left`}>Note</th>
              <th className={`${LINE_TABLE_WIDTHS.actions} px-4 py-2 text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {noLines ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground" data-testid="shopping-lists.concept.table.empty">
                  No lines yet—use “Add row” to populate this Concept list.
                </td>
              </tr>
            ) : (
              lines.map((line) => (
                <ConceptLineRow
                  key={line.id}
                  ref={(node) => {
                    if (node) {
                      rowRefs.current.set(line.id, node);
                    } else {
                      rowRefs.current.delete(line.id);
                    }
                  }}
                  line={line}
                  onEdit={onEditLine}
                  onDelete={onDeleteLine}
                  highlighted={highlightedLineId === line.id}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
