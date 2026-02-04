import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  type DialogContentProps,
} from '@/components/ui/dialog';
import { Form, FormField, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFormState } from '@/hooks/use-form-state';
import { useFormInstrumentation, type UseFormInstrumentationResult } from '@/hooks/use-form-instrumentation';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/api/api-error';
import {
  usePostKitsPickListsByKitId,
  type KitPickListDetailSchema_b247181,
  type KitPickListCreateSchema_b247181_ShortfallActionSchema,
} from '@/lib/api/generated/hooks';
import type { KitDetail, ShortfallPartRow, ShortfallAction } from '@/types/kits';
import { calculateShortfallParts } from '@/types/kits';

const FORM_ID = 'KitPickList:create';

type DialogStep = 'units' | 'shortfall';

interface KitPickListFormValues extends Record<string, string> {
  requestedUnits: string;
}

interface KitPickListSnapshot extends Record<string, number | string | boolean | null | undefined> {
  kitId: number;
  requestedUnits: number | null;
  pickListId?: number;
  status?: string;
  hasShortfall?: boolean;
  shortfallCount?: number;
}

interface KitPickListCreateDialogProps {
  open: boolean;
  kit: KitDetail;
  onOpenChange: (open: boolean) => void;
  onSuccess: (response: KitPickListDetailSchema_b247181) => Promise<void> | void;
}

