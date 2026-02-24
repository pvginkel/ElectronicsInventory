/**
 * KanbanColumnHeader -- renders the header area of a Kanban column.
 *
 * Two visual variants:
 *   - Unassigned: simple title + line count + "Add Part" button
 *   - Seller: seller name + logo + website link + line count + order note
 *     icon + complete button + overflow menu (assign remaining, reopen,
 *     remove seller)
 *
 * Action buttons and menu items respect `isCompleted` (list done) and
 * derived preconditions (canComplete, canReopen, canDelete).
 */
import { useCallback, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  MoreHorizontal,
  NotebookPen,
  Plus,
  Trash2,
  Undo2,
  ArrowDownToLine,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/primitives/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/primitives/dropdown-menu';
import type { KanbanCardMode } from './kanban-utils';
import type { ShoppingListSellerGroup } from '@/types/shopping-lists';

// ---------------------------------------------------------------------------
// Unassigned header
// ---------------------------------------------------------------------------

export interface UnassignedColumnHeaderProps {
  lineCount: number;
  isCompleted: boolean;
  onAddPart: () => void;
  testIdBase: string;
}

export function UnassignedColumnHeader({
  lineCount,
  isCompleted,
  onAddPart,
  testIdBase,
}: UnassignedColumnHeaderProps) {
  return (
    <div
      className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30"
      data-testid={`${testIdBase}.header`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <h3 className="text-sm font-semibold truncate">Unassigned</h3>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {lineCount}
        </span>
      </div>
      {!isCompleted && (
        <button
          type="button"
          onClick={onAddPart}
          data-testid={`${testIdBase}.add-part`}
          className={cn(
            'shrink-0 rounded p-1 text-muted-foreground hover:text-foreground',
            'hover:bg-accent transition-colors',
          )}
          title="Add part"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seller column header
// ---------------------------------------------------------------------------

export interface SellerColumnHeaderProps {
  group: ShoppingListSellerGroup;
  mode: KanbanCardMode;
  lineCount: number;
  isCompleted: boolean;
  /** Whether all lines have ordered > 0 (enables the Complete button). */
  canComplete: boolean;
  /** Whether none of the lines have received > 0 (enables Reopen). */
  canReopen: boolean;
  /** Whether the group can be deleted (not ordered). */
  canDelete: boolean;
  /** Whether there are unassigned lines to assign. */
  hasUnassignedLines: boolean;
  onAddPart: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onAssignRemaining: () => void;
  onEditNote: () => void;
  testIdBase: string;
}

export function SellerColumnHeader({
  group,
  mode,
  lineCount,
  isCompleted,
  canComplete,
  canReopen,
  canDelete,
  hasUnassignedLines,
  onAddPart,
  onComplete,
  onReopen,
  onDelete,
  onAssignRemaining,
  onEditNote,
  testIdBase,
}: SellerColumnHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isOrdered = mode === 'receiving';
  const hasNote = Boolean(group.orderNote?.trim());

  const handleComplete = useCallback(() => {
    if (canComplete) onComplete();
  }, [canComplete, onComplete]);

  const handleReopen = useCallback(() => {
    if (canReopen) onReopen();
    setMenuOpen(false);
  }, [canReopen, onReopen]);

  const handleDelete = useCallback(() => {
    if (canDelete) onDelete();
    setMenuOpen(false);
  }, [canDelete, onDelete]);

  const handleAssignRemaining = useCallback(() => {
    onAssignRemaining();
    setMenuOpen(false);
  }, [onAssignRemaining]);

  // -- Tooltip messages for disabled states --
  const completeDisabledReason = !canComplete
    ? 'All lines must have an ordered quantity before placing the order.'
    : undefined;
  const reopenDisabledReason = !canReopen
    ? 'Cannot reopen: some items have already been received.'
    : undefined;
  const deleteDisabledReason = !canDelete
    ? 'Cannot remove an ordered seller group. Reopen it first.'
    : undefined;

  return (
    <div
      className={cn(
        'flex flex-col gap-1 px-3 py-2 border-b',
        isOrdered ? 'bg-green-50 dark:bg-green-950/20' : 'bg-muted/30',
      )}
      data-testid={`${testIdBase}.header`}
    >
      {/* Row 1: seller name + logo + line count */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {group.sellerLogoUrl && (
            <img
              src={group.sellerLogoUrl}
              alt=""
              className="h-5 w-5 shrink-0 rounded object-contain"
            />
          )}
          <h3 className="text-sm font-semibold truncate" title={group.sellerName ?? undefined}>
            {group.sellerName}
          </h3>
          {isOrdered && (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
          )}
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {lineCount}
        </span>
      </div>

      {/* Row 2: website link (if available) */}
      {group.sellerWebsite && (
        <a
          href={group.sellerWebsite}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground truncate"
          title={group.sellerWebsite}
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{group.sellerWebsite}</span>
        </a>
      )}

      {/* Row 3: action buttons (hidden when list is done) */}
      {!isCompleted && (
        <div className="flex items-center gap-1 mt-1">
          {/* Add part button */}
          <button
            type="button"
            onClick={onAddPart}
            data-testid={`${testIdBase}.add-part`}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Add part"
          >
            <Plus className="h-4 w-4" />
          </button>

          {/* Order note icon */}
          <button
            type="button"
            onClick={onEditNote}
            data-testid={`${testIdBase}.order-note`}
            className={cn(
              'relative rounded p-1 transition-colors',
              'text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
            title={hasNote ? 'Edit order note' : 'Add order note'}
          >
            <NotebookPen className="h-4 w-4" />
            {/* Dot indicator when note exists */}
            {hasNote && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
            )}
          </button>

          {/* Complete/Order button (ordering mode only) */}
          {mode === 'ordering' && (
            <Tooltip
              title={completeDisabledReason}
              enabled={!canComplete}
            >
              <button
                type="button"
                onClick={handleComplete}
                disabled={!canComplete}
                data-testid={`${testIdBase}.complete`}
                className={cn(
                  'ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium',
                  'transition-colors',
                  canComplete
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-muted text-muted-foreground cursor-not-allowed',
                )}
              >
                <CheckCircle2 className="h-3 w-3" />
                Complete
              </button>
            </Tooltip>
          )}

          {/* Overflow menu */}
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger
              className={cn(
                'rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
                mode !== 'ordering' && 'ml-auto',
              )}
              data-testid={`${testIdBase}.menu`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* Assign remaining (ordering mode, when unassigned lines exist) */}
              {mode === 'ordering' && hasUnassignedLines && (
                <DropdownMenuItem onClick={handleAssignRemaining}>
                  <ArrowDownToLine className="mr-2 h-4 w-4" />
                  Assign remaining
                </DropdownMenuItem>
              )}

              {/* Reopen (receiving mode) */}
              {isOrdered && (
                <Tooltip
                  title={reopenDisabledReason}
                  enabled={!canReopen}
                >
                  <DropdownMenuItem
                    onClick={handleReopen}
                    disabled={!canReopen}
                  >
                    <Undo2 className="mr-2 h-4 w-4" />
                    Reopen
                  </DropdownMenuItem>
                </Tooltip>
              )}

              <DropdownMenuSeparator />

              {/* Remove seller */}
              <Tooltip
                title={deleteDisabledReason}
                enabled={!canDelete}
              >
                <DropdownMenuItem
                  onClick={handleDelete}
                  disabled={!canDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove seller
                </DropdownMenuItem>
              </Tooltip>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
