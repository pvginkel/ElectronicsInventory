import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { BoxSelector } from '@/components/parts/box-selector';
import { Badge } from '@/components/ui/badge';
import { useFormState } from '@/hooks/use-form-state';
import { useFormInstrumentation } from '@/hooks/use-form-instrumentation';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { useGetBoxes } from '@/lib/api/generated/hooks';
import type {
  ShoppingListConceptLine,
  ShoppingListLineReceiveAllocationInput,
} from '@/types/shopping-lists';
import { cn } from '@/lib/utils';
import { makeUniqueToken } from '@/lib/utils/random';

interface AllocationDraft {
  id: string;
  boxNo?: number;
  locNo: string;
  quantity: string;
}

interface AllocationValidationResult {
  isValid: boolean;
  summary?: string;
  rows: Record<string, {
    box?: string;
    loc?: string;
    quantity?: string;
  }>;
  totalQuantity: number;
}

interface UpdateStockFormValues extends Record<string, unknown> {
  receiveNow: string;
  allocations: AllocationDraft[];
}

type SubmitMode = 'save' | 'saveAndNext';

interface UpdateStockDialogProps {
  open: boolean;
  line: ShoppingListConceptLine | null;
  hasNextLine: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    mode: SubmitMode;
    receiveQuantity: number;
    allocations: ShoppingListLineReceiveAllocationInput[];
  }) => Promise<void>;
  onMarkDone: (payload: { mismatchReason: string | null }) => Promise<void>;
  isReceiving: boolean;
  isCompleting: boolean;
  restoreFocusElement?: HTMLElement | null;
}

function createAllocationDraft(): AllocationDraft {
  return {
    id: makeUniqueToken(16),
    boxNo: undefined,
    locNo: '',
    quantity: '',
  };
}

function parseInteger(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
}

function validateReceiveQuantity(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed.length) {
    return 'Enter quantity to receive';
  }
  const parsed = parseInteger(trimmed);
  if (parsed == null) {
    return 'Receive now must be an integer';
  }
  if (parsed < 1) {
    return 'Receive now must be at least 1';
  }
  return undefined;
}

function validateAllocations(
  allocations: AllocationDraft[],
  receiveQuantity: number | null
): AllocationValidationResult {
  const rows: AllocationValidationResult['rows'] = {};
  const summaryMessages: string[] = [];
  let totalQuantity = 0;
  let hasError = false;
  const seenKeys = new Set<string>();

  if (!allocations.length) {
    summaryMessages.push('Add at least one allocation row');
    return {
      isValid: false,
      summary: summaryMessages.join(' '),
      rows,
      totalQuantity: 0,
    };
  }

  for (const allocation of allocations) {
    const errors: { box?: string; loc?: string; quantity?: string } = {};
    const hasAnyInput = allocation.boxNo != null || allocation.locNo.trim().length > 0 || allocation.quantity.trim().length > 0;

    if (!hasAnyInput) {
      errors.box = 'Enter box, location, and quantity or remove row';
      errors.loc = 'Enter box, location, and quantity or remove row';
      errors.quantity = 'Enter box, location, and quantity or remove row';
      hasError = true;
    } else {
      if (allocation.boxNo == null) {
        errors.box = 'Select a box';
        hasError = true;
      }

      const locParsed = parseInteger(allocation.locNo);
      if (locParsed == null || locParsed < 1) {
        errors.loc = 'Location must be positive integer';
        hasError = true;
      }

      const qtyParsed = parseInteger(allocation.quantity);
      if (qtyParsed == null || qtyParsed < 1) {
        errors.quantity = 'Quantity must be positive integer';
        hasError = true;
      } else {
        totalQuantity += qtyParsed;
      }

      if (allocation.boxNo != null && locParsed != null && locParsed >= 1) {
        const key = `${allocation.boxNo}:${locParsed}`;
        if (seenKeys.has(key)) {
          errors.box = errors.box ?? 'Duplicate location';
          errors.loc = errors.loc ?? 'Duplicate location';
          hasError = true;
        } else {
          seenKeys.add(key);
        }
      }
    }

    if (errors.box || errors.loc || errors.quantity) {
      rows[allocation.id] = errors;
    }
  }

  if (receiveQuantity != null) {
    if (totalQuantity !== receiveQuantity) {
      hasError = true;
      const difference = receiveQuantity - totalQuantity;
      if (difference > 0) {
        summaryMessages.push(`Allocate ${difference} more to match Receive now`);
      } else if (difference < 0) {
        summaryMessages.push(`Remove ${Math.abs(difference)} from allocations to match Receive now`);
      }
    }
  }

  const summary = summaryMessages.length ? summaryMessages.join(' ') : undefined;

  return {
    isValid: !hasError,
    summary,
    rows,
    totalQuantity,
  };
}

