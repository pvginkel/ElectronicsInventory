import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, type DialogContentProps } from '@/components/ui/dialog';
import { Form, FormField, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useFormState } from '@/hooks/use-form-state';
import type { ShoppingListDetail } from '@/types/shopping-lists';
import { useToast } from '@/hooks/use-toast';
import { Route as ShoppingListsRoute } from '@/routes/shopping-lists/';

interface ConceptHeaderProps {
  list?: ShoppingListDetail;
  onUpdateMetadata: (update: { name: string; description: string | null }) => Promise<void>;
  isUpdating: boolean;
  onDeleteList?: () => void;
  isDeletingList?: boolean;
  overviewSearchTerm?: string;
}

interface MetadataFormValues extends Record<string, unknown> {
  name: string;
  description: string;
}

const NAME_LIMIT = 120;
const DESCRIPTION_LIMIT = 280;

const STATUS_BADGE_VARIANT: Record<ShoppingListDetail['status'], 'default' | 'secondary' | 'outline'> = {
  concept: 'default',
  ready: 'secondary',
  done: 'outline',
};

const STATUS_LABELS: Record<ShoppingListDetail['status'], string> = {
  concept: 'Concept',
  ready: 'Ready',
  done: 'Completed',
};

export function ConceptHeader({
  list,
  onUpdateMetadata,
  isUpdating,
  onDeleteList,
  isDeletingList,
  overviewSearchTerm = '',
}: ConceptHeaderProps) {
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

  if (!list) {
    return (
      <div className="space-y-4" data-testid="shopping-lists.concept.header.loading">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to={ShoppingListsRoute.fullPath} search={{ search: overviewSearchTerm }} className="hover:text-foreground">Shopping Lists</Link>
          <span>/</span>
          <span>Loading…</span>
        </div>
        <div className="h-8 w-64 rounded bg-muted animate-pulse" />
        <div className="h-4 w-80 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  const statusLabel = STATUS_LABELS[list.status] ?? list.status;
  const statusVariant = STATUS_BADGE_VARIANT[list.status] ?? 'secondary';
  const isCompleted = list.status === 'done';

  const newCount = list.lineCounts.new;
  const orderedCount = list.lineCounts.ordered;
  const doneCount = list.lineCounts.done;

  return (
    <div className="space-y-4" data-testid="shopping-lists.concept.header">
      <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="shopping-lists.concept.header.breadcrumb">
        <Link to={ShoppingListsRoute.fullPath} search={{ search: overviewSearchTerm }} className="hover:text-foreground">Shopping Lists</Link>
        <span>/</span>
        <span className="text-foreground">{list.name}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold text-foreground" data-testid="shopping-lists.concept.header.name">
              {list.name}
            </h1>
            <Badge
              variant={statusVariant}
              title={`List status: ${statusLabel}`}
              data-testid="shopping-lists.concept.header.status"
            >
              {statusLabel}
            </Badge>
          </div>
          {list.description ? (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground" data-testid="shopping-lists.concept.header.description">
              {list.description}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground italic" data-testid="shopping-lists.concept.header.description.empty">
              No description yet. Use “Edit details” to add context for collaborators.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setEditOpen(true)}
            disabled={isUpdating || isCompleted}
            data-testid="shopping-lists.concept.header.edit"
            title={isCompleted ? 'Completed lists are read-only' : undefined}
          >
            Edit details
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
      </div>

      <div className="flex flex-wrap gap-6 text-sm text-muted-foreground" data-testid="shopping-lists.concept.header.counts">
        <div title="Total lines across all statuses">
          <span className="font-medium text-foreground">{list.totalLines}</span> total lines
        </div>
        <div title="Lines waiting to be ordered">
          <span className="font-medium text-foreground">{newCount}</span> new
        </div>
        <div title="Lines in progress with suppliers">
          <span className="font-medium text-foreground">{orderedCount}</span> ordered
        </div>
        <div title="Lines already received">
          <span className="font-medium text-foreground">{doneCount}</span> received
        </div>
      </div>

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
                    'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none',
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
    </div>
  );
}
