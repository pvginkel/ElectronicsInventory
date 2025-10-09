import { useMemo } from 'react';
import type { ShoppingListConceptLine, ShoppingListSellerGroup } from '@/types/shopping-lists';
import { SellerGroupCard } from './seller-group-card';

interface SellerGroupListProps {
  listId: number;
  groups: ShoppingListSellerGroup[];
  onOpenOrderLine: (line: ShoppingListConceptLine, trigger?: HTMLElement | null) => void;
  onOpenOrderGroup: (group: ShoppingListSellerGroup, trigger?: HTMLElement | null) => void;
  onRevertLine: (line: ShoppingListConceptLine) => void;
  onEditLine: (line: ShoppingListConceptLine) => void;
  onUpdateStock: (line: ShoppingListConceptLine) => void;
  pendingLineIds: Set<number>;
  highlightedLineId?: number | null;
}

function sortSellerGroups(groups: ShoppingListSellerGroup[]): ShoppingListSellerGroup[] {
  return [...groups].sort((a, b) => {
    const aUngrouped = a.sellerId == null;
    const bUngrouped = b.sellerId == null;

    if (aUngrouped && bUngrouped) return a.groupKey.localeCompare(b.groupKey);
    if (aUngrouped) return 1;
    if (bUngrouped) return -1;

    return (a.sellerName ?? '').localeCompare(b.sellerName ?? '');
  });
}

export function SellerGroupList({
  listId,
  groups,
  onOpenOrderLine,
  onOpenOrderGroup,
  onRevertLine,
  onEditLine,
  onUpdateStock,
  pendingLineIds,
  highlightedLineId,
}: SellerGroupListProps) {
  const sortedGroups = useMemo(() => sortSellerGroups(groups), [groups]);

  return (
    <div className="space-y-6" data-testid="shopping-lists.ready.groups">
      {sortedGroups.map(group => (
        <SellerGroupCard
          key={group.groupKey}
          listId={listId}
          group={group}
          onOpenOrderLine={onOpenOrderLine}
          onOpenOrderGroup={onOpenOrderGroup}
          onRevertLine={onRevertLine}
          onEditLine={onEditLine}
          onUpdateStock={onUpdateStock}
          pendingLineIds={pendingLineIds}
          highlightedLineId={highlightedLineId}
        />
      ))}
    </div>
  );
}
