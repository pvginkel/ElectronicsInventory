/**
 * KanbanBoard -- top-level layout component for the shopping list Kanban view.
 *
 * Orchestrates:
 *   - Horizontal column layout with overflow-x scroll
 *   - @dnd-kit DndContext with PointerSensor + TouchSensor
 *   - DragOverlay rendering a clone of the dragged card
 *   - Background drag-to-scroll (pointer down on board, not on a card)
 *   - Confirmation dialog when moving a card with ordered > 0 off a seller
 *   - Delegation of all mutations to the parent route via callbacks
 *
 * The board receives the full seller group array and derives columns from it.
 * It does NOT own any TanStack Query state -- that stays in the route (Slice 8).
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { DndContext, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { ConfirmDialog, type DialogContentProps } from '@/components/primitives/dialog';
import { KanbanColumn } from './kanban-column';
import { KanbanSkeletonColumn } from './kanban-skeleton-column';
import { KanbanCard } from './kanban-card';
import { useKanbanDnd, type KanbanDragData } from './use-kanban-dnd';
import { deriveCardMode } from './kanban-utils';
import type { ShoppingListConceptLine, ShoppingListSellerGroup } from '@/types/shopping-lists';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface KanbanBoardProps {
  /** All seller groups (including the ungrouped bucket). */
  groups: ShoppingListSellerGroup[];
  /** Shopping list ID. */
  listId: number;
  /** Whether the shopping list is done. */
  isCompleted: boolean;
  /** Set of line IDs with in-flight mutations. */
  pendingLineIds: Set<number>;
  /** Line ID highlighted after a successful mutation. */
  highlightedLineId?: number | null;
  /** Whether a seller group create mutation is in flight. */
  isCreatingGroup: boolean;

  // -- Mutation callbacks (owned by the route) --
  onFieldSave: (lineId: number, field: 'needed' | 'ordered' | 'note', value: string | number) => Promise<void>;
  onDeleteLine: (lineId: number) => void;
  onReceiveLine: (lineId: number) => void;
  onAddPart: (sellerId: number | null) => void;
  onMoveLine: (lineId: number, toSellerId: number | null, clearOrdered: boolean) => Promise<void>;
  onCompleteGroup: (sellerId: number) => void;
  onReopenGroup: (sellerId: number) => void;
  onDeleteGroup: (sellerId: number) => void;
  onAssignRemaining: (sellerId: number) => void;
  onEditNote: (sellerId: number) => void;
  onCreateGroup: (sellerId: number) => void;
}

// ---------------------------------------------------------------------------
// Droppable wrapper -- registers a column as a drop target
// ---------------------------------------------------------------------------

function DroppableColumn({
  groupKey,
  children,
}: {
  groupKey: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: groupKey });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg',
        isOver && 'ring-2 ring-primary/40',
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draggable card wrapper -- makes a card a drag source
// ---------------------------------------------------------------------------

