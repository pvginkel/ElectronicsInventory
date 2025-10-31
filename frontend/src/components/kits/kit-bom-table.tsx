import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, Pencil, Trash, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PartInlineSummary } from '@/components/parts/part-inline-summary';
import { KitBOMRowEditor } from '@/components/kits/kit-bom-row-editor';
import type { KitContentRow } from '@/types/kits';
import type {
  PendingCreateRow,
  PendingUpdateDraft,
  UseKitContentsResult,
} from '@/hooks/use-kit-contents';

const NUMBER_FORMATTER = new Intl.NumberFormat();

interface KitBOMTableProps {
  rows: KitContentRow[];
  controls: UseKitContentsResult;
}

export function KitBOMTable({ rows, controls }: KitBOMTableProps) {
  const {
    create,
    edit,
    remove,
    overlays,
    existingPartKeys,
    isArchived,
    isMutationPending,
  } = controls;

  const pendingCreateRow = overlays.pendingCreateRow;
  const pendingUpdates = overlays.pendingUpdates;
  const hasRows = rows.length > 0;
  const disableMutations = isArchived || isMutationPending;

  const renderEditorRow = useCallback(
    (rowId: number, variant: 'create' | 'edit', row?: KitContentRow) => {
      if (variant === 'create') {
        return (
          <tr key="kit-bom-create" className="border-b border-border/70 bg-muted/30">
            <td colSpan={9} className="px-6 py-4 align-top">
              <KitBOMRowEditor
                mode="create"
                draft={create.draft}
                errors={create.errors}
                isSubmitting={create.isSubmitting}
                onSubmit={create.submit}
                onCancel={create.close}
                onPartSelectionChange={create.setPartSelection}
                onRequiredPerUnitChange={create.setRequiredPerUnit}
                onNoteChange={create.setNote}
                existingPartKeys={existingPartKeys}
                disabled={disableMutations}
              />
            </td>
          </tr>
        );
      }

      if (!row || !edit.draft) {
        return null;
      }

      return (
        <tr key={`kit-bom-edit-${rowId}`} className="border-b border-border/70 bg-muted/20">
          <td colSpan={9} className="px-6 py-4 align-top">
            <KitBOMRowEditor
              mode="edit"
              draft={edit.draft}
              errors={edit.errors}
              isSubmitting={edit.isSubmitting}
              onSubmit={edit.submit}
              onCancel={edit.cancel}
              onRequiredPerUnitChange={edit.setRequiredPerUnit}
              onNoteChange={edit.setNote}
              existingPartKeys={existingPartKeys}
              disabled={disableMutations}
              rowId={row.id}
              partSummary={{
                key: row.part.key,
                description: row.part.description,
                manufacturerCode: row.part.manufacturerCode,
              }}
            />
          </td>
        </tr>
      );
    },
    [
      create.close,
      create.draft,
      create.errors,
      create.isSubmitting,
      create.setNote,
      create.setPartSelection,
      create.setRequiredPerUnit,
      create.submit,
      disableMutations,
      edit.cancel,
      edit.draft,
      edit.errors,
      edit.isSubmitting,
      edit.setNote,
      edit.setRequiredPerUnit,
      edit.submit,
      existingPartKeys,
    ]
  );

  return (
    <>
      <div className="overflow-x-auto" data-testid="kits.detail.table">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-56 px-4 py-2 text-left">Part</th>
              <th className="w-28 px-4 py-2 text-right">Required</th>
              <th className="w-28 px-4 py-2 text-right">Total</th>
              <th className="w-28 px-4 py-2 text-right">In stock</th>
              <th className="w-28 px-4 py-2 text-right">Reserved</th>
              <th className="w-28 px-4 py-2 text-right">Available</th>
              <th className="w-28 px-4 py-2 text-right">Shortfall</th>
              <th className="px-4 py-2 text-left">Note</th>
              <th className="w-32 px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {create.isOpen ? renderEditorRow(-1, 'create') : null}

            {pendingCreateRow ? <PendingCreateOverlayRow pending={pendingCreateRow} /> : null}

            {rows.map((row) => {
              const pendingUpdate = pendingUpdates.get(row.id);
              const isEditing = edit.editingRowId === row.id;

              if (isEditing) {
                return renderEditorRow(row.id, 'edit', row);
              }

              return (
                <KitBOMDisplayRow
                  key={row.id}
                  row={row}
                  pendingUpdate={pendingUpdate}
                  disableActions={disableMutations}
                  readOnly={isArchived}
                  onEdit={edit.start}
                  onDelete={remove.open}
                />
              );
            })}

            {!hasRows && !create.isOpen && !pendingCreateRow ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-6 py-10 text-center text-sm text-muted-foreground"
                  data-testid="kits.detail.table.empty"
                >
                  No parts in this kit yet. Add contents to see availability and reservation breakdowns.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Confirmation dialog removed - deletion now happens immediately with undo button in toast */}
    </>
  );
}

interface KitBOMDisplayRowProps {
  row: KitContentRow;
  pendingUpdate?: PendingUpdateDraft;
  disableActions: boolean;
  readOnly: boolean;
  onEdit: (row: KitContentRow) => void;
  onDelete: (row: KitContentRow) => void;
}

