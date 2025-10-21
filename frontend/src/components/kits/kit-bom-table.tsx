import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PartInlineSummary } from '@/components/parts/part-inline-summary';
import type { KitContentRow, KitReservationEntry } from '@/types/kits';

interface KitBOMTableProps {
  rows: KitContentRow[];
}

const NUMBER_FORMATTER = new Intl.NumberFormat();

export function KitBOMTable({ rows }: KitBOMTableProps) {
  const hasRows = rows.length > 0;

  return (
    <div className="overflow-x-auto" data-testid="kits.detail.table">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
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
          </tr>
        </thead>
        <tbody>
          {hasRows ? (
            rows.map((row) => (
              <tr
                key={row.id}
                data-testid={`kits.detail.table.row.${row.id}`}
                className={cn(
                  'border-b border-border/70 last:border-b-0',
                  row.shortfall > 0 ? 'bg-destructive/5' : 'bg-background'
                )}
              >
                <td className="px-4 py-3 align-top">
                  <PartInlineSummary
                    partKey={row.part.key}
                    description={row.part.description}
                    manufacturerCode={row.part.manufacturerCode}
                    testId={`kits.detail.table.row.${row.id}.part`}
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
                    {row.activeReservations.length > 0 ? (
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
                  {row.note ? (
                    <p className="text-xs text-muted-foreground">{row.note}</p>
                  ) : (
                    <span className="text-xs text-muted-foreground/70">—</span>
                  )}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground" data-testid="kits.detail.table.empty">
                No parts in this kit yet. Add contents to see availability and reservation breakdowns.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

interface ReservationTooltipProps {
  reservations: KitReservationEntry[];
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
    <>
      <div
        ref={triggerRef}
        className="group relative inline-flex cursor-pointer"
        tabIndex={0}
        aria-label={summaryLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onMouseEnter={handleOpen}
        onFocus={handleOpen}
        onMouseLeave={handleClose}
        onBlur={handleClose}
        onKeyDown={handleKeyDown}
        data-testid={testId}
      >
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full border border-muted-foreground/50 bg-muted text-xs text-muted-foreground transition group-hover:border-foreground group-hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          role="button"
        >
          <Users className="h-3 w-3" aria-hidden="true" />
        </div>
      </div>

      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={tooltipRef}
              className="pointer-events-auto z-[1000] mt-2 w-72 rounded-md border border-border bg-background p-3 text-sm shadow-lg"
              data-testid={`${testId}.tooltip`}
              style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
              }}
              role="dialog"
              onMouseEnter={cancelScheduledClose}
              onMouseLeave={handleClose}
            >
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                {summaryLabel}
              </p>
              <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {reservations.map((reservation) => (
                  <li key={reservation.kitId} className="rounded border border-border/60 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{reservation.kitName}</span>
                      <span className="text-xs capitalize text-muted-foreground">
                        {reservation.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Reserved {formatNumber(reservation.reservedQuantity)} • Build target{' '}
                      {formatNumber(reservation.buildTarget)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Required per kit {formatNumber(reservation.requiredPerUnit)}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground/80">
                      <AlertTriangle className="h-3 w-3 text-amber-500" aria-hidden="true" />
                      Updated {formatDate(reservation.updatedAt)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function formatNumber(value: number): string {
  return NUMBER_FORMATTER.format(value);
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return 'unknown';
  }
  return parsed.toLocaleString();
}
