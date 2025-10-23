import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, type DialogContentProps } from '@/components/ui/dialog';
import { Form, FormField, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SellerSelector } from '@/components/sellers/seller-selector';
import { ShoppingListSelector } from '@/components/shopping-lists/shopping-list-selector';
import { cn } from '@/lib/utils';
import { useFormState } from '@/hooks/use-form-state';
import { useFormInstrumentation, type UseFormInstrumentationResult } from '@/hooks/use-form-instrumentation';
import {
  useCreateShoppingListLineMutation,
} from '@/hooks/use-shopping-lists';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/api/api-error';
import { invalidatePartMemberships } from '@/hooks/use-part-shopping-list-memberships';

interface PartSummary {
  id: number | null;
  key: string;
  description: string;
  defaultSellerId: number | null;
}

interface AddToShoppingListDialogProps {
  open: boolean;
  onClose: () => void;
  part: PartSummary;
  defaultNeeded?: number;
}

interface FormValues extends Record<string, unknown> {
  listId: string;
  needed: string;
  sellerId: number | undefined;
  note: string;
}

type MembershipFormSnapshot = {
  partKey: string;
  mode: 'create' | 'select';
  needed: number;
  listId: number | null;
  sellerId: number | null;
};

const NOTE_LIMIT = 500;
const FORM_ID = 'ShoppingListMembership:addFromPart';

