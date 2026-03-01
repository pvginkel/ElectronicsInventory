import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  type DialogContentProps,
} from '@/components/primitives/dialog';
import { Form, FormField, FormLabel } from '@/components/primitives/form';
import { Input } from '@/components/primitives/input';
import { Button } from '@/components/primitives/button';
import { Alert } from '@/components/primitives';
import { KitSelector } from '@/components/kits/kit-selector';
import { cn } from '@/lib/utils';
import { useFormState } from '@/hooks/use-form-state';
import { useFormInstrumentation, type UseFormInstrumentationResult } from '@/hooks/use-form-instrumentation';
import { usePostKitsContentsByKitId, useGetPartsKitReservationsByPartKey } from '@/lib/api/generated/hooks';
// eslint-disable-next-line role-gating/gate-usage-enforcement -- Gate is provided by the outer part-details wrapper
import { postKitsContentsByKitIdRole } from '@/lib/api/generated/roles';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/api/api-error';
import { invalidatePartKitMemberships } from '@/hooks/use-part-kit-memberships';

void postKitsContentsByKitIdRole; // keeps TypeScript/ESLint no-unused-vars happy

interface PartSummary {
  id: number | null;
  key: string;
  description: string;
}

interface AddToKitDialogProps {
  open: boolean;
  onClose: () => void;
  part: PartSummary;
}

interface FormValues extends Record<string, unknown> {
  kitId: string;
  requiredPerUnit: string;
  note: string;
}

type KitContentFormSnapshot = {
  partKey: string;
  kitId: number | null;
  requiredPerUnit: number;
};

const NOTE_LIMIT = 500;
const FORM_ID = 'KitContent:addFromPart';

