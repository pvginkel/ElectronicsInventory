/**
 * KanbanCard -- renders a single shopping list line as a Kanban card.
 *
 * Three rendering modes based on the column context:
 *   - "unassigned": editable needed + note, trash icon, no ordered field
 *   - "ordering":   editable needed + note + ordered, seller link icon, trash (hidden when ordered)
 *   - "receiving":  read-only ordered + received, receive button (hidden when done)
 *
 * The entire card is the drag handle for DnD. Cards with line status "ordered"
 * are not draggable (backend blocks seller change on ordered lines).
 */
import { useCallback } from 'react';
import { ExternalLink, Package, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CoverImageDisplay } from '@/components/documents/cover-image-display';
import { KanbanCardField } from './kanban-card-field';
import { Tooltip } from '@/components/primitives/tooltip';
import type { ShoppingListConceptLine } from '@/types/shopping-lists';
import type { KanbanCardMode } from './kanban-utils';

export interface KanbanCardProps {
  line: ShoppingListConceptLine;
  /** Column mode drives which fields and actions are shown. */
  mode: KanbanCardMode;
  /** List ID used for instrumentation metadata. */
  listId: number;
  /** Whether the shopping list is completed (done). Disables all interactions. */
  isCompleted?: boolean;
  /** Whether a DnD drag is in progress (disables inline editing). */
  isDragging?: boolean;
  /** Whether this card's mutation is pending (shows disabled state). */
  isPending?: boolean;
  /** Callback to save an inline field edit. */
  onFieldSave: (lineId: number, field: 'needed' | 'ordered' | 'note', value: string | number) => Promise<void>;
  /** Callback to delete this line. */
  onDelete?: (lineId: number) => void;
  /** Callback to open the receive (UpdateStock) dialog for this line. */
  onReceive?: (lineId: number) => void;
  /** Optional highlight class applied after a successful mutation. */
  highlightClassName?: string;
}

