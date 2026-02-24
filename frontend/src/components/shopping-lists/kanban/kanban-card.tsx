/**
 * KanbanCard -- renders a single shopping list line as a Kanban card.
 *
 * Three rendering modes based on the column context:
 *   - "unassigned": editable needed + note, trash icon, no ordered field
 *   - "ordering":   editable needed + note + ordered, seller link icon, trash (disabled when ordered)
 *   - "receiving":  read-only ordered + received, receive button (hidden when done)
 *
 * The entire card is the drag handle for DnD. Cards with line status "ordered"
 * are not draggable (backend blocks seller change on ordered lines).
 *
 * Part info mirrors the reusable PartListItem layout: description as the title
 * line, part key below it in mono font.
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
  const deleteDisabled = isReadOnly;
  const canReceive = mode === 'receiving' && line.canReceive && line.status !== 'done';
  const orderedWarning = line.ordered > 0 && line.ordered < line.needed;
  const sellerLinkUrl = line.sellerLink;
  const instrumentationMeta = { lineId: line.id, listId };
  // Note is editable in unassigned/ordering when not read-only
  const noteEditable = (mode === 'unassigned' || mode === 'ordering') && !isReadOnly;

  return (
    <div
      data-testid={testIdBase}
      className={cn(
        'group/card rounded-md bg-slate-900/80 p-3',
        isPending && 'opacity-60 pointer-events-none',
        highlightClassName,
      )}
    >
      {/* Top row: cover image + part info (description first, key below in mono) */}
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
            <span className="font-semibold text-sm truncate text-slate-50" title={line.part.description}>
              {line.part.description}
            </span>
            {/* Seller link icon (ordering mode only, when seller link exists) */}
            {mode === 'ordering' && sellerLinkUrl && (
              <a
                href={sellerLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`${testIdBase}.seller-link`}
                className="text-blue-400 hover:text-slate-200 shrink-0"
                title="Open seller product page"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <p className="text-xs text-slate-400 truncate font-mono" title={line.part.key}>
            {line.part.key}
          </p>
        </div>
      </div>

      {/* Fields row: varies by mode */}
      <div className="space-y-1">
        {/* Needed field -- editable in unassigned and ordering modes */}
        {(mode === 'unassigned' || mode === 'ordering') && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400 text-xs">Needed</span>
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
              displayClassName="text-slate-50"
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
              <span className="text-slate-400 text-xs">Ordered</span>
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
                displayClassName={orderedWarning ? 'text-amber-400' : 'text-slate-50'}
              />
            </div>
          </Tooltip>
        )}

        {/* Receiving mode: read-only ordered + received */}
        {mode === 'receiving' && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400 text-xs">Ordered</span>
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
                displayClassName="text-slate-50"
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400 text-xs">Received</span>
              <span
                className="px-1 py-0.5 text-sm text-slate-50"
                data-testid={`${testIdBase}.field.received`}
              >
                {line.received}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Note + trash row -- always visible (read-only when receiving or completed) */}
      <div className="flex items-start gap-1 mt-1">
        <div className="flex-1 min-w-0">
          <KanbanCardField
            formId={`KanbanCard:note`}
            value={line.note ?? ''}
            onSave={handleNoteSave}
            type="text"
            maxLength={500}
            testId={`${testIdBase}.field.note`}
            readOnly={!noteEditable}
            multiline
            metadata={instrumentationMeta}
            className={cn(
              'text-xs text-slate-400',
              // 3-line clamp with expand on hover
              'line-clamp-3 group-hover/card:line-clamp-none',
            )}
            placeholder={noteEditable ? 'Add a note...' : undefined}
          />
        </div>
        {/* Trash icon sits next to the note */}
        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteDisabled}
            data-testid={`${testIdBase}.delete`}
            className={cn(
              'shrink-0 rounded p-1 cursor-pointer mt-0.5',
              deleteDisabled
                ? 'text-slate-600 cursor-default'
                : 'text-slate-400 hover:text-red-400 hover:bg-red-950/40',
            )}
            title="Delete line"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Bottom actions row (receive button only) */}
      {canReceive && (
        <div className="flex items-center justify-end mt-2">
          <button
            type="button"
            onClick={handleReceive}
            data-testid={`${testIdBase}.receive`}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium cursor-pointer',
              'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            <Package className="h-3 w-3" />
            Receive
          </button>
        </div>
      )}
    </div>
  );
}
