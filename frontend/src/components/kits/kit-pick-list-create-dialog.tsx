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
} from '@/lib/api/generated/hooks';
import type { KitDetail } from '@/types/kits';

const FORM_ID = 'KitPickList:create';

interface KitPickListFormValues extends Record<string, string> {
  requestedUnits: string;
}

interface KitPickListSnapshot extends Record<string, number | string | null | undefined> {
  kitId: number;
  requestedUnits: number | null;
  pickListId?: number;
  status?: string;
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

  const mutation = usePostKitsPickListsByKitId({
    mutationKey: ['kits.detail.pickLists.create', kit.id],
  });

  const form = useFormState<KitPickListFormValues>({
    initialValues: { requestedUnits: '' },
    validationRules: {
      requestedUnits: validateRequestedUnits,
    },
    onSubmit: async (values) => {
      if (mutation.isPending) {
        return;
      }

      const requestedUnits = parseRequestedUnits(values.requestedUnits);
      const snapshot: KitPickListSnapshot = {
        kitId: kit.id,
        requestedUnits,
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
        const response = await mutation.mutateAsync({
          path: { kit_id: kit.id },
          body: { requested_units: requestedUnits },
        });
        const successSnapshot: KitPickListSnapshot = {
          kitId: kit.id,
          requestedUnits,
          pickListId: response.id,
          status: response.status,
        };
        successSnapshotRef.current = successSnapshot;
        instrumentationRef.current?.trackSuccess(successSnapshot);
        showSuccess(`Created pick list #${response.id}`);
        await onSuccess(response);
        pendingSnapshotRef.current = null;
        setRequestedUnitsError(undefined);
        handleDialogOpenChange(false);
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
    },
  });

  const instrumentationSnapshot = useCallback(
    (): KitPickListSnapshot => ({
      kitId: kit.id,
      requestedUnits: parseRequestedUnits(form.values.requestedUnits),
    }),
    [form.values.requestedUnits, kit.id],
  );

  const instrumentation = useFormInstrumentation<KitPickListSnapshot>({
    formId: FORM_ID,
    isOpen: open,
    snapshotFields: instrumentationSnapshot,
  });

  instrumentationRef.current = instrumentation;

  useEffect(() => {
    if (!open) {
      return;
    }
    pendingSnapshotRef.current = null;
    successSnapshotRef.current = null;
    setRequestedUnitsError(undefined);
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
    await form.handleSubmit(event);
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
      form.reset();
    } else {
      onOpenChange(true);
    }
  };

  const isSubmitDisabled = mutation.isPending;

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
                (form.touched.requestedUnits ? form.errors.requestedUnits : undefined)
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
              onClick={() => handleDialogOpenChange(false)}
              data-testid="kits.detail.pick-list.create.cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={mutation.isPending}
              disabled={isSubmitDisabled}
              data-testid="kits.detail.pick-list.create.submit"
            >
              Create Pick List
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

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
