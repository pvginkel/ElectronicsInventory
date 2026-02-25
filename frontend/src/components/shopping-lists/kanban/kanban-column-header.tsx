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
  ShoppingCart,
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
      className="flex items-center gap-2 px-3 pt-3"
      data-testid={`${testIdBase}.header`}
    >
      <h3 className="text-sm font-semibold truncate text-slate-50">Unassigned</h3>
      <span className="shrink-0 rounded-full bg-slate-600 px-2 py-0.5 text-xs text-slate-200">
        {lineCount}
      </span>
      <div className="flex-1" />
      {!isCompleted && (
        <button
          type="button"
          onClick={onAddPart}
          data-testid={`${testIdBase}.add-part`}
          className={cn(
            'shrink-0 rounded p-1 cursor-pointer',
            'text-slate-300 hover:text-slate-50 hover:bg-slate-500/40',
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
    ? 'Cannot reopen: some items have been received or completed.'
    : undefined;
  const deleteDisabledReason = !canDelete
    ? 'Cannot remove an ordered seller group. Reopen it first.'
    : undefined;

  return (
    <div
      className="flex items-center gap-2 px-3 pt-3"
      data-testid={`${testIdBase}.header`}
    >
      {/* Seller logo + name + external link */}
      {group.sellerLogoUrl && (
        <img
          src={group.sellerLogoUrl}
          alt=""
          className="h-5 w-5 shrink-0 rounded object-contain"
        />
      )}
      <h3 className="text-sm font-semibold truncate text-slate-50" title={group.sellerName ?? undefined}>
        {group.sellerName}
      </h3>
      {group.sellerWebsite && (
        <a
          href={group.sellerWebsite}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-slate-300 hover:text-slate-50 p-1 -m-1 rounded"
          title={group.sellerWebsite}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      {isOrdered && (
        <Tooltip title="Order placed" enabled>
          <span className="shrink-0 inline-flex">
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </span>
        </Tooltip>
      )}
      <span className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-xs',
        isOrdered ? 'bg-accent-foreground/15 text-accent-foreground' : 'bg-slate-600 text-slate-200',
      )}>
        {lineCount}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Action buttons (hidden when list is done) */}
      {!isCompleted && (
        <>
          {/* Add part button (ordering mode only -- hidden on ordered columns) */}
          {mode === 'ordering' && (
            <button
              type="button"
              onClick={onAddPart}
              data-testid={`${testIdBase}.add-part`}
              className="shrink-0 rounded p-1 cursor-pointer text-slate-300 hover:text-slate-50 hover:bg-slate-500/40"
              title="Add part"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}

          {/* Order note icon with tooltip */}
          <Tooltip
            content={hasNote ? (group.orderNote ?? undefined) : undefined}
            enabled={hasNote}
            placement="bottom"
          >
            <button
              type="button"
              onClick={onEditNote}
              data-testid={`${testIdBase}.order-note`}
              className={cn(
                'relative shrink-0 rounded p-1 cursor-pointer',
                'text-slate-300 hover:text-slate-50 hover:bg-slate-500/40',
              )}
            >
              <NotebookPen className="h-4 w-4" />
              {/* Dot indicator when note exists */}
              {hasNote && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400" />
              )}
            </button>
          </Tooltip>

          {/* Complete button (icon only, ordering mode only) */}
          {mode === 'ordering' && (
            <Tooltip
              title={completeDisabledReason}
              enabled={!canComplete}
              testId={`${testIdBase}.complete`}
            >
              <button
                type="button"
                onClick={handleComplete}
                disabled={!canComplete}
                data-testid={`${testIdBase}.complete`}
                title={canComplete ? 'Place order' : undefined}
                className={cn(
                  'shrink-0 rounded p-1',
                  canComplete
                    ? 'cursor-pointer text-slate-300 hover:text-slate-50 hover:bg-slate-500/40'
                    : 'text-slate-500 cursor-not-allowed',
                )}
              >
                <ShoppingCart className="h-4 w-4" />
              </button>
            </Tooltip>
          )}

          {/* Overflow menu */}
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger
              className={cn(
                'shrink-0 rounded p-1 cursor-pointer text-slate-300 hover:text-slate-50 hover:bg-slate-500/40',
                menuOpen && 'text-slate-50 bg-slate-500/40',
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

              {/* Separator only when there's content above it */}
              {((mode === 'ordering' && hasUnassignedLines) || isOrdered) && (
                <DropdownMenuSeparator />
              )}

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
        </>
      )}
    </div>
  );
}