export function AddToShoppingListDialog({ open, onClose, part, defaultNeeded = 1 }: AddToShoppingListDialogProps) {
  const queryClient = useQueryClient();
  const { showSuccess, showException, showWarning } = useToast();
  const instrumentationRef = useRef<UseFormInstrumentationResult<MembershipFormSnapshot> | null>(null);
  const [selectionMode, setSelectionMode] = useState<'create' | 'select'>('select');
  const [conflictError, setConflictError] = useState<string | null>(null);

  const createLineMutation = useCreateShoppingListLineMutation();

  const form = useFormState<FormValues>({
    initialValues: {
      listId: '',
      needed: String(defaultNeeded),
      sellerId: part.defaultSellerId ?? undefined,
      note: '',
    },
    validationRules: (
      {
      listId: (value) => {
        const trimmed = (value as string).trim();
        return trimmed ? undefined : 'Select a Concept list';
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
        if (!raw.trim()) {
          return undefined;
        }
        if (raw.trim().length > NOTE_LIMIT) {
          return `Note must be ${NOTE_LIMIT} characters or fewer`;
        }
        return undefined;
      },
    } as { [K in keyof FormValues]?: (value: unknown) => string | undefined }
    ),
    onSubmit: async (values) => {
      const parsedNeeded = Number(values.needed);
      const snapshot = snapshotFields();

      try {
        instrumentationRef.current?.trackSubmit(snapshot);

        const parsedListId = Number.parseInt(values.listId, 10);
        if (!Number.isFinite(parsedListId)) {
          throw new Error('Missing target shopping list');
        }
        await createLineMutation.mutateAsync({
          listId: parsedListId,
          partId: part.id,
          partKey: part.key,
          needed: parsedNeeded,
          sellerId: values.sellerId ?? null,
          note: values.note.trim() ? values.note.trim() : null,
        });

        instrumentationRef.current?.trackSuccess({ ...snapshot, listId: parsedListId });
        showSuccess('Added part to Concept list');
        invalidatePartMemberships(queryClient, part.key);
        handleClose();
      } catch (error) {
        instrumentationRef.current?.trackError(snapshot);
        if (error instanceof ApiError && error.status === 409) {
          const message = error.message || 'Part already exists on the selected list.';
          setConflictError(message);
          showWarning(message);
          instrumentationRef.current?.trackValidationError(
            'listId',
            'Part already on selected list (backend)',
            snapshot,
          );
          return;
        }

        showException('Failed to add part to shopping list', error);
      }
    },
  });

  const snapshotFields = useCallback<() => MembershipFormSnapshot>(() => ({
    partKey: part.key,
    mode: selectionMode,
    needed: Number.parseInt(form.values.needed, 10) || 0,
    listId: form.values.listId ? Number.parseInt(form.values.listId, 10) : null,
    sellerId: form.values.sellerId ?? null,
  }), [form.values.listId, form.values.needed, form.values.sellerId, part.key, selectionMode]);

  const instrumentation = useFormInstrumentation<MembershipFormSnapshot>({
    formId: FORM_ID,
    isOpen: open,
    snapshotFields,
  });

  instrumentationRef.current = instrumentation;

  const defaultSellerId = part.defaultSellerId ?? null;

  const isMutating = form.isSubmitting || createLineMutation.isPending;

  const initializationRef = useRef(false);

  const formApiRef = useRef(form);
  useEffect(() => {
    formApiRef.current = form;
  }, [form]);

  const touchListField = useCallback(() => {
    const applyTouch = () => {
      formApiRef.current.setFieldTouched('listId', true);
    };
    setTimeout(applyTouch, 0);
  }, []);

  useEffect(() => {
    const formApi = formApiRef.current;

    if (!open) {
      initializationRef.current = false;
      formApi.reset();
      setSelectionMode('select');
      setConflictError(null);
      return;
    }

    if (initializationRef.current) {
      return;
    }

    initializationRef.current = true;
    setConflictError(null);
    setSelectionMode('select');
    formApi.setValue('listId', '');
    formApi.setValue('needed', String(defaultNeeded));
    formApi.setValue('sellerId', defaultSellerId ?? undefined);
    formApi.setValue('note', '');
  }, [defaultSellerId, defaultNeeded, open]);

  const handleClose = () => {
    if (isMutating) {
      return;
    }
    onClose();
    form.reset();
    setSelectionMode('select');
    setConflictError(null);
  };

  const applyListSelection = useCallback((nextListId: number | undefined, mode: 'create' | 'select') => {
    form.setValue('listId', nextListId != null ? String(nextListId) : '');
    touchListField();
    setSelectionMode(mode);
    setConflictError(null);
  }, [form, touchListField]);

  // Guidepost: Reset conflict banner whenever the user adjusts the target list.
  const handleListChange = useCallback((nextListId: number | undefined) => {
    applyListSelection(nextListId, 'select');
  }, [applyListSelection]);

  const handleListCreated = useCallback(({ id }: { id: number; name: string }) => {
    applyListSelection(id, 'create');
  }, [applyListSelection]);

  const listSelectorInstrumentation = useMemo(() => ({
    scope: 'parts.orderStock.lists',
    getReadyMetadata: () => ({ partKey: part.key }),
    getErrorMetadata: (err: unknown) => ({
      partKey: part.key,
      message: err instanceof Error ? err.message : String(err),
    }),
    getAbortedMetadata: () => ({ partKey: part.key }),
  }), [part.key]);

  const conceptListEmptyState = (
    <div
      className="rounded-md border border-dashed border-muted px-3 py-2 text-sm text-muted-foreground"
      data-testid="parts.shopping-list.add.list.empty"
    >
      No Concept lists available yet. Create one to get started.
    </div>
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    await form.handleSubmit(event);

    if (!instrumentationRef.current) {
      return;
    }

    const errors = Object.entries(form.errors).reduce<Record<string, string | undefined>>((acc, [field, message]) => {
      if (typeof message === 'string' && message.trim().length > 0) {
        acc[field] = message;
      }
      return acc;
    }, {});

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
        <Form onSubmit={handleSubmit} data-testid="parts.shopping-list.add.form">
          <DialogHeader>
            <DialogTitle>Order Stock</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {part.description} ({part.key})
            </p>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {conflictError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="parts.shopping-list.add.conflict">
                {conflictError}{' '}
                <a
                  href="#parts.detail.shopping-list.badges"
                  className="underline underline-offset-2"
                >
                  View existing lists
                </a>
              </div>
            )}

            <div className="space-y-2">
              <FormLabel htmlFor="parts.shopping-list.add.list" required>
                Concept list
              </FormLabel>
              <FormField>
                <ShoppingListSelector
                  value={form.values.listId ? Number(form.values.listId) : undefined}
                  onChange={handleListChange}
                  statuses={['concept']}
                  enableCreate
                  enabled={open}
                  instrumentation={listSelectorInstrumentation}
                  error={form.errors.listId}
                  inputProps={{
                    id: 'parts.shopping-list.add.list',
                    'data-testid': 'parts.shopping-list.add.field.list',
                  }}
                  onListCreated={handleListCreated}
                  emptyState={conceptListEmptyState}
                />
              </FormField>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField>
                <FormLabel htmlFor="parts.shopping-list.add.needed" required>
                  Needed quantity
                </FormLabel>
                <Input
                  id="parts.shopping-list.add.needed"
                  type="number"
                  min={1}
                  value={form.values.needed}
                  onChange={(event) => form.setValue('needed', event.target.value)}
                  onBlur={() => form.setFieldTouched('needed')}
                  error={form.errors.needed}
                  data-testid="parts.shopping-list.add.field.needed"
                />
              </FormField>

              <FormField>
                <FormLabel>
                  Seller override <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </FormLabel>
                <div data-testid="parts.shopping-list.add.field.seller">
                  <SellerSelector
                    value={form.values.sellerId}
                    onChange={(sellerId) => form.setValue('sellerId', sellerId)}
                    error={undefined}
                  />
                </div>
              </FormField>
            </div>

            <FormField>
              <FormLabel htmlFor="parts.shopping-list.add.note">
                Note <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </FormLabel>
              <textarea
                id="parts.shopping-list.add.note"
                placeholder="Add context for collaborators (max 500 characters)"
                maxLength={NOTE_LIMIT}
                className={cn(
                  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                  'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'min-h-[96px]'
                )}
                value={form.values.note}
                onChange={(event) => form.setValue('note', event.target.value)}
                onBlur={() => form.setFieldTouched('note')}
                data-testid="parts.shopping-list.add.field.note"
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
              disabled={isMutating}
              loading={isMutating}
              data-testid="parts.shopping-list.add.submit"
            >
              Order Stock
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