function DraggableCardWrapper({
  line,
  groupKey,
  sellerId,
  disabled,
  children,
}: {
  line: ShoppingListConceptLine;
  groupKey: string;
  sellerId: number | null;
  disabled: boolean;
  children: React.ReactElement;
}) {
  const dragData: KanbanDragData = useMemo(
    () => ({
      type: 'card' as const,
      line,
      sourceGroupKey: groupKey,
      sourceSellerId: sellerId,
    }),
    [line, groupKey, sellerId],
  );

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `card-${line.id}`,
    data: dragData,
    disabled,
  });

  // No transform applied here -- DragOverlay handles the visual movement.
  // The original card stays in place as a gap placeholder.
  return (
    <div
      ref={setNodeRef}
      className={cn(
        isDragging && 'opacity-30',
        disabled ? 'cursor-default' : 'cursor-grab',
      )}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board component
// ---------------------------------------------------------------------------

export function KanbanBoard({
  groups,
  listId,
  isCompleted,
  pendingLineIds,
  highlightedLineId,
  isCreatingGroup,
  onFieldSave,
  onDeleteLine,
  onReceiveLine,
  onAddPart,
  onMoveLine,
  onCompleteGroup,
  onReopenGroup,
  onDeleteGroup,
  onAssignRemaining,
  onEditNote,
  onCreateGroup,
}: KanbanBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);

  // -- DnD hook --
  const dnd = useKanbanDnd({ groups, isCompleted, onMoveLine });

  // -- Set cursor-grabbing on body during drag --
  useEffect(() => {
    if (dnd.isDragging) {
      document.body.style.cursor = 'grabbing';
      return () => { document.body.style.cursor = ''; };
    }
  }, [dnd.isDragging]);

  // -- Derived: unassigned lines exist (for "assign remaining" in seller columns) --
  const hasUnassignedLines = useMemo(
    () => groups.some((g) => g.sellerId === null && g.lines.length > 0),
    [groups],
  );

  // -- Derived: existing seller IDs for the skeleton column filter --
  const existingSellerIds = useMemo(() => {
    const ids = new Set<number>();
    for (const g of groups) {
      if (g.sellerId !== null) ids.add(g.sellerId);
    }
    return ids;
  }, [groups]);

  // -- Background drag-to-scroll --
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    let isScrollDragging = false;
    let startX = 0;
    let scrollStart = 0;

    const onPointerDown = (event: PointerEvent) => {
      // Start scroll-drag when clicking the board background (directly on this
      // element or on the gap between columns which is part of the flex gap).
      const target = event.target as HTMLElement;
      if (target !== board && target.parentElement !== board) return;
      // Don't scroll-drag if the target is an interactive element inside a column
      if (target !== board) return;
      isScrollDragging = true;
      startX = event.clientX;
      scrollStart = board.scrollLeft;
      board.style.cursor = 'grabbing';
      board.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!isScrollDragging) return;
      const dx = event.clientX - startX;
      board.scrollLeft = scrollStart - dx;
    };

    const onPointerUp = () => {
      if (!isScrollDragging) return;
      isScrollDragging = false;
      board.style.cursor = '';
    };

    board.addEventListener('pointerdown', onPointerDown);
    board.addEventListener('pointermove', onPointerMove);
    board.addEventListener('pointerup', onPointerUp);
    board.addEventListener('pointercancel', onPointerUp);

    return () => {
      board.removeEventListener('pointerdown', onPointerDown);
      board.removeEventListener('pointermove', onPointerMove);
      board.removeEventListener('pointerup', onPointerUp);
      board.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  // -- Find the active line's mode for DragOverlay rendering --
  // Note: no useMemo -- React Compiler handles memoization automatically.
  const activeLine = dnd.activeLine;
  let activeLineMode = deriveCardMode(null);
  if (activeLine) {
    for (const g of groups) {
      if (g.lines.some((l) => l.id === activeLine.id)) {
        activeLineMode = deriveCardMode(g.status);
        break;
      }
    }
  }

  // -- Column ordering: unassigned first, then seller groups in order --
  const orderedGroups = useMemo(() => {
    const unassigned = groups.filter((g) => g.sellerId === null);
    const sellers = groups.filter((g) => g.sellerId !== null);
    return [...unassigned, ...sellers];
  }, [groups]);

  // -- Create the wrapCard render-prop for DnD integration --
  // This factory creates a per-group wrapCard function that provides
  // the correct groupKey and sellerId for each draggable card.
  const createWrapCard = useCallback(
    (group: ShoppingListSellerGroup) => {
      return (cardElement: React.ReactElement, line: ShoppingListConceptLine) => {
        // Cards cannot be dragged when: list is done, card is pending, or line is ordered
        const dragDisabled =
          isCompleted ||
          pendingLineIds.has(line.id) ||
          line.status === 'ordered';

        return (
          <DraggableCardWrapper
            line={line}
            groupKey={group.groupKey}
            sellerId={group.sellerId}
            disabled={dragDisabled}
          >
            {cardElement}
          </DraggableCardWrapper>
        );
      };
    },
    [isCompleted, pendingLineIds],
  );

  // -- Render the confirmation dialog for ordered-amount moves --
  const handleConfirmDialogChange = useCallback(
    (open: boolean) => {
      if (!open) dnd.cancelMove();
    },
    [dnd],
  );

  return (
    <>
      <DndContext
        sensors={dnd.sensors}
        onDragStart={dnd.handleDragStart}
        onDragEnd={dnd.handleDragEnd}
      >
        <div
          ref={boardRef}
          data-testid="shopping-lists.kanban.board"
          className={cn(
            'flex gap-4 overflow-x-auto py-4 px-4',
            'flex-1 min-h-0',
          )}
        >
          {orderedGroups.map((group) => (
            <DroppableColumn key={group.groupKey} groupKey={group.groupKey}>
              <KanbanColumn
                group={group}
                listId={listId}
                isCompleted={isCompleted}
                pendingLineIds={pendingLineIds}
                highlightedLineId={highlightedLineId}
                hasUnassignedLines={hasUnassignedLines}
                isDragging={dnd.isDragging}
                wrapCard={createWrapCard(group)}
                onFieldSave={onFieldSave}
                onDeleteLine={onDeleteLine}
                onReceiveLine={onReceiveLine}
                onAddPart={onAddPart}
                onCompleteGroup={onCompleteGroup}
                onReopenGroup={onReopenGroup}
                onDeleteGroup={onDeleteGroup}
                onAssignRemaining={onAssignRemaining}
                onEditNote={onEditNote}
              />
            </DroppableColumn>
          ))}

          {/* Skeleton column for adding new sellers (hidden when list is done) */}
          {!isCompleted && (
            <KanbanSkeletonColumn
              existingSellerIds={existingSellerIds}
              isCreating={isCreatingGroup}
              onCreateGroup={onCreateGroup}
            />
          )}
        </div>

        {/* Drag overlay -- renders a clone of the dragged card outside the normal flow.
            dropAnimation={null} prevents the overlay from animating back to origin on drop. */}
        <DragOverlay dropAnimation={null}>
          {activeLine ? (
            <div className="w-[calc(20rem-1.5rem)] opacity-90 shadow-xl rounded-md">
              <KanbanCard
                line={activeLine}
                mode={activeLineMode}
                listId={listId}
                isCompleted={isCompleted}
                isDragging
                onFieldSave={onFieldSave}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Confirmation dialog for moving card with ordered > 0 off seller */}
      <ConfirmDialog
        open={dnd.pendingConfirmation !== null}
        onOpenChange={handleConfirmDialogChange}
        title="Clear ordered amount?"
        description={
          dnd.pendingConfirmation
            ? `Moving "${dnd.pendingConfirmation.linePartKey}" will clear the ordered amount (${dnd.pendingConfirmation.orderedAmount}). Are you sure?`
            : ''
        }
        confirmText="Move and clear"
        onConfirm={() => void dnd.confirmMove()}
        destructive
        contentProps={{ 'data-testid': 'shopping-lists.kanban.move-confirm-dialog' } as DialogContentProps}
      />
    </>
  );
}
