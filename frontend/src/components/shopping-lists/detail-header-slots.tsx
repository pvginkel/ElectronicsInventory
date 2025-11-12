import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { KeyValueBadge, StatusBadge } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, type DialogContentProps } from '@/components/ui/dialog';
import { Form, FormField, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useFormState } from '@/hooks/use-form-state';
import { useToast } from '@/hooks/use-toast';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { useGetShoppingListsKitsByListId } from '@/lib/api/generated/hooks';
import { mapShoppingListKitLinks } from '@/types/shopping-lists';
import { KitLinkChip } from '@/components/kits/kit-link-chip';
import { Route as ShoppingListsRoute } from '@/routes/shopping-lists/';
import type { ShoppingListDetail } from '@/types/shopping-lists';
import type { ConceptHeaderProps } from './concept-header';

interface MetadataFormValues extends Record<string, unknown> {
  name: string;
  description: string;
}

export interface ShoppingListDetailHeaderSlots {
  breadcrumbs?: ReactNode;
  title: ReactNode;
  titleMetadata?: ReactNode;
  description?: ReactNode;
  supplementary?: ReactNode;
  metadataRow?: ReactNode;
  actions?: ReactNode;
  linkChips?: ReactNode;
}

export interface ShoppingListDetailHeaderRender {
  slots: ShoppingListDetailHeaderSlots;
  overlays: ReactNode | null;
  kitsQuery: ReturnType<typeof useGetShoppingListsKitsByListId>;
}

const NAME_LIMIT = 120;
const DESCRIPTION_LIMIT = 280;

// Map shopping list status to badge props
function getShoppingListStatusBadgeProps(status: ShoppingListDetail['status']): { color: 'inactive' | 'active'; label: string } {
  switch (status) {
    case 'concept':
      return { color: 'inactive', label: 'Concept' };
    case 'ready':
      return { color: 'active', label: 'Ready' };
    case 'done':
      return { color: 'inactive', label: 'Completed' };
  }
}