export function KitPickListCreateDialog({
  open,
  kit,
  onOpenChange,
  onSuccess,
}: KitPickListCreateDialogProps) {
  const { showSuccess, showException } = useToast();
  const instrumentationRef =
    useRef<UseFormInstrumentationResult<KitPickListSnapshot> | null>(null);
  const pendingSnapshotRef = useRef<KitPickListSnapshot | null>(null);
  const successSnapshotRef = useRef<KitPickListSnapshot | null>(null);

  const [requestedUnitsError, setRequestedUnitsError] = useState<string | undefined>(undefined);
  const [currentStep, setCurrentStep] = useState<DialogStep>('units');
  const [shortfallParts, setShortfallParts] = useState<ShortfallPartRow[]>([]);

  const mutation = usePostKitsPickListsByKitId({
    mutationKey: ['kits.detail.pickLists.create', kit.id],
  });

  const form = useFormState<KitPickListFormValues>({
    initialValues: { requestedUnits: '' },
    validationRules: {
      requestedUnits: validateRequestedUnits,
    },
    onSubmit: async () => {
      // Form submission is handled by handleCreatePickList
    },
  });

  // Define instrumentationSnapshot before it's used in callbacks
  const instrumentationSnapshot = useCallback(
    (): KitPickListSnapshot => ({
      kitId: kit.id,
      requestedUnits: parseRequestedUnits(form.values.requestedUnits),
      hasShortfall: shortfallParts.length > 0,
      shortfallCount: shortfallParts.length,
    }),
    [form.values.requestedUnits, kit.id, shortfallParts.length],
  );

  // Build the shortfall_handling payload from user selections
  const buildShortfallHandlingPayload = useCallback((): Record<string, KitPickListCreateSchema_b247181_ShortfallActionSchema> | null => {
    if (shortfallParts.length === 0) {
      return null;
    }

    const payload: Record<string, KitPickListCreateSchema_b247181_ShortfallActionSchema> = {};
    for (const part of shortfallParts) {
      if (part.selectedAction) {
        payload[part.partKey] = { action: part.selectedAction };
      }
    }

    return Object.keys(payload).length > 0 ? payload : null;
  }, [shortfallParts]);

  // Handle the actual pick list creation
  const handleCreatePickList = useCallback(async () => {
    if (mutation.isPending) {
      return;
    }

    const requestedUnits = parseRequestedUnits(form.values.requestedUnits);
    const hasShortfall = shortfallParts.length > 0;
    const shortfallCount = shortfallParts.length;

    const snapshot: KitPickListSnapshot = {
      kitId: kit.id,
      requestedUnits,
      hasShortfall,
      shortfallCount,
    };

    pendingSnapshotRef.current = snapshot;
    successSnapshotRef.current = null;
    instrumentationRef.current?.trackSubmit(snapshot);

    if (requestedUnits === null) {
      const message = 'Requested units must be at least 1';
      setRequestedUnitsError(message);
      instrumentationRef.current?.trackValidationError('requestedUnits', message, snapshot);
      pendingSnapshotRef.current = null;
      return;
    }

    try {
      const shortfallHandling = buildShortfallHandlingPayload();
      const response = await mutation.mutateAsync({
        path: { kit_id: kit.id },
        body: {
          requested_units: requestedUnits,
          shortfall_handling: shortfallHandling,
        },
      });
      const successSnapshot: KitPickListSnapshot = {
        kitId: kit.id,
        requestedUnits,
        pickListId: response.id,
        status: response.status,
        hasShortfall,
        shortfallCount,
      };
      successSnapshotRef.current = successSnapshot;
      instrumentationRef.current?.trackSuccess(successSnapshot);
      showSuccess(`Created pick list #${response.id}`);
      await onSuccess(response);
      pendingSnapshotRef.current = null;
      setRequestedUnitsError(undefined);
      // Close dialog via onOpenChange - don't call handleDialogOpenChange to avoid circular dependency
      onOpenChange(false);
    } catch (error) {
      const fieldMessage = extractRequestedUnitsError(error);
      if (fieldMessage) {
        setRequestedUnitsError(fieldMessage);
        instrumentationRef.current?.trackValidationError(
          'requestedUnits',
          fieldMessage,
          snapshot,
        );
      } else {
        instrumentationRef.current?.trackError(snapshot);
        showException('Failed to create pick list', error);
      }
    }
  }, [mutation, form.values.requestedUnits, shortfallParts, kit.id, buildShortfallHandlingPayload, showSuccess, onSuccess, showException, onOpenChange]);

  // Handle "Continue" button click from units step
  const handleContinue = useCallback(async () => {
    const validationMessage = validateRequestedUnits(form.values.requestedUnits);
    setRequestedUnitsError(validationMessage);

    if (validationMessage) {
      const snapshot = instrumentationSnapshot();
      instrumentationRef.current?.trackValidationError('requestedUnits', validationMessage, snapshot);
      return;
    }

    const requestedUnits = parseRequestedUnits(form.values.requestedUnits);
    if (requestedUnits === null) {
      return;
    }

    // Calculate shortfall parts
    const shortfall = calculateShortfallParts(kit.contents, requestedUnits);

    if (shortfall.length === 0) {
      // No shortfall - create pick list directly
      await handleCreatePickList();
    } else {
      // Has shortfall - transition to shortfall step
      setShortfallParts(shortfall);
      setCurrentStep('shortfall');
    }
  }, [form.values.requestedUnits, kit.contents, handleCreatePickList, instrumentationSnapshot]);

  // Handle action selection for a shortfall part
  const handleActionSelect = useCallback((partKey: string, action: ShortfallAction) => {
    setShortfallParts(prev => prev.map(part =>
      part.partKey === partKey ? { ...part, selectedAction: action } : part
    ));
  }, []);

  // Check if all shortfall parts have an action selected
  const allActionsSelected = shortfallParts.length > 0 && shortfallParts.every(part => part.selectedAction !== null);

  // Handle back button from shortfall step
  const handleBack = useCallback(() => {
    setCurrentStep('units');
    // Keep shortfall parts state so user can return to step 2 without recalculating
  }, []);

  const instrumentation = useFormInstrumentation<KitPickListSnapshot>({
    formId: FORM_ID,
    isOpen: open,
    snapshotFields: instrumentationSnapshot,
  });

  // Update ref when instrumentation changes
  useEffect(() => {
    instrumentationRef.current = instrumentation
  }, [instrumentation])

  useEffect(() => {
    if (!open) {
      return;
    }
    // Reset all state when dialog opens
    pendingSnapshotRef.current = null;
    successSnapshotRef.current = null;
    setRequestedUnitsError(undefined);
    setCurrentStep('units');
    setShortfallParts([]);
    form.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useListLoadingInstrumentation({
    scope: 'kits.detail.pickLists.create',
    isLoading: mutation.isPending,
    error: mutation.error,
    getReadyMetadata: () =>
      successSnapshotRef.current ?? pendingSnapshotRef.current ?? { kitId: kit.id },
    getErrorMetadata: (error) => {
      const snapshot =
        pendingSnapshotRef.current ?? instrumentationSnapshot();
      if (!snapshot) {
        return undefined;
      }
      return {
        ...snapshot,
        message: error instanceof Error ? error.message : String(error),
      };
    },
    getAbortedMetadata: () => {
      if (!pendingSnapshotRef.current) {
        return { kitId: kit.id, status: 'aborted' as const };
      }
      return { ...pendingSnapshotRef.current, status: 'aborted' as const };
    },
  });

  const requestedUnitsField = form.getFieldProps('requestedUnits');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (currentStep === 'units') {
      await handleContinue();
    } else {
      await handleCreatePickList();
    }
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (mutation.isPending) {
        return;
      }
      onOpenChange(false);
      pendingSnapshotRef.current = null;
      successSnapshotRef.current = null;
      setRequestedUnitsError(undefined);
      setCurrentStep('units');
      setShortfallParts([]);
      form.reset();
    } else {
      onOpenChange(true);
    }
  };

  const isSubmitDisabled = currentStep === 'shortfall' ? !allActionsSelected || mutation.isPending : mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={handleDialogOpenChange}
      contentProps={
        {
          'data-testid': 'kits.detail.pick-list.create.dialog',
        } as DialogContentProps
      }
    >
      <DialogContent>
        <Form onSubmit={handleSubmit} data-testid="kits.detail.pick-list.create.form">
          {currentStep === 'units' ? (
            <UnitsStep
              requestedUnitsField={requestedUnitsField}
              requestedUnitsError={requestedUnitsError}
              setRequestedUnitsError={setRequestedUnitsError}
              formTouched={form.touched.requestedUnits}
              formErrors={form.errors.requestedUnits}
              isPending={mutation.isPending}
              onCancel={() => handleDialogOpenChange(false)}
            />
          ) : (
            <ShortfallStep
              shortfallParts={shortfallParts}
              onActionSelect={handleActionSelect}
              onBack={handleBack}
              onCancel={() => handleDialogOpenChange(false)}
              isPending={mutation.isPending}
              isSubmitDisabled={isSubmitDisabled}
            />
          )}
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// --- Units Step Component ---

interface UnitsStepProps {
  requestedUnitsField: {
    value: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur: () => void;
  };
  requestedUnitsError: string | undefined;
  setRequestedUnitsError: (error: string | undefined) => void;
  formTouched: boolean | undefined;
  formErrors: string | undefined;
  isPending: boolean;
  onCancel: () => void;
}

function UnitsStep({
  requestedUnitsField,
  requestedUnitsError,
  setRequestedUnitsError,
  formTouched,
  formErrors,
  isPending,
  onCancel,
}: UnitsStepProps) {
  return (
    <div data-testid="kits.detail.pick-list.create.step.units">
      <DialogHeader>
        <DialogTitle>Create Pick List</DialogTitle>
        <DialogDescription>
          Enter the number of kit builds to fulfill. A pick list line is created for each
          component.
        </DialogDescription>
      </DialogHeader>

      <FormField>
        <FormLabel htmlFor="kits.detail.pick-list.create.field.requested-units" required>
          Requested units
        </FormLabel>
        <Input
          id="kits.detail.pick-list.create.field.requested-units"
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min={1}
          step={1}
          value={requestedUnitsField.value}
          onChange={(event) => {
            if (requestedUnitsError) {
              setRequestedUnitsError(undefined);
            }
            requestedUnitsField.onChange(event);
          }}
          onBlur={requestedUnitsField.onBlur}
          error={
            requestedUnitsError ??
            (formTouched ? formErrors : undefined)
          }
          data-testid="kits.detail.pick-list.create.field.requested-units"
          autoFocus
        />
      </FormField>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          preventValidation
          onClick={onCancel}
          data-testid="kits.detail.pick-list.create.cancel"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={isPending}
          disabled={isPending}
          data-testid="kits.detail.pick-list.create.continue"
        >
          Continue
        </Button>
      </DialogFooter>
    </div>
  );
}

// --- Shortfall Step Component ---

interface ShortfallStepProps {
  shortfallParts: ShortfallPartRow[];
  onActionSelect: (partKey: string, action: ShortfallAction) => void;
  onBack: () => void;
  onCancel: () => void;
  isPending: boolean;
  isSubmitDisabled: boolean;
}

function ShortfallStep({
  shortfallParts,
  onActionSelect,
  onBack,
  onCancel,
  isPending,
  isSubmitDisabled,
}: ShortfallStepProps) {
  return (
    <div data-testid="kits.detail.pick-list.create.step.shortfall">
      <DialogHeader>
        <DialogTitle>Handle Part Shortfalls</DialogTitle>
        <DialogDescription>
          Some parts have insufficient stock. Choose how to handle each shortfall.
        </DialogDescription>
      </DialogHeader>

      <div className="mt-4 max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <th className="pb-2 font-medium">Part</th>
              <th className="pb-2 font-medium text-right">Required</th>
              <th className="pb-2 font-medium text-right">Available</th>
              <th className="pb-2 font-medium text-right">Shortfall</th>
              <th className="pb-2 font-medium text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shortfallParts.map((part) => (
              <ShortfallPartRowComponent
                key={part.partKey}
                part={part}
                onActionSelect={onActionSelect}
              />
            ))}
          </tbody>
        </table>
      </div>

      <DialogFooter className="mt-4">
        <Button
          type="button"
          variant="outline"
          preventValidation
          onClick={onBack}
          disabled={isPending}
          data-testid="kits.detail.pick-list.create.back"
        >
          Back
        </Button>
        <Button
          type="button"
          variant="outline"
          preventValidation
          onClick={onCancel}
          data-testid="kits.detail.pick-list.create.cancel"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={isPending}
          disabled={isSubmitDisabled}
          data-testid="kits.detail.pick-list.create.submit"
        >
          Create Pick List
        </Button>
      </DialogFooter>
    </div>
  );
}

