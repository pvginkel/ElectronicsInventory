import { useCallback, useMemo } from 'react';
import { AlertTriangle, Loader2, Pencil, Trash, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
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

  // Sort rows by part description for consistent display order
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.part.description.localeCompare(b.part.description)),
    [rows]
  );

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
                coverUrl: row.part.coverUrl,
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
              <th className="w-80 px-4 py-2 text-left">Part</th>
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

            {sortedRows.map((row) => {
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
    shortfallDetected ? 'bg-destructive/5' : 'inherit'
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
          coverUrl={row.part.coverUrl}
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
            <Tooltip
              testId={`kits.detail.table.row.${row.id}.reservations`}
              content={
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span>
                      {row.activeReservations.length === 1
                        ? '1 active reservation'
                        : `${row.activeReservations.length} active reservations`}
                    </span>
                  </div>
                  <ul className="space-y-2 text-xs">
                    {row.activeReservations.map((reservation) => (
                      <li key={reservation.kitId} className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{reservation.kitName}</p>
                          <p className="text-muted-foreground/80">{reservation.status}</p>
                        </div>
                        <div className="text-right">
                          <p>
                            Reserved:{' '}
                            <span className="font-medium">
                              {formatNumber(reservation.reservedQuantity)}
                            </span>
                          </p>
                          <p>Build target: {formatNumber(reservation.buildTarget)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              }
            >
              <div
                className="flex items-center"
                role="button"
                tabIndex={0}
                aria-label={
                  row.activeReservations.length === 1
                    ? '1 active reservation'
                    : `${row.activeReservations.length} active reservations`
                }
              >
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
            </Tooltip>
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
