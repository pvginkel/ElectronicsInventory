import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, type DialogContentProps } from '@/components/ui/dialog';
import { Form, FormField, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PartSelector } from '@/components/parts/part-selector';
import { SellerSelector } from '@/components/sellers/seller-selector';
import { cn } from '@/lib/utils';
import { useFormState } from '@/hooks/use-form-state';
import { useFormInstrumentation, type UseFormInstrumentationResult } from '@/hooks/use-form-instrumentation';
import { snapshotLineFields, useCreateShoppingListLineMutation, useUpdateShoppingListLineMutation } from '@/hooks/use-shopping-lists';
import { useToast } from '@/hooks/use-toast';
import type { ShoppingListConceptLine, ShoppingListDuplicateCheck } from '@/types/shopping-lists';
import { ApiError } from '@/lib/api/api-error';
import type { PartSelectorSummary } from '@/hooks/use-parts-selector';

type ConceptLineFormMode = 'add' | 'edit';

interface ConceptLineFormProps {
  open: boolean;
  mode: ConceptLineFormMode;
  listId: number;
  onClose: () => void;
  duplicateCheck: ShoppingListDuplicateCheck;
  duplicateNotice: { lineId: number; partKey: string } | null;
  line?: ShoppingListConceptLine;
  onDuplicateDetected?: (line: ShoppingListConceptLine, partKey: string) => void;
  onDismissDuplicateNotice?: () => void;
}

interface LineFormValues extends Record<string, unknown> {
  partKey: string;
  partId: number | null;
  needed: string;
  sellerId: number | undefined;
  note: string;
}

const NOTE_LIMIT = 500;