// --- Shortfall Part Row Component ---

interface ShortfallPartRowComponentProps {
  part: ShortfallPartRow;
  onActionSelect: (partKey: string, action: ShortfallAction) => void;
}

function ShortfallPartRowComponent({ part, onActionSelect }: ShortfallPartRowComponentProps) {
  const radioName = `shortfall-action-${part.partKey}`;

  return (
    <tr data-testid={`kits.detail.pick-list.create.shortfall.row.${part.partKey}`}>
      <td className="py-2">
        <div className="font-medium">{part.partKey}</div>
        <div className="text-muted-foreground text-xs truncate max-w-48" title={part.partDescription}>
          {part.partDescription}
        </div>
      </td>
      <td className="py-2 text-right tabular-nums">{part.requiredQuantity.toLocaleString()}</td>
      <td className="py-2 text-right tabular-nums">{part.availableQuantity.toLocaleString()}</td>
      <td className="py-2 text-right tabular-nums text-destructive font-medium">
        {part.shortfallAmount.toLocaleString()}
      </td>
      <td className="py-2">
        <div className="flex justify-center gap-4">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name={radioName}
              value="limit"
              checked={part.selectedAction === 'limit'}
              onChange={() => onActionSelect(part.partKey, 'limit')}
              className="w-4 h-4 text-primary focus:ring-primary border-input"
              data-testid={`kits.detail.pick-list.create.shortfall.row.${part.partKey}.limit`}
            />
            <span className="text-xs">Limit</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name={radioName}
              value="omit"
              checked={part.selectedAction === 'omit'}
              onChange={() => onActionSelect(part.partKey, 'omit')}
              className="w-4 h-4 text-primary focus:ring-primary border-input"
              data-testid={`kits.detail.pick-list.create.shortfall.row.${part.partKey}.omit`}
            />
            <span className="text-xs">Omit</span>
          </label>
        </div>
      </td>
    </tr>
  );
}

// --- Helper Functions ---

function parseRequestedUnits(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function validateRequestedUnits(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Enter the number of kit builds to pick';
  }
  if (!/^\d+$/.test(trimmed)) {
    return 'Requested units must be a whole number';
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 'Requested units must be at least 1';
  }
  if (parsed > 10000) {
    return 'Requested units must be 10,000 or fewer';
  }
  return undefined;
}

function extractRequestedUnitsError(error: unknown): string | undefined {
  if (error instanceof ApiError) {
    const detail = error.details;
    if (Array.isArray(detail)) {
      const fieldDetail = detail.find(
        (item) => item && typeof item === 'object' && item.field === 'requested_units',
      ) as { message?: string } | undefined;
      if (fieldDetail?.message) {
        return fieldDetail.message;
      }
    }
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '').trim();
    if (message) {
      return message;
    }
  }
  return undefined;
}
