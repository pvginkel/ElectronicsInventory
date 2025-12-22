import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { BoxSelector } from '@/components/parts/box-selector';
import { Badge } from '@/components/ui/badge';
import { MetricDisplay } from '@/components/ui';
import { Trash2 } from 'lucide-react';
import { useFormState } from '@/hooks/use-form-state';
import { useFormInstrumentation } from '@/hooks/use-form-instrumentation';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { useGetBoxes } from '@/lib/api/generated/hooks';
import { CoverImageDisplay } from '@/components/documents/cover-image-display';
import type {
  ShoppingListConceptLine,
  ShoppingListLinePartLocation,
  ShoppingListLineReceiveAllocationInput,
} from '@/types/shopping-lists';
import { cn } from '@/lib/utils';
import { makeUniqueToken } from '@/lib/utils/random';

interface ExistingAllocationDraft {
  id: string;
  type: 'existing';
  sourceLocationId: number;
  boxNo: number;
  locNo: number;
  existingQuantity: number;
  receive: string;
}

interface NewAllocationDraft {
  id: string;
  type: 'new';
  boxNo?: number;
  locNo: string;
  receive: string;
}

type AllocationDraft = ExistingAllocationDraft | NewAllocationDraft;

interface AllocationValidationResult {
  isValid: boolean;
  summary?: string;
  rows: Record<string, {
    box?: string;
    location?: string;
    receive?: string;
  }>;
  totalReceive: number;
}

interface UpdateStockFormValues extends Record<string, unknown> {
  allocations: AllocationDraft[];
}

type SubmitMode = 'save' | 'complete' | 'complete-retry';