function KitBOMDisplayRow({
  row,
  pendingUpdate,
  disableActions,
  readOnly,
  onEdit,
  onDelete,
}: KitBOMDisplayRowProps) {
  const shortfallDetected = row.shortfall > 0;
  const showReservations = row.activeReservations.length > 0;

  const rowClassName = cn(
    'border-b border-border/70 last:border-b-0',
    shortfallDetected ? 'bg-destructive/5' : 'bg-background'
  );

  const disableRowActions = disableActions || Boolean(pendingUpdate);
  const readOnlyTooltip = readOnly ? 'Archived kits cannot be edited' : undefined;

  const handleEdit = () => {
    if (!disableRowActions) {
      onEdit(row);
    }
  };

  const handleDelete = () => {
    if (!disableRowActions) {
      onDelete(row);
    }
  };

  return (
    <tr
      data-testid={`kits.detail.table.row.${row.id}`}
      className={rowClassName}
    >
      <td className="px-4 py-3 align-top">
        <PartInlineSummary
          partKey={row.part.key}
          description={row.part.description}
          manufacturerCode={row.part.manufacturerCode}
          testId={`kits.detail.table.row.${row.id}.part`}
          link={true}
        />
      </td>
      <td className="px-4 py-3 text-right align-top">
        {formatNumber(row.requiredPerUnit)}
      </td>
      <td className="px-4 py-3 text-right align-top">
        {formatNumber(row.totalRequired)}
      </td>
      <td className="px-4 py-3 text-right align-top">
        {formatNumber(row.inStock)}
      </td>
      <td className="px-4 py-3 text-right align-top">
        <div className="flex items-center justify-end gap-2">
          <span>{formatNumber(row.reserved)}</span>
          {showReservations ? (
            <ReservationTooltip
              reservations={row.activeReservations}
              testId={`kits.detail.table.row.${row.id}.reservations`}
            />
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3 text-right align-top">
        <span className={row.available > 0 ? 'text-emerald-600' : 'text-muted-foreground'}>
          {formatNumber(row.available)}
        </span>
      </td>
      <td className="px-4 py-3 text-right align-top">
        <span className={row.shortfall > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'}>
          {formatNumber(row.shortfall)}
        </span>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="line-clamp-2 overflow-hidden" title={row.note || ''}>
          {row.note || '—'}
        </div>
      </td>
      <td className="px-4 py-3 text-right align-top">
        <div className="flex items-center justify-end gap-2">
          {pendingUpdate ? (
            <Badge variant="outline" className="inline-flex items-center gap-1 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </Badge>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleEdit}
            disabled={disableRowActions}
            aria-disabled={readOnly ? 'true' : undefined}
            title={readOnlyTooltip}
            data-testid={`kits.detail.table.row.${row.id}.edit`}
          >
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Edit</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleDelete}
            disabled={disableRowActions}
            aria-disabled={readOnly ? 'true' : undefined}
            title={readOnlyTooltip}
            data-testid={`kits.detail.table.row.${row.id}.delete`}
          >
            <Trash className="h-4 w-4" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      </td>
    </tr>
  );
}

interface PendingCreateOverlayRowProps {
  pending: PendingCreateRow;
}

function PendingCreateOverlayRow({ pending }: PendingCreateOverlayRowProps) {
  return (
    <tr className="border-b border-border/70 bg-muted/20">
      <td colSpan={9} className="px-6 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {pending.partLabel ?? `Part ${pending.partKey}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Saving new kit content (required per kit: {pending.requiredPerUnit})
              </p>
            </div>
          </div>
          {pending.note ? (
            <p className="text-xs text-muted-foreground/90 max-w-md">
              {pending.note}
            </p>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

// Confirmation dialog removed - deletion now happens immediately with undo button in toast

function formatNumber(value: number): string {
  return NUMBER_FORMATTER.format(value);
}

interface ReservationTooltipProps {
  reservations: KitContentRow['activeReservations'];
  testId: string;
}

function ReservationTooltip({ reservations, testId }: ReservationTooltipProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const summaryLabel = useMemo(
    () =>
      reservations.length === 1
        ? '1 active reservation'
        : `${reservations.length} active reservations`,
    [reservations.length],
  );

  const cancelScheduledClose = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelScheduledClose();
    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 120);
  }, [cancelScheduledClose]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) {
      return;
    }
    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const padding = 12;

    let top = triggerRect.bottom + 8;
    let left = triggerRect.right - tooltipRect.width;

    const maxLeft = window.innerWidth - tooltipRect.width - padding;
    left = Math.min(Math.max(padding, left), Math.max(padding, maxLeft));

    if (top + tooltipRect.height > window.innerHeight - padding) {
      top = Math.max(
        padding,
        triggerRect.top - tooltipRect.height - 8,
      );
    }

    setPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePosition();
    const handleScroll = () => updatePosition();
    const handleResize = () => updatePosition();

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, updatePosition]);

  useLayoutEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handleOpen = () => {
    cancelScheduledClose();
    setIsOpen(true);
  };

  const handleClose = () => {
    scheduleClose();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div
      ref={triggerRef}
      className="flex items-center"
      onMouseEnter={handleOpen}
      onMouseLeave={handleClose}
      onFocus={handleOpen}
      onBlur={handleClose}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      data-testid={testId}
      aria-label={summaryLabel}
    >
      <Users className="h-4 w-4 text-muted-foreground" />
      {isOpen && createPortal(
        <div
          ref={tooltipRef}
          className="z-50 w-72 rounded-md border border-border bg-background p-3 shadow-lg"
          style={{ position: 'fixed', top: position.top, left: position.left }}
          role="tooltip"
          data-testid={`${testId}.tooltip`}
        >
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span>{summaryLabel}</span>
          </div>
          <ul className="space-y-2 text-xs text-muted-foreground">
            {reservations.map((reservation) => (
              <li key={reservation.kitId} className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{reservation.kitName}</p>
                  <p className="text-muted-foreground/80">{reservation.status}</p>
                </div>
                <div className="text-right">
                  <p>
                    Reserved:{' '}
                    <span className="font-medium text-foreground">
                      {formatNumber(reservation.reservedQuantity)}
                    </span>
                  </p>
                  <p>Build target: {formatNumber(reservation.buildTarget)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
}
