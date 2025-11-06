import { useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, type DialogContentProps } from '@/components/ui/dialog';
import { Form, FormField, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFormState } from '@/hooks/use-form-state';
import { useFormInstrumentation, type UseFormInstrumentationResult } from '@/hooks/use-form-instrumentation';
import { useCreateShoppingListMutation } from '@/hooks/use-shopping-lists';
import { useToast } from '@/hooks/use-toast';
import type { ShoppingListCreateInput } from '@/types/shopping-lists';

interface ListCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (payload: { id: number; name: string }) => void;
  initialName?: string;
  initialDescription?: string;
}

interface FormValues extends Record<string, unknown> {
  name: string;
  description: string;
}

const NAME_LIMIT = 120;
const DESCRIPTION_LIMIT = 280;

export function ListCreateDialog({
  open,
  onOpenChange,
  onCreated,
  initialName,
  initialDescription,
}: ListCreateDialogProps) {
  const { showSuccess, showException } = useToast();
  const createMutation = useCreateShoppingListMutation();
  const instrumentationRef = useRef<UseFormInstrumentationResult<FormValues> | null>(null);

  const form = useFormState<FormValues>({
    initialValues: { name: '', description: '' },
    validationRules: (
      {
      name: (value) => {
        const trimmed = (value as string).trim();
        if (!trimmed) return 'Name is required';
        if (trimmed.length > NAME_LIMIT) return `Name must be ${NAME_LIMIT} characters or fewer`;
        return undefined;
      },
      description: (value) => {
        const raw = (value as string) ?? '';
        if (!raw) return undefined;
        if (raw.trim().length > DESCRIPTION_LIMIT) return `Description must be ${DESCRIPTION_LIMIT} characters or fewer`;
        return undefined;
      },
    } as { [K in keyof FormValues]?: (value: unknown) => string | undefined }
    ),
    onSubmit: async (values) => {
      const payload: ShoppingListCreateInput = {
        name: values.name.trim(),
        description: values.description.trim() ? values.description.trim() : null,
      };

      const snapshot = {
        name: payload.name,
        description: payload.description ?? '',
      };

      try {
        instrumentationRef.current?.trackSubmit(snapshot);
        const response = await createMutation.mutateAsync(payload);
        instrumentationRef.current?.trackSuccess(snapshot);
        showSuccess(`Created "${payload.name}"`);
        onCreated({ id: response.id, name: payload.name });
        handleDialogOpenChange(false);
      } catch (error) {
        instrumentationRef.current?.trackError(snapshot);
        const message = error instanceof Error ? error.message : 'Failed to create shopping list';
        showException(message, error);
        throw error;
      }
    },
  });

  const resolvedFormId = useMemo(() => 'ShoppingListCreate:concept', []);

  const instrumentation = useFormInstrumentation({
    formId: resolvedFormId,
    isOpen: open,
    snapshotFields: () => ({
      name: form.values.name,
      description: form.values.description,
    }),
  });

  // Update ref when instrumentation changes
  useEffect(() => {
    instrumentationRef.current = instrumentation
  }, [instrumentation])

  const lastOpenRef = useRef(open);
  useEffect(() => {
    const justOpened = open && !lastOpenRef.current;
    lastOpenRef.current = open;
    if (!justOpened) {
      return;
    }

    if (typeof initialName === 'string') {
      form.setValue('name', initialName);
    }
    if (typeof initialDescription === 'string') {
      form.setValue('description', initialDescription);
    }
  }, [open, initialName, initialDescription, form]);

  const handleDialogOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      form.reset();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleDialogOpenChange}
      contentProps={{ 'data-testid': `${resolvedFormId}.dialog` } as DialogContentProps}
    >
      <DialogContent>
        <Form onSubmit={form.handleSubmit} data-testid={`${resolvedFormId}.form`}>
          <DialogHeader>
            <DialogTitle>Create shopping list</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <FormField>
              <FormLabel htmlFor={`${resolvedFormId}.name`} required>
                Name
              </FormLabel>
              <Input
                id={`${resolvedFormId}.name`}
                maxLength={NAME_LIMIT}
                placeholder="Concept list name (e.g., Spring Synth Build)"
                value={form.values.name}
                onChange={(event) => form.setValue('name', event.target.value)}
                onBlur={() => form.setFieldTouched('name')}
                error={form.errors.name}
                data-testid={`${resolvedFormId}.field.name`}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.values.name.trim().length}/{NAME_LIMIT} characters
              </p>
            </FormField>

            <FormField>
              <FormLabel htmlFor={`${resolvedFormId}.description`}>
                Description <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </FormLabel>
              <textarea
                id={`${resolvedFormId}.description`}
                placeholder="Add context for collaborators (e.g., assembly notes or linked BOM)"
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
                data-testid={`${resolvedFormId}.field.description`}
              />
              {form.errors.description && (
                <p className="text-sm text-destructive mt-1">{form.errors.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {form.values.description.trim().length}/{DESCRIPTION_LIMIT} characters
              </p>
            </FormField>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              preventValidation
              onClick={() => handleDialogOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!form.isValid || createMutation.isPending}
              loading={createMutation.isPending}
              data-testid={`${resolvedFormId}.submit`}
              onClick={(event) => {
                event.stopPropagation();
              }}
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
              }}
            >
              Create Concept List
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