export function ConceptLineForm({
  open,
  mode,
  listId,
  line,
  onClose,
  duplicateCheck,
  duplicateNotice,
  onDuplicateDetected,
  onDismissDuplicateNotice,
}: ConceptLineFormProps) {
  const queryClient = useQueryClient();
  const { showSuccess, showException } = useToast();
  const createMutation = useCreateShoppingListLineMutation();
  const updateMutation = useUpdateShoppingListLineMutation();
  const instrumentationRef = useRef<UseFormInstrumentationResult<{ listId: number; partKey: string; needed: number }> | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const initialValues = useMemo<LineFormValues>(() => {
    if (mode === 'edit' && line) {
      return {
        partKey: line.part.key,
        partId: line.part.id,
        needed: String(line.needed),
        sellerId: line.seller?.id ?? undefined,
        note: line.note ?? '',
      };
    }
    return {
      partKey: '',
      partId: null,
      needed: '1',
      sellerId: undefined,
      note: '',
    };
  }, [line, mode]);

  const form = useFormState<LineFormValues>({
    initialValues,
    validationRules: (
      {
      partKey: (value) => {
        if (mode === 'edit') {
          return undefined;
        }
        return (value as string).trim() ? undefined : 'Select a part to add';
      },
      needed: (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
          return 'Needed quantity must be an integer';
        }
        if (parsed < 1) {
          return 'Needed quantity must be at least 1';
        }
        return undefined;
      },
      note: (value) => {
        const raw = (value as string) ?? '';
        if (raw.trim().length > NOTE_LIMIT) {
          return `Note must be ${NOTE_LIMIT} characters or fewer`;
        }
        return undefined;
      },
    } as { [K in keyof LineFormValues]?: (value: unknown) => string | undefined }
    ),
    onSubmit: async (values) => {
      const parsedNeeded = Number(values.needed);
      const snapshot = snapshotLineFields({
        listId,
        partKey: values.partKey,
        needed: parsedNeeded,
      });

      try {
        instrumentationRef.current?.trackSubmit(snapshot);
        if (mode === 'add') {
          if (!values.partKey.trim()) {
            instrumentationRef.current?.trackValidationError('partKey', 'Part is required', snapshot);
            setDuplicateError('Select a part to add');
            return;
          }

          const existingLine = duplicateCheck.byPartKey.get(values.partKey);
          if (existingLine) {
            setDuplicateError('This part is already on the list. Edit the existing line instead.');
            instrumentationRef.current?.trackValidationError(
              'partKey',
              'Part already on list (client)',
              snapshot,
            );
            onDuplicateDetected?.(existingLine, values.partKey);
            return;
          }

          await createMutation.mutateAsync({
            listId,
            partId: values.partId,
            partKey: values.partKey,
            needed: parsedNeeded,
            sellerId: values.sellerId ?? null,
            note: values.note.trim() ? values.note.trim() : null,
          });
          showSuccess('Added part to concept list');
        } else if (mode === 'edit' && line) {
          await updateMutation.mutateAsync({
            listId,
            lineId: line.id,
            partId: line.part.id,
            partKey: line.part.key,
            needed: parsedNeeded,
            sellerId: values.sellerId ?? null,
            note: values.note.trim() ? values.note.trim() : null,
          });
          showSuccess('Updated line');
        }

        instrumentationRef.current?.trackSuccess(snapshot);
        setDuplicateError(null);
        handleClose();
      } catch (error) {
        instrumentationRef.current?.trackError(snapshot);
        if (error instanceof ApiError && error.status === 409 && mode === 'add' && values.partKey) {
          const conflictingLine = duplicateCheck.byPartKey.get(values.partKey);
          if (conflictingLine) {
            setDuplicateError('The backend reported a duplicate. Review the existing line.');
            onDuplicateDetected?.(conflictingLine, values.partKey);
          }
        }
        const message = error instanceof Error ? error.message : 'Failed to save line';
        showException(message, error);
      }
    },
  });

  const formId = useMemo(() => {
    if (mode === 'edit' && line) {
      return `ShoppingListLineForm:edit-${line.id}`;
    }
    return 'ShoppingListLineForm:add';
  }, [line, mode]);

  const instrumentation = useFormInstrumentation({
    formId,
    isOpen: open,
    snapshotFields: () => snapshotLineFields({
      listId,
      partKey: form.values.partKey,
      needed: Number.parseInt(form.values.needed, 10) || 0,
    }),
  });

  instrumentationRef.current = instrumentation;

  useEffect(() => {
    if (!open) {
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['getParts'] });
  }, [open, queryClient]);

  const handleClose = () => {
    form.reset();
    setDuplicateError(null);
    onClose();
  };

  useEffect(() => {
    if (mode === 'edit' && line) {
      form.setValue('partKey', line.part.key);
      form.setValue('partId', line.part.id);
      form.setValue('needed', String(line.needed));
      form.setValue('sellerId', line.seller?.id ?? undefined);
      form.setValue('note', line.note ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, mode]);

  const handlePartSummary = (summary: PartSelectorSummary | undefined) => {
    if (!summary) {
      if (form.values.partId !== null) {
        form.setValue('partId', null);
      }
      if (form.values.partKey !== '') {
        form.setValue('partKey', '');
      }
      return;
    }
    const nextPartId = summary.partId ?? null;
    if (form.values.partId !== nextPartId) {
      form.setValue('partId', nextPartId);
    }
    if (form.values.partKey !== summary.id) {
      form.setValue('partKey', summary.id);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          handleClose();
        }
      }}
      contentProps={{ 'data-testid': `${formId}.dialog` } as DialogContentProps}
    >
      <DialogContent>
        {duplicateNotice && (
          <div
            className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            data-testid="shopping-lists.concept.duplicate-banner"
          >
            <div className="flex items-start justify-between gap-4">
              <p>
                Part with key <strong>{duplicateNotice.partKey}</strong> already exists on this Concept list.
                Edit the existing line instead of creating a duplicate.
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onDismissDuplicateNotice?.();
                    setDuplicateError(null);
                  }}
                  data-testid="shopping-lists.concept.duplicate-banner.dismiss"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        )}

        <Form onSubmit={form.handleSubmit} data-testid={`${formId}.form`}>
          <DialogHeader>
            <DialogTitle>{mode === 'add' ? 'Add part to Concept list' : 'Edit line'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {mode === 'add' ? (
              <FormField>
                <FormLabel required>Part</FormLabel>
                <PartSelector
                  value={form.values.partKey || undefined}
                  onChange={(value) => {
                    form.setValue('partKey', value ?? '');
                    setDuplicateError(null);
                  }}
                  onSelectSummary={handlePartSummary}
                  error={duplicateError ?? undefined}
                />
              </FormField>
            ) : (
              <FormField>
                <FormLabel>Part</FormLabel>
                <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm" data-testid={`${formId}.part.readonly`}>
                  <div className="font-medium">{line?.part.description}</div>
                  <div className="text-xs text-muted-foreground">
                    Key {line?.part.key}
                    {line?.part.manufacturerCode ? ` • MPN ${line.part.manufacturerCode}` : ''}
                  </div>
                </div>
              </FormField>
            )}

            <FormField>
              <FormLabel required>Needed</FormLabel>
              <Input
                type="number"
                min={1}
                step={1}
                value={form.values.needed}
                onChange={(event) => form.setValue('needed', event.target.value)}
                onBlur={() => form.setFieldTouched('needed')}
                error={form.errors.needed}
                data-testid={`${formId}.field.needed`}
              />
            </FormField>

            <FormField>
              <FormLabel>Seller override</FormLabel>
              <div data-testid={`${formId}.field.seller`}>
                <SellerSelector
                  value={form.values.sellerId}
                  onChange={(value) => form.setValue('sellerId', value)}
                  placeholder="Select seller (Optional override)"
                />
              </div>
            </FormField>

            <FormField>
              <FormLabel>Note</FormLabel>
              <textarea
                className={cn(
                  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                  'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50 min-h-[96px]'
                )}
                maxLength={NOTE_LIMIT}
                value={form.values.note}
                onChange={(event) => form.setValue('note', event.target.value)}
                onBlur={() => form.setFieldTouched('note')}
                aria-invalid={form.errors.note ? 'true' : undefined}
                data-testid={`${formId}.field.note`}
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
              preventValidation
              onClick={handleClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={mode === 'add' ? createMutation.isPending : updateMutation.isPending}
              disabled={mode === 'add' ? createMutation.isPending : updateMutation.isPending}
              data-testid={`${formId}.submit`}
            >
              {mode === 'add' ? 'Add line' : 'Save changes'}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
