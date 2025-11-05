import { useCallback, useEffect, useRef, type FormEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  type DialogContentProps,
} from '@/components/ui/dialog';
import { Form, FormField, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFormState } from '@/hooks/use-form-state';
import { useFormInstrumentation, type UseFormInstrumentationResult } from '@/hooks/use-form-instrumentation';
import { useToast } from '@/hooks/use-toast';
import { useKitCreate } from '@/hooks/use-kit-create';
import type { KitResponseSchema_b98797e } from '@/lib/api/generated/hooks';

const NAME_LIMIT = 120;
const DESCRIPTION_LIMIT = 280;
const FORM_ID = 'KitOverview:create';

interface KitCreateFormValues extends Record<string, string> {
  name: string;
  description: string;
  buildTarget: string;
}

interface KitCreateSnapshot extends Record<string, number | string | null | undefined> {
  kitId?: number;
  kitName: string;
  buildTarget: number;
  status?: string;
  description?: string | null;
}

interface KitCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (kit: KitResponseSchema_b98797e) => void;
}

function normalizeWhitespace(value: string): string {
  return value.trim();
}

function resolveBuildTarget(raw: string): number {
  const trimmed = normalizeWhitespace(String(raw ?? ''));
  if (!trimmed) {
    return 1;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return parsed < 0 ? 0 : parsed;
}

function collectValidationErrors(values: KitCreateFormValues) {
  const trimmedName = normalizeWhitespace(values.name);
  const trimmedDescription = normalizeWhitespace(values.description);
  const trimmedBuildTarget = normalizeWhitespace(values.buildTarget);
  const parsedBuildTarget = trimmedBuildTarget ? Number.parseInt(trimmedBuildTarget, 10) : 1;

  return {
    name: !trimmedName
      ? 'Name is required'
      : trimmedName.length > NAME_LIMIT
        ? `Name must be ${NAME_LIMIT} characters or fewer`
        : undefined,
    description:
      trimmedDescription.length > DESCRIPTION_LIMIT
        ? `Description must be ${DESCRIPTION_LIMIT} characters or fewer`
        : undefined,
    buildTarget:
      trimmedBuildTarget && (!Number.isFinite(parsedBuildTarget) || parsedBuildTarget < 0)
        ? 'Build target must be 0 or greater'
        : undefined,
  } as Record<string, string | undefined>;
}

function toSnapshot(values: KitCreateFormValues, kitId?: number, status?: string): KitCreateSnapshot {
  const trimmedName = normalizeWhitespace(values.name);
  const trimmedDescription = normalizeWhitespace(values.description);
  const resolvedBuildTarget = resolveBuildTarget(values.buildTarget);
  return {
    kitId,
    status,
    kitName: trimmedName,
    buildTarget: resolvedBuildTarget,
    description: trimmedDescription || null,
  };
}

export function KitCreateDialog({ open, onOpenChange, onSuccess }: KitCreateDialogProps) {
  const { showSuccess, showException } = useToast();
  const instrumentationRef = useRef<UseFormInstrumentationResult<KitCreateSnapshot> | null>(null);
  const { createKit, isPending, reset: resetMutation } = useKitCreate();

  const form = useFormState<KitCreateFormValues>({
    initialValues: { name: '', description: '', buildTarget: '1' },
    validationRules: {
      name: (value) => {
        const trimmed = normalizeWhitespace(String(value ?? ''));
        if (!trimmed) {
          return 'Name is required';
        }
        if (trimmed.length > NAME_LIMIT) {
          return `Name must be ${NAME_LIMIT} characters or fewer`;
        }
        return undefined;
      },
      description: (value) => {
        const trimmed = normalizeWhitespace(String(value ?? ''));
        if (trimmed.length > DESCRIPTION_LIMIT) {
          return `Description must be ${DESCRIPTION_LIMIT} characters or fewer`;
        }
        return undefined;
      },
      buildTarget: (value) => {
        const trimmed = normalizeWhitespace(String(value ?? ''));
        if (!trimmed) {
          return undefined;
        }
        const parsed = Number.parseInt(trimmed, 10);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return 'Build target must be 0 or greater';
        }
        return undefined;
      },
    },
    onSubmit: async (values) => {
      if (isPending) {
        return;
      }

      const trimmedName = normalizeWhitespace(values.name);
      const trimmedDescription = normalizeWhitespace(values.description);
      const resolvedBuildTarget = resolveBuildTarget(values.buildTarget);

      const snapshot = toSnapshot(values);
      instrumentationRef.current?.trackSubmit(snapshot);

      try {
        const response = await createKit({
          name: trimmedName,
          description: trimmedDescription ? trimmedDescription : null,
          buildTarget: resolvedBuildTarget,
        });

        const successSnapshot = toSnapshot(values, response.id, response.status ?? undefined);
        instrumentationRef.current?.trackSuccess(successSnapshot);
        showSuccess(`Created kit "${response.name}"`);
        onSuccess(response);
        handleDialogOpenChange(false);
      } catch (error) {
        instrumentationRef.current?.trackError(snapshot);
        showException('Failed to create kit', error);
      }
    },
  });

  const instrumentationSnapshot = useCallback(
    () => toSnapshot(form.values),
    [form.values],
  );

  const instrumentation = useFormInstrumentation<KitCreateSnapshot>({
    formId: FORM_ID,
    isOpen: open,
    snapshotFields: instrumentationSnapshot,
  });

  instrumentationRef.current = instrumentation;

  useEffect(() => {
    if (!open) {
      return;
    }
    resetMutation();
    form.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleValidationTracking = useCallback(() => {
    const validationErrors = collectValidationErrors(form.values);
    const errors = Object.entries(validationErrors).reduce<Record<string, string | undefined>>((acc, [field, message]) => {
      if (typeof message === 'string' && message.trim().length > 0) {
        acc[field] = message;
      }
      return acc;
    }, {});

    if (Object.keys(errors).length === 0) {
      return;
    }

    const snapshot = instrumentationSnapshot();
    instrumentationRef.current?.trackValidationErrors(errors, snapshot);
  }, [form.values, instrumentationSnapshot]);

  const handleSubmit = useCallback(async () => {
    const syntheticEvent = {
      preventDefault: () => {},
    } as FormEvent<HTMLFormElement>;
    await form.handleSubmit(syntheticEvent);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    handleValidationTracking();
  }, [form, handleValidationTracking]);

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        if (isPending) {
          return;
        }
        onOpenChange(false);
        resetMutation();
        form.reset();
      } else {
        onOpenChange(true);
      }
    },
    [form, isPending, onOpenChange, resetMutation],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={handleDialogOpenChange}
      contentProps={{ 'data-testid': 'kits.overview.create.dialog' } as DialogContentProps}
    >
      <DialogContent>
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
          data-testid="kits.overview.create.form"
        >
          <DialogHeader>
            <DialogTitle>Create kit</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4" data-testid="kits.overview.create.fields">
            <FormField>
              <FormLabel htmlFor="kits.overview.create.name" required>
                Name
              </FormLabel>
              <Input
                id="kits.overview.create.name"
                maxLength={NAME_LIMIT}
                value={form.values.name}
                onChange={(event) => form.setValue('name', event.target.value)}
                onBlur={() => form.setFieldTouched('name')}
                error={form.errors.name}
                data-testid="kits.overview.create.field.name"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {normalizeWhitespace(form.values.name ?? '').length}/{NAME_LIMIT} characters
              </p>
            </FormField>

            <FormField>
              <FormLabel htmlFor="kits.overview.create.description">
                Description <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </FormLabel>
              <textarea
                id="kits.overview.create.description"
                maxLength={DESCRIPTION_LIMIT}
                className={cn(
                  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                  'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50 min-h-[96px]'
                )}
                value={form.values.description}
                onChange={(event) => form.setValue('description', event.target.value)}
                onBlur={() => form.setFieldTouched('description')}
                aria-invalid={form.errors.description ? 'true' : undefined}
                data-testid="kits.overview.create.field.description"
              />
              {form.errors.description ? (
                <p className="mt-1 text-sm text-destructive">{form.errors.description}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {normalizeWhitespace(form.values.description ?? '').length}/{DESCRIPTION_LIMIT} characters
              </p>
            </FormField>

            <FormField>
              <FormLabel htmlFor="kits.overview.create.build-target" required>
                Build target
              </FormLabel>
              <Input
                id="kits.overview.create.build-target"
                type="number"
                min={0}
                value={form.values.buildTarget}
                onChange={(event) => form.setValue('buildTarget', event.target.value)}
                onBlur={() => form.setFieldTouched('buildTarget')}
                error={form.errors.buildTarget}
                data-testid="kits.overview.create.field.build-target"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Set the number of complete kits to maintain in stock. Defaults to one if left blank.
              </p>
            </FormField>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              preventValidation
              onClick={() => handleDialogOpenChange(false)}
              disabled={isPending}
              data-testid="kits.overview.create.cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                void handleSubmit();
              }}
              disabled={isPending}
              loading={isPending}
              data-testid="kits.overview.create.submit"
            >
              Create kit
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
