import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, type DialogContentProps } from '@/components/ui/dialog';
import { Form, FormField, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SellerSelector } from '@/components/sellers/seller-selector';
import { cn } from '@/lib/utils';
import { useFormState } from '@/hooks/use-form-state';
import { useFormInstrumentation, type UseFormInstrumentationResult } from '@/hooks/use-form-instrumentation';
import {
  useCreateShoppingListLineMutation,
  useCreateShoppingListMutation,
  useShoppingListsOverview,
} from '@/hooks/use-shopping-lists';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/api/api-error';
import { invalidatePartMemberships } from '@/hooks/use-part-shopping-list-memberships';
import type { ShoppingListOverviewSummary } from '@/types/shopping-lists';

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
  newListName: string;
  newListDescription: string;
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

const NAME_LIMIT = 120;
const DESCRIPTION_LIMIT = 280;
const NOTE_LIMIT = 500;
const FORM_ID = 'ShoppingListMembership:addFromPart';

export function AddToShoppingListDialog({ open, onClose, part, defaultNeeded = 1 }: AddToShoppingListDialogProps) {
  const queryClient = useQueryClient();
  const { showSuccess, showException, showWarning } = useToast();
  const instrumentationRef = useRef<UseFormInstrumentationResult<MembershipFormSnapshot> | null>(null);
  const [createNewList, setCreateNewList] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);

  const overviewQuery = useShoppingListsOverview();
  const conceptLists = useMemo(
    () => overviewQuery.lists.filter((list: ShoppingListOverviewSummary) => list.status === 'concept'),
    [overviewQuery.lists]
  );

  const createListMutation = useCreateShoppingListMutation();
  const createLineMutation = useCreateShoppingListLineMutation();

  const form = useFormState<FormValues>({
    initialValues: {
      listId: '',
      newListName: '',
      newListDescription: '',
      needed: String(defaultNeeded),
      sellerId: part.defaultSellerId ?? undefined,
      note: '',
    },
    validationRules: (
      {
      listId: (value) => {
        if (createNewList) {
          return undefined;
        }
        const trimmed = (value as string).trim();
        return trimmed ? undefined : 'Select a Concept list';
      },
      newListName: (value) => {
        if (!createNewList) {
          return undefined;
        }
        const trimmed = (value as string).trim();
        if (!trimmed) {
          return 'Name your new Concept list';
        }
        if (trimmed.length > NAME_LIMIT) {
          return `Name must be ${NAME_LIMIT} characters or fewer`;
        }
        return undefined;
      },
      newListDescription: (value) => {
        if (!createNewList) {
          return undefined;
        }
        const raw = (value as string) ?? '';
        if (!raw.trim()) {
          return undefined;
        }
        if (raw.trim().length > DESCRIPTION_LIMIT) {
          return `Description must be ${DESCRIPTION_LIMIT} characters or fewer`;
        }
        return undefined;
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

        let listId: number;
        if (createNewList) {
          const payload = {
            name: values.newListName.trim(),
            description: values.newListDescription.trim()
              ? values.newListDescription.trim()
              : null,
          };
          const created = await createListMutation.mutateAsync(payload);
          listId = created.id;
        } else {
          listId = Number(values.listId);
        }

        await createLineMutation.mutateAsync({
          listId,
          partId: part.id,
          partKey: part.key,
          needed: parsedNeeded,
          sellerId: values.sellerId ?? null,
          note: values.note.trim() ? values.note.trim() : null,
        });

        instrumentationRef.current?.trackSuccess({ ...snapshot, listId });
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
    mode: createNewList ? 'create' : 'select',
    needed: Number.parseInt(form.values.needed, 10) || 0,
    listId: createNewList ? null : (form.values.listId ? Number(form.values.listId) : null),
    sellerId: form.values.sellerId ?? null,
  }), [createNewList, form.values.listId, form.values.needed, form.values.sellerId, part.key]);

  const instrumentation = useFormInstrumentation<MembershipFormSnapshot>({
    formId: FORM_ID,
    isOpen: open,
    snapshotFields,
  });

  instrumentationRef.current = instrumentation;

  const isMutating = form.isSubmitting || createListMutation.isPending || createLineMutation.isPending;

  const initializationRef = useRef<{ conceptCount: number; defaultNeeded: number; sellerId: number | null } | null>(null);

  useEffect(() => {
    if (!open) {
      initializationRef.current = null;
      form.reset();
      setCreateNewList(conceptLists.length === 0);
      setConflictError(null);
      return;
    }

    const previous = initializationRef.current;
    const currentSignature = {
      conceptCount: conceptLists.length,
      defaultNeeded,
      sellerId: part.defaultSellerId ?? null,
    };

    if (
      previous &&
      previous.conceptCount === currentSignature.conceptCount &&
      previous.defaultNeeded === currentSignature.defaultNeeded &&
      previous.sellerId === currentSignature.sellerId
    ) {
      return;
    }

    initializationRef.current = currentSignature;
    setConflictError(null);

    if (conceptLists.length === 0) {
      setCreateNewList(true);
      form.setValue('listId', '');
    } else {
      setCreateNewList(false);
      form.setValue('listId', String(conceptLists[0].id));
    }

    form.setValue('needed', String(defaultNeeded));
    form.setValue('sellerId', part.defaultSellerId ?? undefined);
  }, [open, conceptLists.length, defaultNeeded, part.defaultSellerId]);

  const handleToggleCreateNew = (next: boolean) => {
    setCreateNewList(next);
    setConflictError(null);

    if (next) {
      form.setValue('listId', '');
      form.setFieldTouched('listId', false);
    } else if (conceptLists.length > 0) {
      form.setValue('listId', String(conceptLists[0].id));
    }
  };

  const handleClose = () => {
    if (isMutating) {
      return;
    }
    onClose();
    form.reset();
    setCreateNewList(conceptLists.length === 0);
    setConflictError(null);
  };

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
            <DialogTitle>Add to shopping list</DialogTitle>
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
              <div className="flex items-center justify-between">
                <FormLabel htmlFor="parts.shopping-list.add.list">
                  Concept list
                </FormLabel>
                {conceptLists.length > 0 && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      id="parts.shopping-list.add.toggle.create"
                      checked={createNewList}
                      onChange={(event) => handleToggleCreateNew(event.target.checked)}
                      className="h-4 w-4"
                      data-testid="parts.shopping-list.add.toggle.create"
                    />
                    <span>Create new Concept list</span>
                  </label>
                )}
            </div>

            {overviewQuery.error && (
              <p className="text-sm text-destructive">
                Failed to load Concept lists. Create a new list instead.
              </p>
            )}

            {!createNewList && conceptLists.length > 0 && (
              <FormField>
                <select
                  id="parts.shopping-list.add.list"
                    className={cn(
                      'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                    )}
                    value={form.values.listId}
                    onChange={(event) => form.setValue('listId', event.target.value)}
                    onBlur={() => form.setFieldTouched('listId')}
                    disabled={overviewQuery.isLoading || overviewQuery.isFetching}
                    data-testid="parts.shopping-list.add.field.list"
                  >
                    {conceptLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name} ({list.lineCounts.new + list.lineCounts.ordered} items)
                      </option>
                    ))}
                  </select>
                  {form.errors.listId && (
                    <p className="text-sm text-destructive mt-1">{form.errors.listId}</p>
                  )}
                </FormField>
              )}

              {!createNewList && conceptLists.length === 0 && (
                <div className="rounded-md border border-dashed border-muted px-3 py-2 text-sm text-muted-foreground">
                  No Concept lists available yet. Create one below to get started.
                </div>
              )}
            </div>

            {createNewList && (
              <div className="space-y-3 rounded-md border border-muted p-3">
                <FormField>
                  <FormLabel htmlFor="parts.shopping-list.add.new-name" required>
                    New Concept list name
                  </FormLabel>
                  <Input
                    id="parts.shopping-list.add.new-name"
                    maxLength={NAME_LIMIT}
                    placeholder="e.g., Spring Synth Build"
                    value={form.values.newListName}
                    onChange={(event) => form.setValue('newListName', event.target.value)}
                    onBlur={() => form.setFieldTouched('newListName')}
                    error={form.errors.newListName}
                    data-testid="parts.shopping-list.add.field.new-name"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.values.newListName.trim().length}/{NAME_LIMIT} characters
                  </p>
                </FormField>

                <FormField>
                  <FormLabel htmlFor="parts.shopping-list.add.new-description">
                    Description <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  </FormLabel>
                  <textarea
                    id="parts.shopping-list.add.new-description"
                    placeholder="Add context for collaborators"
                    maxLength={DESCRIPTION_LIMIT}
                    className={cn(
                      'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                      'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none',
                      'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      'min-h-[96px]'
                    )}
                    value={form.values.newListDescription}
                    onChange={(event) => form.setValue('newListDescription', event.target.value)}
                    onBlur={() => form.setFieldTouched('newListDescription')}
                    data-testid="parts.shopping-list.add.field.new-description"
                  />
                  {form.errors.newListDescription && (
                    <p className="text-sm text-destructive mt-1">{form.errors.newListDescription}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.values.newListDescription.trim().length}/{DESCRIPTION_LIMIT} characters
                  </p>
                </FormField>
              </div>
            )}

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
              Add to shopping list
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
