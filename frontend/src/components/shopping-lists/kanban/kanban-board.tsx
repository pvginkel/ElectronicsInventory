/**
 * KanbanBoard -- top-level layout component for the shopping list Kanban view.
 *
 * Orchestrates:
 *   - Horizontal column layout with overflow-x scroll
 *   - @dnd-kit DndContext with PointerSensor + TouchSensor
 *   - DragOverlay rendering a clone of the dragged card
 *   - Ghost preview in the target column at the sorted position
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
import { usePermissions } from '@/hooks/use-permissions';
import { putShoppingListLinesByLineIdRole, postShoppingListsSellerGroupsByListIdRole } from '@/lib/api/generated/roles';
import { Gate } from '@/components/auth/gate';
import { KanbanColumn } from './kanban-column';
import { KanbanSkeletonColumn } from './kanban-skeleton-column';
import { KanbanCard } from './kanban-card';
import { useKanbanDnd, type KanbanDragData } from './use-kanban-dnd';
import { deriveCardMode } from './kanban-utils';
import type { ShoppingListLine, ShoppingListSellerGroup } from '@/types/shopping-lists';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface KanbanBoardProps {
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
  disabled,
  children,
}: {
  groupKey: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: groupKey, disabled });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg',
        isOver && !disabled && 'ring-2 ring-primary/40',
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
  dragOverSameColumn,
  children,
}: {
  line: ShoppingListLine;
  groupKey: string;
  sellerId: number | null;
  disabled: boolean;
  /** null = not over any column, true = over own column, false = over different column. */
  dragOverSameColumn: boolean | null;
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

  // No transform -- DragOverlay handles the visual movement.
  // When dragging over a different column the original hides (ghost appears there);
  // otherwise it shows at reduced opacity as a placeholder.
  let opacityClass: string | undefined;
  if (isDragging) {
    opacityClass = dragOverSameColumn === false ? 'opacity-0' : 'opacity-30';
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        opacityClass,
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

  // -- Permission check: readers cannot drag cards --
  const { hasRole } = usePermissions();
  const canDrag = hasRole(putShoppingListLinesByLineIdRole);

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
  // Allow horizontal scroll-drag from any non-interactive, non-card area
  // inside the board (column backgrounds, header text, empty states, gaps,
  // padding). Cards and buttons are excluded so DnD and actions keep working.
  const isDraggingRef = useRef(false);
  useEffect(() => {
    isDraggingRef.current = dnd.isDragging;
  }, [dnd.isDragging]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    let scrollState: { startX: number; scrollStart: number } | null = null;

    const onPointerDown = (event: PointerEvent) => {
      // Don't interfere with active DnD card drags
      if (isDraggingRef.current) return;

      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!board.contains(target) && target !== board) return;

      // Skip interactive elements, draggable card wrappers (role="button"
      // is added by @dnd-kit), and column card-list internals (overflow-y-auto)
      if (target.closest('button, input, textarea, a, select, [role="button"]')) return;
      if (target.closest('.overflow-y-auto')) return;

      scrollState = { startX: event.clientX, scrollStart: board.scrollLeft };
      board.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!scrollState) return;
      const dx = event.clientX - scrollState.startX;
      board.scrollLeft = scrollState.scrollStart - dx;
    };

    const onPointerUp = () => {
      if (!scrollState) return;
      scrollState = null;
      board.style.cursor = '';
      document.body.style.userSelect = '';
    };

    board.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      board.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  // -- Find the active line's mode for DragOverlay rendering --
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
  // Always include an unassigned column, even when the backend omits the empty bucket.
  const orderedGroups = useMemo(() => {
    const unassigned = groups.filter((g) => g.sellerId === null);
    const sellers = groups.filter((g) => g.sellerId !== null);
    if (unassigned.length === 0) {
      unassigned.push({
        groupKey: 'unassigned',
        sellerId: null,
        sellerName: null,
        sellerWebsite: null,
        sellerLogoUrl: null,
        status: null,
        completed: false,
        orderNote: null,
        totals: { needed: 0, ordered: 0, received: 0 },
        lines: [],
        hasOrderedLines: false,
        hasNewLines: false,
        hasDoneLines: false,
      });
    }
    return [...unassigned, ...sellers];
  }, [groups]);

  // -- Create the wrapCard render-prop for DnD integration --
  const createWrapCard = useCallback(
    (group: ShoppingListSellerGroup) => {
      return (cardElement: React.ReactElement, line: ShoppingListLine) => {
        // Cards cannot be dragged when: user is not an editor, list is done,
        // card is pending, line is ordered, or the group is ordered (receiving mode)
        const dragDisabled =
          !canDrag ||
          isCompleted ||
          pendingLineIds.has(line.id) ||
          line.status === 'ordered' ||
          group.status === 'ordered';

        // Determine if drag is over this column, a different column, or nowhere
        const overKey = dnd.overGroupKey;
        const dragOverSameColumn = overKey === null ? null : overKey === group.groupKey;

        return (
          <DraggableCardWrapper
            line={line}
            groupKey={group.groupKey}
            sellerId={group.sellerId}
            disabled={dragDisabled}
            dragOverSameColumn={dragOverSameColumn}
          >
            {cardElement}
          </DraggableCardWrapper>
        );
      };
    },
    [canDrag, isCompleted, pendingLineIds, dnd.overGroupKey],
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
        onDragOver={dnd.handleDragOver}
        onDragEnd={dnd.handleDragEnd}
        onDragCancel={dnd.handleDragCancel}
      >
        <div
          ref={boardRef}
          data-testid="shopping-lists.kanban.board"
          className={cn(
            'flex gap-6 overflow-x-auto overflow-y-hidden py-4 px-6',
            'flex-1 min-h-0',
          )}
        >
          {orderedGroups.map((group) => {
            // Ordered columns cannot accept drops
            const dropDisabled = group.status === 'ordered';
            return (
              <DroppableColumn key={group.groupKey} groupKey={group.groupKey} disabled={dropDisabled}>
                <KanbanColumn
                  group={group}
                  listId={listId}
                  isCompleted={isCompleted}
                  pendingLineIds={pendingLineIds}
                  highlightedLineId={highlightedLineId}
                  hasUnassignedLines={hasUnassignedLines}
                  isDragging={dnd.isDragging}
                  activeDragLine={dnd.activeLine}
                  isDropTarget={dnd.overGroupKey === group.groupKey}
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
                  className={cn(dropDisabled && dnd.isDragging && 'opacity-50 pointer-events-none')}
                />
              </DroppableColumn>
            );
          })}

          {/* Skeleton column for adding new sellers (hidden when list is done, and for readers) */}
          {!isCompleted && (
            <Gate requires={postShoppingListsSellerGroupsByListIdRole}>
              <KanbanSkeletonColumn
                existingSellerIds={existingSellerIds}
                isCreating={isCreatingGroup}
                onCreateGroup={onCreateGroup}
              />
            </Gate>
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