export function KanbanCard({
  line,
  mode,
  listId,
  isCompleted = false,
  isDragging = false,
  isPending = false,
  onFieldSave,
  onDelete,
  onReceive,
  highlightClassName,
}: KanbanCardProps) {
  const testIdBase = `shopping-lists.kanban.card.${line.id}`;
  const isReadOnly = isCompleted || isDragging || isPending;

  // -- Field save handlers --
  const handleNeededSave = useCallback(async (value: string | number) => {
    await onFieldSave(line.id, 'needed', value);
  }, [line.id, onFieldSave]);

  const handleOrderedSave = useCallback(async (value: string | number) => {
    await onFieldSave(line.id, 'ordered', value);
  }, [line.id, onFieldSave]);

  const handleNoteSave = useCallback(async (value: string | number) => {
    await onFieldSave(line.id, 'note', value);
  }, [line.id, onFieldSave]);

  const handleDelete = useCallback(() => {
    onDelete?.(line.id);
  }, [line.id, onDelete]);

  const handleReceive = useCallback(() => {
    onReceive?.(line.id);
  }, [line.id, onReceive]);

  // -- Derived display values --
  const canDelete = !isCompleted && mode !== 'receiving' && line.status === 'new';
  const canReceive = mode === 'receiving' && line.canReceive && line.status !== 'done';
  const orderedWarning = line.ordered > 0 && line.ordered < line.needed;
  const sellerLinkUrl = line.sellerLink;
  const instrumentationMeta = { lineId: line.id, listId };

  return (
    <div
      data-testid={testIdBase}
      className={cn(
        'group/card rounded-lg border bg-card p-3 shadow-sm',
        'transition-shadow hover:shadow-md',
        isPending && 'opacity-60 pointer-events-none',
        highlightClassName,
      )}
    >
      {/* Top row: cover image + part info */}
      <div className="flex gap-2 mb-2">
        {line.part.coverUrl && (
          <CoverImageDisplay
            partId={line.part.key}
            coverUrl={line.part.coverUrl}
            size="small"
            className="!w-10 !h-10 shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <span className="font-semibold text-sm truncate" title={line.part.key}>
              {line.part.key}
            </span>
            {/* Seller link icon (ordering mode only, when seller link exists) */}
            {mode === 'ordering' && sellerLinkUrl && (
              <a
                href={sellerLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`${testIdBase}.seller-link`}
                className="text-muted-foreground hover:text-foreground shrink-0"
                title="Open seller product page"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate" title={line.part.description}>
            {line.part.description}
          </p>
        </div>
      </div>

      {/* Fields row: varies by mode */}
      <div className="space-y-1">
        {/* Needed field -- editable in unassigned and ordering modes */}
        {(mode === 'unassigned' || mode === 'ordering') && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground text-xs">Needed</span>
            <KanbanCardField
              formId={`KanbanCard:needed`}
              value={line.needed}
              onSave={handleNeededSave}
              type="number"
              min={1}
              testId={`${testIdBase}.field.needed`}
              readOnly={isReadOnly}
              metadata={instrumentationMeta}
              className="text-right"
            />
          </div>
        )}

        {/* Ordered field -- editable in ordering mode when line is "new" */}
        {mode === 'ordering' && (
          <Tooltip
            title={orderedWarning ? `Ordered ${line.ordered} of ${line.needed} needed` : undefined}
            enabled={orderedWarning}
          >
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground text-xs">Ordered</span>
              <KanbanCardField
                formId={`KanbanCard:ordered`}
                value={line.ordered}
                onSave={handleOrderedSave}
                type="number"
                min={0}
                testId={`${testIdBase}.field.ordered`}
                readOnly={isReadOnly || line.status !== 'new'}
                showDashForZero
                metadata={instrumentationMeta}
                className="text-right"
                displayClassName={orderedWarning ? 'text-amber-600' : undefined}
              />
            </div>
          </Tooltip>
        )}

        {/* Receiving mode: read-only ordered + received */}
        {mode === 'receiving' && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground text-xs">Ordered</span>
              <KanbanCardField
                formId={`KanbanCard:ordered`}
                value={line.ordered}
                onSave={handleOrderedSave}
                type="number"
                testId={`${testIdBase}.field.ordered`}
                readOnly
                showDashForZero
                metadata={instrumentationMeta}
                className="text-right"
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground text-xs">Received</span>
              <span
                className="px-1 py-0.5 text-sm"
                data-testid={`${testIdBase}.field.received`}
              >
                {line.received}
              </span>
            </div>
          </>
        )}

        {/* Note field -- editable in unassigned and ordering modes */}
        {(mode === 'unassigned' || mode === 'ordering') && (
          <div className="mt-1">
            <KanbanCardField
              formId={`KanbanCard:note`}
              value={line.note ?? ''}
              onSave={handleNoteSave}
              type="text"
              maxLength={500}
              testId={`${testIdBase}.field.note`}
              readOnly={isReadOnly}
              multiline
              metadata={instrumentationMeta}
              className={cn(
                'text-xs text-muted-foreground',
                // 3-line clamp with expand on hover
                'line-clamp-3 group-hover/card:line-clamp-none',
              )}
              placeholder="Add a note..."
            />
          </div>
        )}
      </div>

      {/* Bottom actions row */}
      <div className="flex items-center justify-end gap-1 mt-2">
        {/* Receive button (receiving mode only, when line can receive) */}
        {canReceive && (
          <button
            type="button"
            onClick={handleReceive}
            data-testid={`${testIdBase}.receive`}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'transition-colors',
            )}
          >
            <Package className="h-3 w-3" />
            Receive
          </button>
        )}

        {/* Trash icon (hidden for receiving mode, hidden when ordered/done) */}
        {canDelete && !isReadOnly && (
          <button
            type="button"
            onClick={handleDelete}
            data-testid={`${testIdBase}.delete`}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
            title="Delete line"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