export function AddToKitDialog({ open, onClose, part }: AddToKitDialogProps) {
  const queryClient = useQueryClient();
  const { showSuccess, showException } = useToast();
  const instrumentationRef = useRef<UseFormInstrumentationResult<KitContentFormSnapshot> | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  // Guidepost: The part detail endpoint doesn't return a numeric ID — resolve it via
  // the kit-reservations endpoint which is fetched once when the dialog opens.
  const { data: kitReservationsData } = useGetPartsKitReservationsByPartKey(
    { path: { part_key: part.key } },
    { enabled: open },
  );
  const resolvedPartId = kitReservationsData?.part_id ?? null;

  const createMutation = usePostKitsContentsByKitId({ onSuccess: () => {} });

  const form = useFormState<FormValues>({
    initialValues: {
      kitId: '',
      requiredPerUnit: '1',
      note: '',
    },
    validationRules: {
      kitId: (value) => {
        const trimmed = (value as string).trim();
        return trimmed ? undefined : 'Select a kit';
      },
      requiredPerUnit: (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
          return 'Required per unit must be an integer';
        }
        if (parsed < 1) {
          return 'Required per unit must be at least 1';
        }
        return undefined;
      },
      note: (value) => {
        const raw = (value as string) ?? '';
        if (!raw.trim()) {
          return undefined;
        }
        if (raw.trim().length > NOTE_LIMIT) {
          return `Note must be ${NOTE_LIMIT} characters or fewer`;
        }
        return undefined;
      },
    } as { [K in keyof FormValues]?: (value: unknown) => string | undefined },
    onSubmit: async (values) => {
      const snapshot = snapshotFields();

      try {
        instrumentationRef.current?.trackSubmit(snapshot);

        const parsedKitId = Number.parseInt(values.kitId, 10);
        if (!Number.isFinite(parsedKitId)) {
          throw new Error('Missing target kit');
        }

        // resolvedPartId is loaded from the kit-reservations endpoint when dialog opens
        if (resolvedPartId == null) {
          throw new Error('Part ID not yet resolved — please wait a moment and try again');
        }

        await createMutation.mutateAsync({
          path: { kit_id: parsedKitId },
          body: {
            part_id: resolvedPartId,
            required_per_unit: Number.parseInt(values.requiredPerUnit, 10),
            note: values.note.trim() ? values.note.trim() : null,
          },
        });

        instrumentationRef.current?.trackSuccess({ ...snapshot, kitId: parsedKitId });
        showSuccess('Added part to kit');
        invalidatePartKitMemberships(queryClient, part.key);
        // Invalidate the kit detail so navigating to the kit shows the new BOM entry
        void queryClient.invalidateQueries({
          queryKey: ['getKitsByKitId', { path: { kit_id: parsedKitId } }],
        });
        handleClose();
      } catch (error) {
        instrumentationRef.current?.trackError(snapshot);
        if (error instanceof ApiError && error.status === 409) {
          const message = error.message || 'Part is already in this kit.';
          setConflictError(message);
          instrumentationRef.current?.trackValidationError(
            'kitId',
            'Part already in selected kit (backend)',
            snapshot,
          );
          return;
        }

        showException('Failed to add part to kit', error);
      }
    },
  });

  const snapshotFields = useCallback<() => KitContentFormSnapshot>(
    () => ({
      partKey: part.key,
      kitId: form.values.kitId ? Number.parseInt(form.values.kitId, 10) : null,
      requiredPerUnit: Number.parseInt(form.values.requiredPerUnit, 10) || 1,
    }),
    [form.values.kitId, form.values.requiredPerUnit, part.key],
  );

  const instrumentation = useFormInstrumentation<KitContentFormSnapshot>({
    formId: FORM_ID,
    isOpen: open,
    snapshotFields,
  });

  instrumentationRef.current = instrumentation;

  const isMutating = form.isSubmitting || createMutation.isPending;

  const initializationRef = useRef(false);
  const formApiRef = useRef(form);
  useEffect(() => {
    formApiRef.current = form;
  }, [form]);

  useEffect(() => {
    const formApi = formApiRef.current;

    if (!open) {
      initializationRef.current = false;
      formApi.reset();
      setConflictError(null);
      return;
    }

    if (initializationRef.current) {
      return;
    }

    initializationRef.current = true;
    setConflictError(null);
    formApi.setValue('kitId', '');
    formApi.setValue('requiredPerUnit', '1');
    formApi.setValue('note', '');
  }, [open]);

  const handleClose = () => {
    if (isMutating) {
      return;
    }
    onClose();
    form.reset();
    setConflictError(null);
  };

  const handleKitChange = useCallback(
    (nextKitId: number | undefined) => {
      form.setValue('kitId', nextKitId != null ? String(nextKitId) : '');
      setConflictError(null);
    },
    [form],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    await form.handleSubmit(event);

    if (!instrumentationRef.current) {
      return;
    }

    const errors = Object.entries(form.errors).reduce<Record<string, string | undefined>>(
      (acc, [field, message]) => {
        if (typeof message === 'string' && message.trim().length > 0) {
          acc[field] = message;
        }
        return acc;
      },
      {},
    );

    if (Object.keys(errors).length > 0) {
      const snapshot = snapshotFields();
      instrumentationRef.current.trackValidationErrors(errors, snapshot);
      for (const [field, message] of Object.entries(errors)) {
        if (message) {
          instrumentationRef.current.trackValidationError(field, message, snapshot);
        }
      }
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleClose();
        }
      }}
      contentProps={{ 'data-testid': `${FORM_ID}.dialog` } as DialogContentProps}
    >
      <DialogContent>
        <Form onSubmit={handleSubmit} data-testid="parts.kit.add.form">
          <DialogHeader>
            <DialogTitle>Add to Kit</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {part.description} ({part.key})
            </p>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {conflictError && (
              <Alert variant="error" icon={true} testId="parts.kit.add.conflict">
                {conflictError}{' '}
                <a
                  href="#parts.detail.link.badges"
                  className="underline underline-offset-2"
                >
                  View existing kit memberships
                </a>
              </Alert>
            )}

            <div className="space-y-2">
              <FormLabel htmlFor="parts.kit.add.kit" required>
                Kit
              </FormLabel>
              <FormField>
                <KitSelector
                  value={form.values.kitId ? Number(form.values.kitId) : undefined}
                  onChange={handleKitChange}
                  onTouched={() => form.setFieldTouched('kitId')}
                  error={form.errors.kitId}
                />
              </FormField>
            </div>

            <FormField>
              <FormLabel htmlFor="parts.kit.add.required-per-unit" required>
                Required per unit
              </FormLabel>
              <Input
                id="parts.kit.add.required-per-unit"
                type="number"
                min={1}
                value={form.values.requiredPerUnit}
                onChange={(event) => form.setValue('requiredPerUnit', event.target.value)}
                onBlur={() => form.setFieldTouched('requiredPerUnit')}
                error={form.errors.requiredPerUnit}
                data-testid="parts.kit.add.field.required-per-unit"
              />
            </FormField>

            <FormField>
              <FormLabel htmlFor="parts.kit.add.note">
                Note{' '}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </FormLabel>
              <textarea
                id="parts.kit.add.note"
                placeholder="Add context for collaborators (max 500 characters)"
                maxLength={NOTE_LIMIT}
                className={cn(
                  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                  'ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-hidden',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'min-h-[96px]',
                )}
                value={form.values.note}
                onChange={(event) => form.setValue('note', event.target.value)}
                onBlur={() => form.setFieldTouched('note')}
                data-testid="parts.kit.add.field.note"
              />
              {form.errors.note && (
                <p className="text-sm text-destructive mt-1">{form.errors.note}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {form.values.note.trim().length}/{NOTE_LIMIT} characters
              </p>
            </FormField>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isMutating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isMutating || resolvedPartId == null}
              loading={isMutating}
              data-testid="parts.kit.add.submit"
            >
              Add to Kit
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