interface UpdateStockDialogProps {
  open: boolean;
  line: ShoppingListConceptLine | null;
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

function createNewAllocationDraft(): NewAllocationDraft {
  return {
    id: makeUniqueToken(16),
    type: 'new',
    boxNo: undefined,
    locNo: '',
    receive: '',
  };
}

function createExistingAllocationDraft(location: ShoppingListLinePartLocation): ExistingAllocationDraft {
  return {
    id: makeUniqueToken(16),
    type: 'existing',
    sourceLocationId: location.id,
    boxNo: location.boxNo,
    locNo: location.locNo,
    existingQuantity: location.quantity,
    receive: '',
  };
}

function buildInitialAllocations(line: ShoppingListConceptLine | null): AllocationDraft[] {
  if (!line) {
    return [];
  }

  const existingDrafts = line.partLocations.map(createExistingAllocationDraft);
  return [...existingDrafts, createNewAllocationDraft()];
}

function parseInteger(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
}

function validateAllocations(allocations: AllocationDraft[]): AllocationValidationResult {
  const rows: AllocationValidationResult['rows'] = {};
  const summaryMessages = new Set<string>();
  const existingKeys = new Set<string>();
  const newKeys = new Set<string>();
  let hasError = false;
  let totalReceive = 0;
  let positiveEntries = 0;

  for (const allocation of allocations) {
    if (allocation.type === 'existing') {
      existingKeys.add(`${allocation.boxNo}:${allocation.locNo}`);
    }
  }

  for (const allocation of allocations) {
    if (allocation.type === 'existing') {
      const trimmedReceive = allocation.receive.trim();
      if (!trimmedReceive.length) {
        continue;
      }

      const parsedReceive = parseInteger(trimmedReceive);
      if (parsedReceive == null || parsedReceive < 1) {
        hasError = true;
        rows[allocation.id] = {
          receive: 'Receive must be a positive integer',
        };
        summaryMessages.add('Fix invalid Receive entries');
        continue;
      }

      totalReceive += parsedReceive;
      positiveEntries += 1;
      continue;
    }

    const hasAnyInput =
      allocation.boxNo != null ||
      allocation.locNo.trim().length > 0 ||
      allocation.receive.trim().length > 0;
    if (!hasAnyInput) {
      continue;
    }

    const errors: AllocationValidationResult['rows'][string] = {};
    let rowHasError = false;

    if (allocation.boxNo == null) {
      errors.box = 'Select a box';
      rowHasError = true;
    }

    const locTrimmed = allocation.locNo.trim();
    const parsedLoc = parseInteger(locTrimmed);
    if (parsedLoc == null || parsedLoc < 1) {
      errors.location = 'Location must be a positive integer';
      rowHasError = true;
    }

    const receiveTrimmed = allocation.receive.trim();
    const parsedReceive = parseInteger(receiveTrimmed);
    if (parsedReceive == null || parsedReceive < 1) {
      errors.receive = 'Receive must be a positive integer';
      rowHasError = true;
    }

    let locationKey: string | null = null;
    if (!rowHasError) {
      locationKey = `${allocation.boxNo}:${parsedLoc}`;
      if (existingKeys.has(locationKey) || newKeys.has(locationKey)) {
        errors.box = errors.box ?? 'Duplicate box/location';
        errors.location = errors.location ?? 'Duplicate box/location';
        rowHasError = true;
        summaryMessages.add('Receive entries must use unique box/location combinations');
      }
    }

    if (rowHasError) {
      rows[allocation.id] = errors;
      hasError = true;
      summaryMessages.add('Complete the highlighted Receive entries');
      continue;
    }

    newKeys.add(locationKey!);
    totalReceive += parsedReceive!;
    positiveEntries += 1;
  }

  if (positiveEntries === 0) {
    hasError = true;
    summaryMessages.add('Enter at least one Receive entry');
  }

  const summary = summaryMessages.size ? Array.from(summaryMessages).join(' ') : undefined;

  return {
    isValid: !hasError,
    summary,
    rows,
    totalReceive,
  };
}

function allocationToPayload(allocation: AllocationDraft): ShoppingListLineReceiveAllocationInput | null {
  if (allocation.type === 'existing') {
    const quantity = parseInteger(allocation.receive);
    if (quantity == null || quantity < 1) {
      return null;
    }
    return {
      boxNo: allocation.boxNo,
      locNo: allocation.locNo,
      quantity,
    };
  }

  const quantity = parseInteger(allocation.receive);
  const locNo = parseInteger(allocation.locNo);
  if (allocation.boxNo == null || quantity == null || quantity < 1 || locNo == null || locNo < 1) {
    return null;
  }

  return {
    boxNo: allocation.boxNo,
    locNo,
    quantity,
  };
}

function countValidAllocations(allocations: AllocationDraft[]): number {
  return allocations.reduce<number>((count, allocation) => {
    return allocationToPayload(allocation) ? count + 1 : count;
  }, 0);
}

export function UpdateStockDialog({
  open,
  line,
  onClose,
  onSubmit,
  onMarkDone,
  isReceiving,
  isCompleting,
  restoreFocusElement,
}: UpdateStockDialogProps) {
  const submitModeRef = useRef<SubmitMode>('save');
  const receiveSucceededRef = useRef(false);
  const [showAllocationErrors, setShowAllocationErrors] = useState(false);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [mismatchReason, setMismatchReason] = useState('');
  const [mismatchError, setMismatchError] = useState<string | null>(null);

  const boxesQuery = useGetBoxes();
  const boxLookup = useMemo(() => {
    const boxes = boxesQuery.data ?? [];
    return new Map(boxes.map((box) => [box.box_no, box]));
  }, [boxesQuery.data]);

  const form = useFormState<UpdateStockFormValues>({
    initialValues: {
      allocations: [],
    },
    onSubmit: async (values) => {
      if (!line) {
        return;
      }

      const allocationValidation = validateAllocations(values.allocations);
      const receiveQuantity = allocationValidation.totalReceive;

      if (!allocationValidation.isValid || receiveQuantity < 1) {
        setShowAllocationErrors(true);
        formInstrumentation.trackValidationErrors({
          allocations: allocationValidation.summary ?? 'Allocation validation failed',
        });
        return;
      }

      const allocationsPayload = values.allocations
        .map(allocationToPayload)
        .filter((allocation): allocation is ShoppingListLineReceiveAllocationInput => allocation != null);

      formInstrumentation.trackSubmit({
        listId: line.shoppingListId,
        lineId: line.id,
        mode: submitModeRef.current,
        receiveQuantity,
        allocationCount: allocationsPayload.length,
      });

      try {
        await onSubmit({
          mode: submitModeRef.current,
          receiveQuantity,
          allocations: allocationsPayload,
        });
        formInstrumentation.trackSuccess({
          listId: line.shoppingListId,
          lineId: line.id,
          mode: submitModeRef.current,
          receiveQuantity,
          allocationCount: allocationsPayload.length,
        });
        setShowAllocationErrors(false);
      } catch (error) {
        formInstrumentation.trackError({
          listId: line.shoppingListId,
          lineId: line.id,
          mode: submitModeRef.current,
          receiveQuantity,
          allocationCount: allocationsPayload.length,
        });
        throw error;
      }
    },
  });

  const allocationValidation = useMemo(
    () => validateAllocations(form.values.allocations),
    [form.values.allocations],
  );

  const canSubmit = !!line && allocationValidation.isValid && allocationValidation.totalReceive > 0 && !isReceiving;

  useEffect(() => {
    if (!open) {
      return;
    }
    if (line) {
      form.setValue('allocations', buildInitialAllocations(line));
      setShowAllocationErrors(false);
      submitModeRef.current = 'save';
      receiveSucceededRef.current = false;
    } else {
      form.setValue('allocations', []);
      setShowAllocationErrors(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, line]);

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
    snapshotFields: () => {
      const snapshotValidation = validateAllocations(form.values.allocations);
      const allocationCount = countValidAllocations(form.values.allocations);

      return {
        listId: line?.shoppingListId ?? null,
        lineId: line?.id ?? null,
        mode: submitModeRef.current,
        receiveQuantity: snapshotValidation.totalReceive,
        allocationCount,
      };
    },
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

  useListLoadingInstrumentation({
    scope: 'shoppingLists.receive.locations',
    isLoading: boxesQuery.isLoading,
    isFetching: boxesQuery.isFetching,
    error: boxesQuery.error,
    getReadyMetadata: () => {
      const allocationCount = countValidAllocations(form.values.allocations);
      return {
        listId: line?.shoppingListId ?? null,
        lineId: line?.id ?? null,
        allocationCount,
        receiveQuantity: allocationValidation.totalReceive,
      };
    },
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
    // Reset receive succeeded flag when user modifies allocations
    receiveSucceededRef.current = false;
  };

  const handleAddAllocation = () => {
    form.setValue('allocations', [...form.values.allocations, createNewAllocationDraft()]);
  };

  const handleRemoveAllocation = (allocationId: string) => {
    const next = form.values.allocations.filter((allocation) => allocation.id !== allocationId);
    const hasNewRow = next.some((allocation) => allocation.type === 'new');
    form.setValue('allocations', hasNewRow ? next : [...next, createNewAllocationDraft()]);
  };

  const handleSubmitMode = (mode: SubmitMode) => {
    submitModeRef.current = mode;
  };

  const handleMarkDone = async () => {
    if (!line) {
      return;
    }

    // Calculate validation once at the start for use in all paths
    const currentAllocationValidation = validateAllocations(form.values.allocations);
    const receiveQuantity = currentAllocationValidation.totalReceive;
    const allocationCount = countValidAllocations(form.values.allocations);

    // Check if user has entered any allocation data at all (even partial/invalid)
    const hasAnyAllocationInput = form.values.allocations.some(allocation => {
      if (allocation.type === 'existing') {
        return allocation.receive.trim().length > 0;
      }
      return (
        allocation.boxNo != null ||
        allocation.locNo.trim().length > 0 ||
        allocation.receive.trim().length > 0
      );
    });

    // If allocations haven't been saved yet (or were modified since last save), save them first
    if (!receiveSucceededRef.current && hasAnyAllocationInput) {
      // User has entered allocation data - validate it before saving
      if (!currentAllocationValidation.isValid) {
        setShowAllocationErrors(true);
        formInstrumentation.trackValidationErrors({
          allocations: currentAllocationValidation.summary ?? 'Allocation validation failed',
        });
        return;
      }

      const allocationsPayload = form.values.allocations
        .map(allocationToPayload)
        .filter((allocation): allocation is ShoppingListLineReceiveAllocationInput => allocation != null);

      // Track form submit with mode 'complete' (first attempt)
      submitModeRef.current = 'complete';
      formInstrumentation.trackSubmit({
        listId: line.shoppingListId,
        lineId: line.id,
        mode: 'complete',
        receiveQuantity,
        allocationCount,
      });

      try {
        await onSubmit({
          mode: 'complete',
          receiveQuantity,
          allocations: allocationsPayload,
        });
        // Mark that receive succeeded so we don't re-submit if completion fails
        receiveSucceededRef.current = true;
      } catch (error) {
        formInstrumentation.trackError({
          listId: line.shoppingListId,
          lineId: line.id,
          mode: 'complete',
          receiveQuantity,
          allocationCount,
        });
        throw error;
      }
    } else if (receiveSucceededRef.current) {
      // Retry scenario: receive already succeeded, only track completion
      submitModeRef.current = 'complete-retry';
      formInstrumentation.trackSubmit({
        listId: line.shoppingListId,
        lineId: line.id,
        mode: 'complete-retry',
        receiveQuantity,
        allocationCount,
      });
    } else {
      // No allocations entered - user is completing without receiving any stock.
      // Skip receive API call and go directly to mismatch dialog (since received != ordered).
      submitModeRef.current = 'complete';
      formInstrumentation.trackSubmit({
        listId: line.shoppingListId,
        lineId: line.id,
        mode: 'complete',
        receiveQuantity: 0,
        allocationCount: 0,
      });
    }

    // Now proceed to mark the line as done.
    // Compare total received (existing + just saved) against ordered to determine if mismatch dialog is needed.
    const totalReceivedAfterSave = line.received + receiveQuantity;
    if (totalReceivedAfterSave === line.ordered) {
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
        // Track form success now that both operations completed
        formInstrumentation.trackSuccess({
          listId: line.shoppingListId,
          lineId: line.id,
          mode: submitModeRef.current,
          receiveQuantity,
          allocationCount,
        });
      } catch (error) {
        completionInstrumentation.trackError({
          listId: line.shoppingListId,
          lineId: line.id,
          mismatchReasonLength: 0,
        });
        // Don't track form error here - keep dialog open for retry
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
      // Track form success now that both operations completed
      const currentValidation = validateAllocations(form.values.allocations);
      formInstrumentation.trackSuccess({
        listId: line.shoppingListId,
        lineId: line.id,
        mode: submitModeRef.current,
        receiveQuantity: currentValidation.totalReceive,
        allocationCount: countValidAllocations(form.values.allocations),
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
      // Don't track form error here - keep dialog open for retry
      throw error;
    }
  };

  const allocations = form.values.allocations;
  const showAllocationSummaryError = showAllocationErrors && !!allocationValidation.summary;

  const hasExistingAllocations = allocations.some((allocation) => allocation.type === 'existing');
  const receiveDisabled = !line || isReceiving;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => !next && handleClose()}
        className="max-w-[95vw] sm:max-w-3xl"
      >
        <DialogContent data-testid="shopping-lists.ready.update-stock.dialog">
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
                  <div className="flex items-start gap-3">
                    <CoverImageDisplay
                      partId={line.part.key}
                      size="small"
                    />
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
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <MetricDisplay
                      label="Ordered"
                      value={line.ordered}
                      testId="shopping-lists.ready.update-stock.line.metric.ordered"
                    />
                    <MetricDisplay
                      label="Received"
                      value={line.received}
                      valueColor={line.hasQuantityMismatch ? 'warning' : 'default'}
                      testId="shopping-lists.ready.update-stock.line.metric.received"
                    />
                    <Badge variant={line.status === 'ordered' ? 'secondary' : 'outline'}>
                      {line.status === 'ordered' ? 'Ordered' : 'Received'}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-sm font-medium text-foreground">Receive allocations</FormLabel>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handleAddAllocation}
                      disabled={receiveDisabled}
                      data-testid="shopping-lists.ready.update-stock.add-allocation"
                    >
                      Add location
                    </Button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full table-auto border-separate border-spacing-y-1 text-sm">
                      <thead>
                        <tr className="text-xs uppercase text-muted-foreground">
                          <th className="px-3 py-2 text-left">Box</th>
                          <th className="px-3 py-2 text-left">Location</th>
                          <th className="px-3 py-2 text-right">Quantity</th>
                          <th className="px-3 py-2 text-right">Receive</th>
                          <th className="px-2 py-2">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {allocations.map((allocation) => {
                          const allocationTestId = `shopping-lists.ready.update-stock.row.${allocation.id}`;
                          const rowError = allocationValidation.rows[allocation.id] ?? {};
                          const showRowErrors = showAllocationErrors && allocationValidation.rows[allocation.id] != null;

                          if (allocation.type === 'existing') {
                            const boxMeta = boxLookup.get(allocation.boxNo);
                            return (
                              <tr
                                key={allocation.id}
                                className="bg-muted/40"
                                data-testid={allocationTestId}
                                data-allocation-type="existing"
                              >
                                <td className="px-3 py-2">
                                  <div className="space-y-1">
                                    <span className="font-medium pr-1" data-testid={`${allocationTestId}.box`}>
                                      #{allocation.boxNo}
                                    </span>
                                    {boxMeta?.description ? (
                                      <span className="text-muted-foreground" data-testid={`${allocationTestId}.box-name`}>
                                        {boxMeta.description}
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <span data-testid={`${allocationTestId}.location`}>{allocation.locNo}</span>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <span className="font-medium" data-testid={`${allocationTestId}.quantity`}>
                                    {allocation.existingQuantity}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex justify-end">
                                    <Input
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={allocation.receive}
                                      onChange={(event) => handleAllocationChange(allocation.id, { receive: event.target.value })}
                                      error={showRowErrors ? rowError.receive : undefined}
                                      disabled={receiveDisabled}
                                      data-testid={`${allocationTestId}.receive`}
                                      className="w-full max-w-[140px]"
                                    />
                                  </div>
                                </td>
                                <td className="px-2 py-2" />
                              </tr>
                            );
                          }

                          return (
                            <tr
                              key={allocation.id}
                              className="bg-muted/20"
                              data-testid={allocationTestId}
                              data-allocation-type="new"
                            >
                              <td className="px-3 py-2">
                                <div className="max-w-full">
                                  <BoxSelector
                                    value={allocation.boxNo}
                                    onChange={(value) => handleAllocationChange(allocation.id, { boxNo: value })}
                                    error={showRowErrors ? rowError.box : undefined}
                                    disabled={receiveDisabled}
                                    testId={`${allocationTestId}.box`}
                                  />
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={allocation.locNo}
                                  onChange={(event) => handleAllocationChange(allocation.id, { locNo: event.target.value })}
                                  error={showRowErrors ? rowError.location : undefined}
                                  disabled={receiveDisabled}
                                  data-testid={`${allocationTestId}.location`}
                                  className="w-full"
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className="text-muted-foreground">—</span>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex justify-end">
                                  <Input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={allocation.receive}
                                    onChange={(event) => handleAllocationChange(allocation.id, { receive: event.target.value })}
                                    error={showRowErrors ? rowError.receive : undefined}
                                    disabled={receiveDisabled}
                                    data-testid={`${allocationTestId}.receive`}
                                    className="w-full max-w-[140px]"
                                  />
                                </div>
                              </td>
                              <td className="px-2 py-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-9 w-9 p-0"
                                  onClick={() => handleRemoveAllocation(allocation.id)}
                                  disabled={receiveDisabled}
                                  data-testid={`${allocationTestId}.remove`}
                                  aria-label="Remove allocation"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {!hasExistingAllocations && (
                    <p className="px-3 text-xs text-muted-foreground">No stock on hand for this part.</p>
                  )}

                  {showAllocationSummaryError && (
                    <p className="text-sm text-destructive" data-testid="shopping-lists.ready.update-stock.allocations.error">
                      {allocationValidation.summary}
                    </p>
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="mt-4 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                preventValidation
                onClick={handleClose}
                disabled={isReceiving || isCompleting}
              >
                Cancel
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  variant="secondary"
                  loading={isReceiving}
                  disabled={!canSubmit}
                  onClick={() => handleSubmitMode('save')}
                  data-testid="shopping-lists.ready.update-stock.submit"
                >
                  Save Item
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="bg-emerald-600 hover:bg-emerald-600/90"
                  loading={isCompleting}
                  disabled={!line || isCompleting}
                  onClick={handleMarkDone}
                  data-testid="shopping-lists.ready.update-stock.mark-done"
                >
                  Complete Item
                </Button>
              </div>
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
                  'ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-hidden',
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
              Mark as Completed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