function allocationToPayload(allocation: AllocationDraft): ShoppingListLineReceiveAllocationInput {
  return {
    boxNo: allocation.boxNo as number,
    locNo: Number(allocation.locNo),
    quantity: Number(allocation.quantity),
  };
}

export function UpdateStockDialog({
  open,
  line,
  hasNextLine,
  onClose,
  onSubmit,
  onMarkDone,
  isReceiving,
  isCompleting,
  restoreFocusElement,
}: UpdateStockDialogProps) {
  const submitModeRef = useRef<SubmitMode>('save');
  const [showAllocationErrors, setShowAllocationErrors] = useState(false);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [mismatchReason, setMismatchReason] = useState('');
  const [mismatchError, setMismatchError] = useState<string | null>(null);

  const boxesQuery = useGetBoxes();

  const form = useFormState<UpdateStockFormValues>({
    initialValues: {
      receiveNow: '',
      allocations: [],
    },
    validationRules: {
      receiveNow: (value: unknown) => {
        const raw = typeof value === 'string' ? value : String(value ?? '');
        return validateReceiveQuantity(raw);
      },
    },
    onSubmit: async (values) => {
      if (!line) {
        return;
      }

      const receiveQuantity = parseInteger(values.receiveNow);
      const allocationValidation = validateAllocations(values.allocations, receiveQuantity);

      if (receiveQuantity == null || !allocationValidation.isValid) {
        setShowAllocationErrors(true);
        formInstrumentation.trackValidationErrors({
          receiveNow: validateReceiveQuantity(values.receiveNow),
          allocations: allocationValidation.summary ?? 'Allocation validation failed',
        });
        return;
      }

      formInstrumentation.trackSubmit({
        listId: line.shoppingListId,
        lineId: line.id,
        mode: submitModeRef.current,
        receiveQuantity,
        allocationCount: values.allocations.length,
      });

      try {
        await onSubmit({
          mode: submitModeRef.current,
          receiveQuantity,
          allocations: values.allocations.map(allocationToPayload),
        });
        formInstrumentation.trackSuccess({
          listId: line.shoppingListId,
          lineId: line.id,
          mode: submitModeRef.current,
          receiveQuantity,
          allocationCount: values.allocations.length,
        });
        setShowAllocationErrors(false);
      } catch (error) {
        formInstrumentation.trackError({
          listId: line.shoppingListId,
          lineId: line.id,
          mode: submitModeRef.current,
          receiveQuantity,
          allocationCount: values.allocations.length,
        });
        throw error;
      }
    },
  });

  const allocationValidation = useMemo(() => {
    const receiveQuantity = parseInteger(form.values.receiveNow);
    return validateAllocations(form.values.allocations, receiveQuantity);
  }, [form.values.allocations, form.values.receiveNow]);

  const receiveError = validateReceiveQuantity(form.values.receiveNow);
  const canSubmit = !receiveError && allocationValidation.isValid && !isReceiving;

  useEffect(() => {
    if (!open) {
      return;
    }
    if (line) {
      form.setValue('receiveNow', '');
      form.setFieldTouched('receiveNow', false);
      form.setValue('allocations', [createAllocationDraft()]);
      setShowAllocationErrors(false);
      submitModeRef.current = 'save';
    } else {
      form.setValue('receiveNow', '');
      form.setValue('allocations', []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, line?.id]);

  useEffect(() => {
    if (open) {
      return;
    }
    if (restoreFocusElement) {
      requestAnimationFrame(() => {
        restoreFocusElement.focus();
      });
    }
  }, [open, restoreFocusElement]);

  useEffect(() => {
    if (!open) {
      setCompletionDialogOpen(false);
      setMismatchReason('');
      setMismatchError(null);
    }
  }, [open]);

  const formInstrumentation = useFormInstrumentation({
    formId: line ? `ShoppingListLineReceive:line:${line.id}` : 'ShoppingListLineReceive:line:none',
    isOpen: open,
    snapshotFields: () => ({
      listId: line?.shoppingListId ?? null,
      lineId: line?.id ?? null,
      mode: submitModeRef.current,
      receiveQuantity: parseInteger(form.values.receiveNow) ?? 0,
      allocationCount: form.values.allocations.length,
    }),
  });

  const completionInstrumentation = useFormInstrumentation({
    formId: line ? `ShoppingListLineComplete:line:${line.id}` : 'ShoppingListLineComplete:line:none',
    isOpen: completionDialogOpen,
    snapshotFields: () => ({
      listId: line?.shoppingListId ?? null,
      lineId: line?.id ?? null,
      mismatchReasonLength: mismatchReason.trim().length,
    }),
  });

  useEffect(() => {
    if (open && line) {
      formInstrumentation.trackOpen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, line?.id]);

  useListLoadingInstrumentation({
    scope: 'shoppingLists.receive.locations',
    isLoading: boxesQuery.isLoading,
    isFetching: boxesQuery.isFetching,
    error: boxesQuery.error,
    getReadyMetadata: () => ({
      listId: line?.shoppingListId ?? null,
      lineId: line?.id ?? null,
      allocationCount: form.values.allocations.length,
    }),
    getErrorMetadata: (error: unknown) => ({
      message: error instanceof Error ? error.message : String(error),
    }),
  });

  const handleClose = () => {
    form.reset();
    setShowAllocationErrors(false);
    setCompletionDialogOpen(false);
    setMismatchReason('');
    setMismatchError(null);
    onClose();
  };

  const handleAllocationChange = (allocationId: string, updates: Partial<AllocationDraft>) => {
    form.setValue(
      'allocations',
      form.values.allocations.map((allocation) =>
        allocation.id === allocationId ? { ...allocation, ...updates } : allocation
      )
    );
  };

  const handleAddAllocation = () => {
    form.setValue('allocations', [...form.values.allocations, createAllocationDraft()]);
  };

  const handleRemoveAllocation = (allocationId: string) => {
    const next = form.values.allocations.filter(allocation => allocation.id !== allocationId);
    form.setValue('allocations', next.length ? next : [createAllocationDraft()]);
  };

  const handleSubmitMode = (mode: SubmitMode) => {
    submitModeRef.current = mode;
  };

  const handleMarkDone = async () => {
    if (!line) {
      return;
    }
    if (line.received === line.ordered) {
      completionInstrumentation.trackSubmit({
        listId: line.shoppingListId,
        lineId: line.id,
        mismatchReasonLength: 0,
      });
      try {
        await onMarkDone({ mismatchReason: null });
        completionInstrumentation.trackSuccess({
          listId: line.shoppingListId,
          lineId: line.id,
          mismatchReasonLength: 0,
        });
      } catch (error) {
        completionInstrumentation.trackError({
          listId: line.shoppingListId,
          lineId: line.id,
          mismatchReasonLength: 0,
        });
        throw error;
      }
      return;
    }
    setMismatchReason('');
    setMismatchError(null);
    setCompletionDialogOpen(true);
  };

  const handleConfirmMismatch = async () => {
    if (!line) {
      return;
    }
    const trimmed = mismatchReason.trim();
    if (!trimmed.length) {
      const error = 'Provide a reason for receiving less than ordered';
      setMismatchError(error);
      completionInstrumentation.trackValidationError('mismatchReason', error, {
        listId: line.shoppingListId,
        lineId: line.id,
        mismatchReasonLength: trimmed.length,
      });
      return;
    }

    completionInstrumentation.trackSubmit({
      listId: line.shoppingListId,
      lineId: line.id,
      mismatchReasonLength: trimmed.length,
    });

    try {
      await onMarkDone({ mismatchReason: trimmed });
      completionInstrumentation.trackSuccess({
        listId: line.shoppingListId,
        lineId: line.id,
        mismatchReasonLength: trimmed.length,
      });
      setCompletionDialogOpen(false);
      setMismatchReason('');
      setMismatchError(null);
    } catch (error) {
      completionInstrumentation.trackError({
        listId: line.shoppingListId,
        lineId: line.id,
        mismatchReasonLength: trimmed.length,
      });
      throw error;
    }
  };

  const allocations = form.values.allocations;
  const showAllocationSummaryError = showAllocationErrors && !!allocationValidation.summary;

  const existingLocations = line?.partLocations ?? [];
  const receiveDisabled = !line || isReceiving;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
        <DialogContent className="sm:max-w-3xl" data-testid="shopping-lists.ready.update-stock.dialog">
          <Form onSubmit={form.handleSubmit} data-testid="shopping-lists.ready.update-stock.form">
            <DialogHeader>
              <DialogTitle>{line ? `Update stock for ${line.part.description}` : 'Update stock'}</DialogTitle>
              <DialogDescription>
                Receive ordered quantities, allocate them to storage, or mark the line complete.
              </DialogDescription>
            </DialogHeader>

            {line && (
              <div className="space-y-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
                  <div>
                    <p className="font-medium text-foreground">{line.part.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Key {line.part.key}
                      {line.part.manufacturerCode ? ` · MPN ${line.part.manufacturerCode}` : ''}
                    </p>
                    {line.effectiveSeller?.name && (
                      <p className="text-xs text-muted-foreground">
                        Seller {line.effectiveSeller.name}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-right">
                      <p className="text-xs uppercase text-muted-foreground">Ordered</p>
                      <p className="font-semibold text-foreground">{line.ordered}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase text-muted-foreground">Received</p>
                      <p className={cn('font-semibold', line.hasQuantityMismatch ? 'text-amber-600' : 'text-foreground')}>
                        {line.received}
                      </p>
                    </div>
                    <Badge variant={line.status === 'ordered' ? 'secondary' : 'outline'}>
                      {line.status === 'ordered' ? 'Ordered' : 'Received'}
                    </Badge>
                  </div>
                </div>

                <div className="rounded-md border border-dashed border-border px-4 py-3">
                  <p className="text-sm font-medium text-foreground mb-2">Existing locations</p>
                  {existingLocations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No stock on hand for this part.</p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto">
                      <table className="w-full border-separate border-spacing-y-1 text-sm">
                        <thead>
                          <tr className="text-xs uppercase text-muted-foreground">
                            <th className="text-left">Box</th>
                            <th className="text-left">Location</th>
                            <th className="text-right">Quantity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {existingLocations.map((location) => (
                            <tr key={location.id} className="rounded bg-muted/40">
                              <td className="px-2 py-1">#{location.boxNo}</td>
                              <td className="px-2 py-1">{location.locNo}</td>
                              <td className="px-2 py-1 text-right font-medium">{location.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <FormField>
                <FormLabel required>Receive now</FormLabel>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={form.values.receiveNow}
                  onChange={(event) => form.setValue('receiveNow', event.target.value)}
                  onBlur={() => form.setFieldTouched('receiveNow')}
                  error={form.touched.receiveNow ? form.errors.receiveNow : undefined}
                  disabled={receiveDisabled}
                  data-testid="shopping-lists.ready.update-stock.field.receive"
                />
              </FormField>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Allocate to locations</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAddAllocation}
                    disabled={receiveDisabled}
                    data-testid="shopping-lists.ready.update-stock.add-allocation"
                  >
                    Add location
                  </Button>
                </div>

                <div className="space-y-2">
                  {allocations.map((allocation, index) => {
                    const allocationTestId = `shopping-lists.ready.update-stock.allocation.${index}`;
                    const rowError = allocationValidation.rows[allocation.id] ?? {};
                    const showRowErrors = showAllocationErrors && allocationValidation.rows[allocation.id] != null;
                    return (
                      <div
                        key={allocation.id}
                        className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3 md:flex-row md:items-end"
                        data-testid={allocationTestId}
                      >
                        <div className="md:w-40">
                          <FormLabel className="text-xs text-muted-foreground">Box</FormLabel>
                          <BoxSelector
                            value={allocation.boxNo}
                            onChange={(value) => handleAllocationChange(allocation.id, { boxNo: value })}
                            error={showRowErrors ? rowError.box : undefined}
                            disabled={receiveDisabled}
                            testId={`${allocationTestId}.box`}
                          />
                        </div>
                        <div className="md:w-32">
                          <FormLabel className="text-xs text-muted-foreground">Location</FormLabel>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={allocation.locNo}
                            onChange={(event) => handleAllocationChange(allocation.id, { locNo: event.target.value })}
                            error={showRowErrors ? rowError.loc : undefined}
                            disabled={receiveDisabled}
                            data-testid={`${allocationTestId}.location`}
                          />
                        </div>
                        <div className="md:w-32">
                          <FormLabel className="text-xs text-muted-foreground">Quantity</FormLabel>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={allocation.quantity}
                            onChange={(event) => handleAllocationChange(allocation.id, { quantity: event.target.value })}
                            error={showRowErrors ? rowError.quantity : undefined}
                            disabled={receiveDisabled}
                            data-testid={`${allocationTestId}.quantity`}
                          />
                        </div>
                        <div className="flex items-center gap-2 md:flex-1 md:justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveAllocation(allocation.id)}
                            disabled={receiveDisabled}
                            data-testid={`${allocationTestId}.remove`}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {showAllocationSummaryError && (
                  <p className="text-sm text-destructive" data-testid="shopping-lists.ready.update-stock.allocations.error">
                    {allocationValidation.summary}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="mt-4 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  preventValidation
                  onClick={handleClose}
                  disabled={isReceiving || isCompleting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={isReceiving}
                  disabled={!canSubmit}
                  onClick={() => handleSubmitMode('save')}
                  data-testid="shopping-lists.ready.update-stock.submit"
                >
                  Save
                </Button>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={isReceiving}
                  disabled={!canSubmit || !hasNextLine}
                  onClick={() => handleSubmitMode('saveAndNext')}
                  data-testid="shopping-lists.ready.update-stock.submit-next"
                >
                  Save &amp; next
                </Button>
              </div>
              <Button
                type="button"
                variant="primary"
                className="bg-emerald-600 hover:bg-emerald-600/90"
                loading={isCompleting}
                disabled={!line || isCompleting}
                onClick={handleMarkDone}
                data-testid="shopping-lists.ready.update-stock.mark-done"
              >
                Mark Done
              </Button>
            </DialogFooter>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={completionDialogOpen} onOpenChange={setCompletionDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="shopping-lists.ready.update-stock.mismatch-dialog">
          <DialogHeader>
            <DialogTitle>Mark line complete</DialogTitle>
            <DialogDescription>
              Received quantity does not match ordered. Explain why before marking done.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <FormField>
              <FormLabel required>Mismatch reason</FormLabel>
              <textarea
                value={mismatchReason}
                onChange={(event) => {
                  setMismatchReason(event.target.value);
                  if (mismatchError) {
                    setMismatchError(null);
                  }
                }}
                className={cn(
                  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                  'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50 min-h-[96px]'
                )}
                data-testid="shopping-lists.ready.update-stock.mismatch-reason"
              />
              {mismatchError && (
                <p className="text-sm text-destructive" data-testid="shopping-lists.ready.update-stock.mismatch-error">
                  {mismatchError}
                </p>
              )}
            </FormField>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCompletionDialogOpen(false)}
              disabled={isCompleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              loading={isCompleting}
              onClick={handleConfirmMismatch}
              data-testid="shopping-lists.ready.update-stock.mismatch-confirm"
            >
              Mark Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
