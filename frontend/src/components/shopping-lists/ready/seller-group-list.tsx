import { useMemo } from 'react';
import type { ShoppingListConceptLine, ShoppingListSellerGroup } from '@/types/shopping-lists';
import { sortSellerGroupsForReadyView } from '@/hooks/use-shopping-lists';
import { SellerGroupCard } from './seller-group-card';

interface SellerGroupListProps {
  listId: number;
  groups: ShoppingListSellerGroup[];
  onOpenOrderLine: (line: ShoppingListConceptLine, trigger?: HTMLElement | null) => void;
  onOpenOrderGroup: (group: ShoppingListSellerGroup, trigger?: HTMLElement | null) => void;
  onRevertLine: (line: ShoppingListConceptLine) => void;
  onEditLine: (line: ShoppingListConceptLine) => void;
  onDeleteLine?: (line: ShoppingListConceptLine) => void;
  onUpdateStock: (line: ShoppingListConceptLine, trigger?: HTMLElement | null) => void;
  pendingLineIds: Set<number>;
  highlightedLineId?: number | null;
  isCompleted: boolean;
}

export function SellerGroupList({
  listId,
  groups,
  onOpenOrderLine,
  onOpenOrderGroup,
  onRevertLine,
  onEditLine,
  onDeleteLine,
  onUpdateStock,
  pendingLineIds,
  highlightedLineId,
  isCompleted,
}: SellerGroupListProps) {
  const sortedGroups = useMemo(() => sortSellerGroupsForReadyView(groups), [groups]);

  return (
    <div className="space-y-6" data-testid="shopping-lists.ready.groups">
      {sortedGroups.map(group => {
        const hasNewLines = group.hasNewLines ?? group.lines.some(line => line.status === 'new');

        return (
          <SellerGroupCard
            key={group.groupKey}
            listId={listId}
            group={group}
            onOpenOrderLine={onOpenOrderLine}
            onOpenOrderGroup={onOpenOrderGroup}
            onRevertLine={onRevertLine}
            onEditLine={onEditLine}
            onDeleteLine={onDeleteLine}
            onUpdateStock={onUpdateStock}
            pendingLineIds={pendingLineIds}
            highlightedLineId={highlightedLineId}
            canBulkOrder={!isCompleted && hasNewLines}
            isCompleted={isCompleted}
          />
        );
      })}
    </div>
  );
}
