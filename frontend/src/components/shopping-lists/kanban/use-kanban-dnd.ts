/**
 * useKanbanDnd -- encapsulates all DnD logic for the Kanban board.
 *
 * Responsibilities:
 *   - Configure sensors (PointerSensor + TouchSensor with delay)
 *   - Track active drag state (which card, source/target columns)
 *   - Track the droppable currently being hovered (for ghost preview)
 *   - Handle drag-end: determine move intent, guard against invalid moves,
 *     trigger confirmation dialog when moving a card with ordered > 0 off a
 *     seller column, and finally dispatch the mutation
 *   - Emit instrumentation events for DnD moves
 *
 * The hook does NOT own the mutation -- it calls the provided `onMoveLine`
 * callback. The parent component (KanbanBoard) is responsible for the actual
 * API call and cache invalidation.
 */
import { useCallback, useState } from 'react';
import {
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { emitTestEvent } from '@/lib/test/event-emitter';
import type { ShoppingListLine, ShoppingListSellerGroup } from '@/types/shopping-lists';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Metadata attached to each draggable card via `useDraggable({ data })`. */
export interface KanbanDragData {
  type: 'card';
  line: ShoppingListLine;
  sourceGroupKey: string;
  sourceSellerId: number | null;
}

/** Represents a pending move that needs confirmation (ordered > 0 being cleared). */
export interface PendingMoveConfirmation {
  lineId: number;
  linePartKey: string;
  fromSellerId: number | null;
  toSellerId: number | null;
  orderedAmount: number;
}

export interface UseKanbanDndOptions {
  /** All seller groups (used to look up target column seller IDs). */
  groups: ShoppingListSellerGroup[];
  /** Whether the board is in a completed/read-only state. */
  isCompleted: boolean;
  /** Callback to execute the move mutation. */
  onMoveLine: (lineId: number, toSellerId: number | null, clearOrdered: boolean) => Promise<void>;
}

export interface UseKanbanDndReturn {
  /** Configured DnD sensors (pass to <DndContext>). */
  sensors: ReturnType<typeof useSensors>;
  /** The currently dragged line, or null when idle. */
  activeLine: ShoppingListLine | null;
  /** Whether a drag is in progress. */
  isDragging: boolean;
  /** Group key of the column the drag started from. */
  activeSourceGroupKey: string | null;
  /** Group key of the droppable currently being hovered, or null. */
  overGroupKey: string | null;
  /** Pending confirmation dialog state (if move requires clearing ordered). */
  pendingConfirmation: PendingMoveConfirmation | null;
  /** DndContext onDragStart handler. */
  handleDragStart: (event: DragStartEvent) => void;
  /** DndContext onDragOver handler (tracks hover target for ghost preview). */
  handleDragOver: (event: DragOverEvent) => void;
  /** DndContext onDragEnd handler. */
  handleDragEnd: (event: DragEndEvent) => void;
  /** DndContext onDragCancel handler. */
  handleDragCancel: () => void;
  /** Confirm a pending move (user clicked "Confirm" in the dialog). */
  confirmMove: () => Promise<void>;
  /** Cancel a pending move (user clicked "Cancel" in the dialog). */
  cancelMove: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useKanbanDnd({
  groups,
  isCompleted,
  onMoveLine,
}: UseKanbanDndOptions): UseKanbanDndReturn {
  // -- Sensors: pointer (desktop) + touch (mobile with 600ms long-press) --
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 600, tolerance: 5 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  // -- Drag state --
  const [activeLine, setActiveLine] = useState<ShoppingListLine | null>(null);
  const [activeSourceGroupKey, setActiveSourceGroupKey] = useState<string | null>(null);
  const [overGroupKey, setOverGroupKey] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingMoveConfirmation | null>(null);

  // -- Helpers --
  const findGroupByKey = useCallback(
    (groupKey: string): ShoppingListSellerGroup | undefined =>
      groups.find((g) => g.groupKey === groupKey),
    [groups],
  );

  /** Clear all transient drag state. */
  const resetDragState = useCallback(() => {
    setActiveLine(null);
    setActiveSourceGroupKey(null);
    setOverGroupKey(null);
  }, []);

  // -- Drag start --
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (isCompleted) return;
      const data = event.active.data.current as KanbanDragData | undefined;
      if (data?.type === 'card') {
        setActiveLine(data.line);
        setActiveSourceGroupKey(data.sourceGroupKey);
      }
    },
    [isCompleted],
  );

  // -- Drag over (tracks which droppable is hovered for ghost preview) --
  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      setOverGroupKey(event.over ? String(event.over.id) : null);
    },
    [],
  );

  // -- Drag end --
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const dragData = event.active.data.current as KanbanDragData | undefined;
      resetDragState();

      if (!dragData || dragData.type !== 'card' || isCompleted) return;
      if (!event.over) return; // Dropped on background -- no-op

      const targetGroupKey = String(event.over.id);
      const sourceGroupKey = dragData.sourceGroupKey;

      // Same column -- no-op
      if (targetGroupKey === sourceGroupKey) return;

      // Line is ordered -- cannot move (backend blocks seller change on ordered lines)
      if (dragData.line.status === 'ordered') {
        emitTestEvent({
          kind: 'ui_state',
          scope: 'kanban.card.move',
          phase: 'error',
          metadata: {
            lineId: dragData.line.id,
            fromColumn: sourceGroupKey,
            toColumn: targetGroupKey,
            reason: 'line_ordered',
          },
        });
        return;
      }

      // Resolve target seller ID
      const targetGroup = findGroupByKey(targetGroupKey);
      const toSellerId = targetGroup?.sellerId ?? null;

      // Check if moving off a seller column with ordered > 0
      if (dragData.sourceSellerId !== null && dragData.line.ordered > 0) {
        // Need confirmation -- store pending move
        setPendingConfirmation({
          lineId: dragData.line.id,
          linePartKey: dragData.line.part.key,
          fromSellerId: dragData.sourceSellerId,
          toSellerId,
          orderedAmount: dragData.line.ordered,
        });
        emitTestEvent({
          kind: 'ui_state',
          scope: 'kanban.card.move',
          phase: 'submit',
          metadata: {
            lineId: dragData.line.id,
            fromColumn: sourceGroupKey,
            toColumn: targetGroupKey,
            requiresConfirmation: true,
          },
        });
        return;
      }

      // Normal move -- no confirmation needed
      emitTestEvent({
        kind: 'ui_state',
        scope: 'kanban.card.move',
        phase: 'submit',
        metadata: {
          lineId: dragData.line.id,
          fromColumn: sourceGroupKey,
          toColumn: targetGroupKey,
        },
      });

      void onMoveLine(dragData.line.id, toSellerId, false).then(
        () => {
          emitTestEvent({
            kind: 'ui_state',
            scope: 'kanban.card.move',
            phase: 'success',
            metadata: {
              lineId: dragData.line.id,
              fromColumn: sourceGroupKey,
              toColumn: targetGroupKey,
            },
          });
        },
        () => {
          emitTestEvent({
            kind: 'ui_state',
            scope: 'kanban.card.move',
            phase: 'error',
            metadata: {
              lineId: dragData.line.id,
              fromColumn: sourceGroupKey,
              toColumn: targetGroupKey,
            },
          });
        },
      );
    },
    [isCompleted, findGroupByKey, onMoveLine, resetDragState],
  );

  // -- Drag cancel (e.g. Escape key) --
  const handleDragCancel = useCallback(() => {
    resetDragState();
  }, [resetDragState]);

  // -- Confirm pending move --
  const confirmMove = useCallback(async () => {
    if (!pendingConfirmation) return;
    const { lineId, toSellerId } = pendingConfirmation;
    setPendingConfirmation(null);

    try {
      await onMoveLine(lineId, toSellerId, true);
      emitTestEvent({
        kind: 'ui_state',
        scope: 'kanban.card.move',
        phase: 'success',
        metadata: { lineId, toSellerId, clearedOrdered: true },
      });
    } catch {
      emitTestEvent({
        kind: 'ui_state',
        scope: 'kanban.card.move',
        phase: 'error',
        metadata: { lineId, toSellerId, clearedOrdered: true },
      });
    }
  }, [pendingConfirmation, onMoveLine]);

  // -- Cancel pending move --
  const cancelMove = useCallback(() => {
    if (pendingConfirmation) {
      emitTestEvent({
        kind: 'ui_state',
        scope: 'kanban.card.move',
        phase: 'error',
        metadata: {
          lineId: pendingConfirmation.lineId,
          reason: 'cancelled',
        },
      });
    }
    setPendingConfirmation(null);
  }, [pendingConfirmation]);

  return {
    sensors,
    activeLine,
    isDragging: activeLine !== null,
    activeSourceGroupKey,
    overGroupKey,
    pendingConfirmation,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    confirmMove,
    cancelMove,
  };
}
