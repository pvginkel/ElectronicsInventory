/**
 * KanbanColumn -- renders one column of the shopping list Kanban board.
 *
 * Two column types:
 *   - Unassigned (sellerId == null): shows UnassignedColumnHeader + cards
 *   - Seller (sellerId != null): shows SellerColumnHeader + cards
 *
 * Each column has a fixed width (w-80 / 320px), scrolls its card list
 * vertically, and registers as a droppable zone via the `droppableId` prop
 * (wired up by the parent KanbanBoard in Slice 7).
 *
 * This component is intentionally "dumb" -- it receives callbacks for all
 * actions and delegates to the board/route for mutation orchestration.
 */
import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { KanbanCard } from './kanban-card';
import {
  UnassignedColumnHeader,
  SellerColumnHeader,
} from './kanban-column-header';
import { deriveCardMode } from './kanban-utils';
import type { ShoppingListConceptLine, ShoppingListSellerGroup } from '@/types/shopping-lists';

/**
 * Render-prop that wraps each card with DnD behavior (provided by KanbanBoard).
 * The wrapper receives the card's React element and the line it represents.
 */
export type CardWrapper = (
  cardElement: React.ReactElement,
  line: ShoppingListConceptLine,
) => React.ReactNode;

export interface KanbanColumnProps {
  /** The seller group backing this column. */
  group: ShoppingListSellerGroup;
  /** List ID for instrumentation metadata. */
  listId: number;
  /** Whether the shopping list is done. Disables all interactions. */
  isCompleted: boolean;
  /** Set of line IDs with in-flight mutations (cards shown as pending). */
  pendingLineIds: Set<number>;
  /** Line ID currently highlighted after a successful mutation. */
  highlightedLineId?: number | null;
  /** Whether there are unassigned lines (for "Assign remaining" action). */
  hasUnassignedLines: boolean;
  /** Whether a drag is currently in progress (disables inline editing). */
  isDragging?: boolean;
  /**
   * Optional render-prop to wrap each card (e.g. with a DnD draggable container).
   * When not provided, cards render without DnD wrapping.
   */
  wrapCard?: CardWrapper;

  // -- Callbacks (delegated to the board/route) --
  onFieldSave: (lineId: number, field: 'needed' | 'ordered' | 'note', value: string | number) => Promise<void>;
  onDeleteLine: (lineId: number) => void;
  onReceiveLine: (lineId: number) => void;
  onAddPart: (sellerId: number | null) => void;
  onCompleteGroup: (sellerId: number) => void;
  onReopenGroup: (sellerId: number) => void;
  onDeleteGroup: (sellerId: number) => void;
  onAssignRemaining: (sellerId: number) => void;
  onEditNote: (sellerId: number) => void;

  /** Extra class names for the column root. */
  className?: string;
}

export function KanbanColumn({
  group,
  listId,
  isCompleted,
  pendingLineIds,
  highlightedLineId,
  hasUnassignedLines,
  isDragging = false,
  wrapCard,
  onFieldSave,
  onDeleteLine,
  onReceiveLine,
  onAddPart,
  onCompleteGroup,
  onReopenGroup,
  onDeleteGroup,
  onAssignRemaining,
  onEditNote,
  className,
}: KanbanColumnProps) {
  const isUnassigned = group.sellerId === null;
  const mode = deriveCardMode(group.status);
  const testIdBase = `shopping-lists.kanban.column.${group.groupKey}`;

  // -- Derived preconditions for seller column actions --
  const canComplete = useMemo(() => {
    if (mode !== 'ordering') return false;
    // Every line must have ordered > 0
    return group.lines.length > 0 && group.lines.every(line => line.ordered > 0);
  }, [mode, group.lines]);

  const canReopen = useMemo(() => {
    if (mode !== 'receiving') return false;
    // No line may have received > 0
    return group.lines.every(line => line.received === 0);
  }, [mode, group.lines]);

  const canDeleteGroup = useMemo(() => {
    // Cannot delete an ordered group
    return group.status !== 'ordered';
  }, [group.status]);

  return (
    <div
      data-testid={testIdBase}
      className={cn(
        'flex flex-col w-80 shrink-0 rounded-lg bg-green-600',
        'max-h-full',
        className,
      )}
    >
      {/* Column header */}
      {isUnassigned ? (
        <UnassignedColumnHeader
          lineCount={group.lines.length}
          isCompleted={isCompleted}
          onAddPart={() => onAddPart(null)}
          testIdBase={testIdBase}
        />
      ) : (
        <SellerColumnHeader
          group={group}
          mode={mode}
          lineCount={group.lines.length}
          isCompleted={isCompleted}
          canComplete={canComplete}
          canReopen={canReopen}
          canDelete={canDeleteGroup}
          hasUnassignedLines={hasUnassignedLines}
          onAddPart={() => onAddPart(group.sellerId)}
          onComplete={() => group.sellerId != null && onCompleteGroup(group.sellerId)}
          onReopen={() => group.sellerId != null && onReopenGroup(group.sellerId)}
          onDelete={() => group.sellerId != null && onDeleteGroup(group.sellerId)}
          onAssignRemaining={() => group.sellerId != null && onAssignRemaining(group.sellerId)}
          onEditNote={() => group.sellerId != null && onEditNote(group.sellerId)}
          testIdBase={testIdBase}
        />
      )}

      {/* Scrollable card list -- hide horizontal scrollbar */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-2 min-h-0">
        {group.lines.length === 0 ? (
          <EmptyColumnMessage isUnassigned={isUnassigned} />
        ) : (
          group.lines.map((line: ShoppingListConceptLine) => {
            const card = (
              <KanbanCard
                key={line.id}
                line={line}
                mode={mode}
                listId={listId}
                isCompleted={isCompleted}
                isDragging={isDragging}
                isPending={pendingLineIds.has(line.id)}
                onFieldSave={onFieldSave}
                onDelete={onDeleteLine}
                onReceive={onReceiveLine}
                highlightClassName={
                  highlightedLineId === line.id
                    ? 'ring-2 ring-primary/50 animate-pulse'
                    : undefined
                }
              />
            );
            // When a wrapCard render-prop is provided (by KanbanBoard for DnD),
            // wrap the card element; otherwise render it directly.
            return wrapCard ? (
              <React.Fragment key={line.id}>{wrapCard(card, line)}</React.Fragment>
            ) : (
              card
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state message
// ---------------------------------------------------------------------------

function EmptyColumnMessage({ isUnassigned }: { isUnassigned: boolean }) {
  return (
    <div className="flex items-center justify-center px-3 py-6 text-center">
      <p className="text-xs text-green-200/60">
        {isUnassigned
          ? 'No items yet -- use the + button to add parts.'
          : 'No items. Drag cards here or use "Assign remaining."'}
      </p>
    </div>
  );
}