export function useShoppingListDetailHeaderSlots({
  list,
  onUpdateMetadata,
  isUpdating,
  onDeleteList,
  isDeletingList,
  overviewSearchTerm = '',
  onUnlinkKit,
  unlinkingLinkId,
}: ConceptHeaderProps): ShoppingListDetailHeaderRender {
  const { showSuccess, showException } = useToast();
  const [editOpen, setEditOpen] = useState(false);

  const initialValues = useMemo<MetadataFormValues>(() => ({
    name: list?.name ?? '',
    description: list?.description ?? '',
  }), [list]);

  const form = useFormState<MetadataFormValues>({
    initialValues,
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
          if (raw.trim().length > DESCRIPTION_LIMIT) {
            return `Description must be ${DESCRIPTION_LIMIT} characters or fewer`;
          }
          return undefined;
        },
      } as { name: (value: unknown) => string | undefined; description: (value: unknown) => string | undefined }
    ),
    onSubmit: async (values) => {
      try {
        await onUpdateMetadata({
          name: values.name.trim(),
          description: values.description.trim() ? values.description.trim() : null,
        });
        showSuccess('List details updated');
        setEditOpen(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update list';
        showException(message, error);
        throw error;
      }
    },
  });

  useEffect(() => {
    if (editOpen && list) {
      form.setValue('name', list.name);
      form.setValue('description', list.description ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen, list]);

  const kitsQuery = useGetShoppingListsKitsByListId(
    list ? { path: { list_id: list.id } } : undefined,
    { enabled: Boolean(list) }
  );

  const linkedKits = useMemo(() => mapShoppingListKitLinks(kitsQuery.data), [kitsQuery.data]);

  useListLoadingInstrumentation({
    scope: 'shoppingLists.detail.kits',
    isLoading: kitsQuery.isLoading,
    isFetching: kitsQuery.isFetching,
    error: kitsQuery.error,
    getReadyMetadata: () => ({
      listId: list?.id ?? null,
      kitLinkCount: linkedKits.length,
      statusCounts: linkedKits.reduce<Record<string, number>>(
        (accumulator, kitLink) => {
          accumulator[kitLink.kitStatus] = (accumulator[kitLink.kitStatus] ?? 0) + 1;
          return accumulator;
        },
        { active: 0, archived: 0 }
      ),
      renderLocation: 'body' as const,
    }),
    getErrorMetadata: (error: unknown) => ({
      listId: list?.id ?? null,
      message: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }),
    getAbortedMetadata: () => ({
      listId: list?.id ?? null,
      status: 'aborted',
    }),
  });

  if (!list) {
    return {
      slots: {
        breadcrumbs: (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to={ShoppingListsRoute.fullPath} search={{ search: overviewSearchTerm }} className="hover:text-foreground">
              Shopping Lists
            </Link>
            <span>/</span>
            <span>Loading…</span>
          </div>
        ),
        title: (
          <Skeleton width="w-64" height="h-8" />
        ),
        description: (
          <div className="space-y-2">
            <Skeleton width="w-80" height="h-4" />
            <Skeleton width="w-64" height="h-4" />
          </div>
        ),
        metadataRow: (
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton width="w-24" height="h-6" />
            <Skeleton width="w-20" height="h-6" />
            <Skeleton width="w-20" height="h-6" />
            <Skeleton width="w-24" height="h-6" />
          </div>
        ),
        linkChips: (
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton variant="circular" width="w-32" height="h-6" />
            <Skeleton variant="circular" width="w-28" height="h-6" />
          </div>
        ),
      },
      overlays: null,
      kitsQuery,
    };
  }

  const isCompleted = list.status === 'done';

  const newCount = list.lineCounts.new;
  const orderedCount = list.lineCounts.ordered;
  const doneCount = list.lineCounts.done;

  const slots: ShoppingListDetailHeaderSlots = {
    breadcrumbs: (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="shopping-lists.concept.header.breadcrumb">
        <Link to={ShoppingListsRoute.fullPath} search={{ search: overviewSearchTerm }} className="hover:text-foreground">
          Shopping Lists
        </Link>
        <span>/</span>
        <span className="text-foreground">{list.name}</span>
      </div>
    ),
    title: (
      <span data-testid="shopping-lists.concept.header.name">
        {list.name}
      </span>
    ),
    titleMetadata: (
      <StatusBadge
        {...getShoppingListStatusBadgeProps(list.status)}
        size="large"
        testId="shopping-lists.concept.header.status"
      />
    ),
    description: list.description ? (
      <p className="max-w-2xl text-sm text-muted-foreground" data-testid="shopping-lists.concept.header.description">
        {list.description}
      </p>
    ) : null,
    metadataRow: (
      <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="shopping-lists.concept.header.badges">
        <KeyValueBadge
          label="Total"
          value={list.totalLines}
          color="neutral"
          testId="shopping-lists.concept.header.badge.total"
        />
        <KeyValueBadge
          label="New"
          value={newCount}
          color="info"
          testId="shopping-lists.concept.header.badge.new"
        />
        <KeyValueBadge
          label="Ordered"
          value={orderedCount}
          color="warning"
          testId="shopping-lists.concept.header.badge.ordered"
        />
        <KeyValueBadge
          label="Completed"
          value={doneCount}
          color="success"
          testId="shopping-lists.concept.header.badge.done"
        />
      </div>
    ),
    linkChips: kitsQuery.isLoading ? (
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton variant="circular" width="w-32" height="h-6" />
        <Skeleton variant="circular" width="w-28" height="h-6" />
      </div>
    ) : linkedKits.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2" data-testid="shopping-lists.concept.body.kits">
        {linkedKits.map((kitLink) => (
          <KitLinkChip
            key={kitLink.linkId}
            kitId={kitLink.kitId}
            name={kitLink.kitName}
            status={kitLink.kitStatus}
            testId={`shopping-lists.concept.body.kits.${kitLink.kitId}`}
            onUnlink={onUnlinkKit ? () => onUnlinkKit(kitLink) : undefined}
            unlinkLoading={unlinkingLinkId === kitLink.linkId}
            unlinkTestId={`shopping-lists.concept.body.kits.${kitLink.kitId}.unlink`}
          />
        ))}
      </div>
    ) : null,
    actions: (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => setEditOpen(true)}
          disabled={isUpdating || isCompleted}
          data-testid="shopping-lists.concept.header.edit"
          title={isCompleted ? 'Completed lists are read-only' : undefined}
        >
          Edit List
        </Button>
        {onDeleteList && (
          <Button
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDeleteList}
            loading={isDeletingList}
            disabled={isDeletingList}
            data-testid="shopping-lists.concept.header.delete"
          >
            Delete list
          </Button>
        )}
      </div>
    ),
  };

  const overlays = (
    <Dialog
      open={editOpen}
      onOpenChange={setEditOpen}
      contentProps={{ 'data-testid': 'shopping-lists.concept.edit.dialog' } as DialogContentProps}
    >
      <DialogContent>
        <Form onSubmit={form.handleSubmit} data-testid="shopping-lists.concept.edit.form">
          <DialogHeader>
            <DialogTitle>Edit list details</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <FormField>
              <FormLabel required>Name</FormLabel>
              <Input
                maxLength={NAME_LIMIT}
                placeholder="Concept list name"
                value={form.values.name}
                onChange={(event) => form.setValue('name', event.target.value)}
                onBlur={() => form.setFieldTouched('name')}
                error={form.errors.name}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {form.values.name.trim().length}/{NAME_LIMIT} characters
              </p>
            </FormField>

            <FormField>
              <FormLabel>Description</FormLabel>
              <textarea
                className={cn(
                  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                  'ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-hidden',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50 min-h-[96px]'
                )}
                maxLength={DESCRIPTION_LIMIT}
                value={form.values.description}
                onChange={(event) => form.setValue('description', event.target.value)}
                onBlur={() => form.setFieldTouched('description')}
                aria-invalid={form.errors.description ? 'true' : undefined}
                data-testid="shopping-lists.concept.edit.description"
              />
              {form.errors.description && (
                <p className="mt-1 text-sm text-destructive">{form.errors.description}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {form.values.description.trim().length}/{DESCRIPTION_LIMIT} characters
              </p>
            </FormField>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              preventValidation
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={isUpdating}
              disabled={isUpdating || !form.isValid}
            >
              Save changes
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );

  return { slots, overlays, kitsQuery };
}
