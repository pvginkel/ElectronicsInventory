import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, type DialogContentProps } from '@/components/ui/dialog';
import { Form, FormField, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFormState } from '@/hooks/use-form-state';
import { useFormInstrumentation, type UseFormInstrumentationResult } from '@/hooks/use-form-instrumentation';
import { trackFormValidationError } from '@/lib/test/form-instrumentation';
import { useToast } from '@/hooks/use-toast';
import { usePatchKitsByKitId, type KitDetailResponseSchema_b98797e, type KitResponseSchema_b98797e, type KitSummarySchemaList_a9993e3, type KitSummarySchemaList_a9993e3_KitStatus, type KitUpdateSchema_b98797e } from '@/lib/api/generated/hooks';
import { useQueryClient } from '@tanstack/react-query';
import type { KitDetail } from '@/types/kits';
import { buildKitDetailQueryKey } from '@/hooks/use-kit-detail';

interface KitMetadataDialogProps {
  open: boolean;
  kit: KitDetail;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface KitMetadataFormValues extends Record<string, unknown> {
  name: string;
  description: string;
  buildTarget: string;
}

interface KitMetadataSnapshot extends Record<string, unknown> {
  kitId: number;
  buildTarget: number;
  nameChanged: boolean;
  buildTargetChanged: boolean;
}

const NAME_LIMIT = 120;
const DESCRIPTION_LIMIT = 280;
const FORM_ID = 'KitDetail:metadata';

function normalizeWhitespace(value: string): string {
  return value.trim();
}

function parseBuildTarget(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

function collectValidationErrors(values: KitMetadataFormValues) {
  const trimmedName = normalizeWhitespace(String(values.name ?? ''));
  const trimmedDescription = normalizeWhitespace(String(values.description ?? ''));
  const parsedBuildTarget = parseBuildTarget(String(values.buildTarget ?? ''));

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
    buildTarget: parsedBuildTarget < 0 ? 'Build target must be 0 or greater' : undefined,
  } as Record<string, string | undefined>;
}

function toSnapshot(values: KitMetadataFormValues, baseline: { name: string; buildTarget: number }, kitId: number): KitMetadataSnapshot {
  const trimmedName = normalizeWhitespace(String(values.name ?? ''));
  const parsedBuildTarget = parseBuildTarget(values.buildTarget);
  const safeBuildTarget = parsedBuildTarget > 0 ? parsedBuildTarget : baseline.buildTarget;
  return {
    kitId,
    buildTarget: safeBuildTarget,
    nameChanged: trimmedName !== baseline.name,
    buildTargetChanged: safeBuildTarget !== baseline.buildTarget,
  };
}

function applyDetailOptimisticUpdate(
  current: KitDetailResponseSchema_b98797e | undefined,
  updates: { name: string; description: string | null; build_target: number }
): KitDetailResponseSchema_b98797e | undefined {
  if (!current) {
    return current;
  }
  return {
    ...current,
    name: updates.name,
    description: updates.description,
    build_target: updates.build_target,
  };
}

function mergeDetailWithResponse(
  previous: KitDetailResponseSchema_b98797e | undefined,
  response: KitResponseSchema_b98797e
): KitDetailResponseSchema_b98797e | undefined {
  if (!previous) {
    return previous;
  }
  return {
    ...previous,
    name: response.name,
    description: response.description,
    build_target: response.build_target,
    updated_at: response.updated_at,
    archived_at: response.archived_at,
    status: response.status,
    shopping_list_badge_count: response.shopping_list_badge_count ?? previous.shopping_list_badge_count,
    pick_list_badge_count: response.pick_list_badge_count ?? previous.pick_list_badge_count,
  };
}

function applySummaryListUpdate(
  list: KitSummarySchemaList_a9993e3 | undefined,
  kitId: number,
  updates: {
    name: string;
    description: string | null;
    build_target: number;
    updated_at?: string | null;
    status?: KitSummarySchemaList_a9993e3_KitStatus;
  }
): KitSummarySchemaList_a9993e3 | undefined {
  if (!Array.isArray(list)) {
    return list;
  }
  let changed = false;
  const next = list.map((entry) => {
    if (entry.id !== kitId) {
      return entry;
    }
    changed = true;
    return {
      ...entry,
      name: updates.name,
      description: updates.description,
      build_target: updates.build_target,
      updated_at: updates.updated_at ?? entry.updated_at,
      status: updates.status ?? entry.status,
    };
  });
  return changed ? next : list;
}

export function KitMetadataDialog({ open, kit, onOpenChange, onSuccess }: KitMetadataDialogProps) {
  const queryClient = useQueryClient();
  const { showSuccess, showException } = useToast();
  const metadataBaselineRef = useRef<{ name: string; buildTarget: number }>({
    name: normalizeWhitespace(kit.name),
    buildTarget: kit.buildTarget,
  });
  const instrumentationRef = useRef<UseFormInstrumentationResult<KitMetadataSnapshot> | null>(null);
  const pendingSnapshotRef = useRef<KitMetadataSnapshot | null>(null);
  const detailQueryKey = useMemo(() => buildKitDetailQueryKey(kit.id), [kit.id]);
  const mutation = usePatchKitsByKitId();

  const form = useFormState<KitMetadataFormValues>({
    initialValues: {
      name: kit.name,
      description: kit.description ?? '',
      buildTarget: String(kit.buildTarget),
    },
    validationRules: {
      name: (value: unknown) => {
        const trimmed = normalizeWhitespace(String(value ?? ''));
        if (!trimmed) {
          return 'Name is required';
        }
        if (trimmed.length > NAME_LIMIT) {
          return `Name must be ${NAME_LIMIT} characters or fewer`;
        }
        return undefined;
      },
      description: (value: unknown) => {
        const trimmed = normalizeWhitespace(String(value ?? ''));
        if (!trimmed) {
          return undefined;
        }
        if (trimmed.length > DESCRIPTION_LIMIT) {
          return `Description must be ${DESCRIPTION_LIMIT} characters or fewer`;
        }
        return undefined;
      },
      buildTarget: (value: unknown) => {
        const parsed = parseBuildTarget(String(value ?? ''));
        if (parsed < 0) {
          return 'Build target must be 0 or greater';
        }
        return undefined;
      },
    },
    onSubmit: async (values) => {
      if (mutation.isPending) {
        return;
      }
      const trimmedName = normalizeWhitespace(String(values.name ?? ''));
      const trimmedDescriptionRaw = normalizeWhitespace(String(values.description ?? ''));
      const parsedBuildTarget = parseBuildTarget(values.buildTarget);
      const payload: KitUpdateSchema_b98797e = {
        name: trimmedName,
        description: trimmedDescriptionRaw ? trimmedDescriptionRaw : null,
        build_target: parsedBuildTarget,
      };
      const snapshot = instrumentationSnapshot(values);
      pendingSnapshotRef.current = snapshot;
      instrumentationRef.current?.trackSubmit(snapshot);

      try {
        const response = await executeMetadataMutation({
          path: { kit_id: kit.id },
          body: payload,
        });
        instrumentationRef.current?.trackSuccess(snapshot);
        showSuccess(`Updated "${response.name}"`);
        onSuccess();
        handleDialogOpenChange(false);
      } catch (error) {
        instrumentationRef.current?.trackError(snapshot);
        const message = error instanceof Error ? error.message : 'Failed to update kit metadata';
        showException(message, error);
      } finally {
        pendingSnapshotRef.current = null;
      }
    },
  });

  const instrumentationSnapshot = useCallback(
    (values: KitMetadataFormValues): KitMetadataSnapshot => {
      return toSnapshot(values, metadataBaselineRef.current, kit.id);
    },
    [kit.id]
  );

  const instrumentation = useFormInstrumentation<KitMetadataSnapshot>({
    formId: FORM_ID,
    isOpen: open,
    snapshotFields: () => instrumentationSnapshot(form.values),
  });

  instrumentationRef.current = instrumentation;

  useEffect(() => {
    if (!open) {
      return;
    }
    metadataBaselineRef.current = {
      name: normalizeWhitespace(kit.name),
      buildTarget: kit.buildTarget,
    };
    form.reset();
    form.setValue('name', kit.name);
    form.setValue('description', kit.description ?? '');
    form.setValue('buildTarget', String(kit.buildTarget));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit.description, kit.buildTarget, kit.name, open]);

  const executeMetadataMutation = useCallback(
    async (variables: { path: { kit_id: number }; body: KitUpdateSchema_b98797e }) => {
      await queryClient.cancelQueries({ queryKey: detailQueryKey });

      const previousDetail = queryClient.getQueryData<KitDetailResponseSchema_b98797e>(detailQueryKey);
      const overviewSnapshots = queryClient.getQueriesData<KitSummarySchemaList_a9993e3>({ queryKey: ['getKits'] });

      const nextName = variables.body.name ?? kit.name;
      const nextDescription =
        variables.body.description !== undefined ? variables.body.description : kit.description ?? null;
      const nextBuildTarget = variables.body.build_target ?? kit.buildTarget;

      const optimisticDetail = applyDetailOptimisticUpdate(previousDetail, {
        name: nextName,
        description: nextDescription,
        build_target: nextBuildTarget,
      });
      if (optimisticDetail) {
        queryClient.setQueryData(detailQueryKey, optimisticDetail);
      }

      for (const [key, snapshot] of overviewSnapshots) {
        const updated = applySummaryListUpdate(snapshot, kit.id, {
          name: nextName,
          description: nextDescription,
          build_target: nextBuildTarget,
        });
        if (updated !== snapshot) {
          queryClient.setQueryData(key, updated);
        }
      }

      try {
        const response = await mutation.mutateAsync(variables);
        const merged = mergeDetailWithResponse(
          previousDetail ?? queryClient.getQueryData<KitDetailResponseSchema_b98797e>(detailQueryKey),
          response
        );
        if (merged) {
          queryClient.setQueryData(detailQueryKey, merged);
        }

        for (const [key] of overviewSnapshots) {
          const currentList = queryClient.getQueryData<KitSummarySchemaList_a9993e3>(key);
          const updated = applySummaryListUpdate(currentList, kit.id, {
            name: response.name,
            description: response.description,
            build_target: response.build_target,
            updated_at: response.updated_at,
            status: response.status,
          });
          if (updated && updated !== currentList) {
            queryClient.setQueryData(key, updated);
          }
        }

        return response;
      } catch (error) {
        if (previousDetail) {
          queryClient.setQueryData(detailQueryKey, previousDetail);
        }
        for (const [key, snapshot] of overviewSnapshots) {
          queryClient.setQueryData(key, snapshot);
        }
        throw error;
      } finally {
        void queryClient.invalidateQueries({ queryKey: ['getKits'] });
        void queryClient.invalidateQueries({ queryKey: detailQueryKey });
      }
    },
    [detailQueryKey, kit.description, kit.buildTarget, kit.id, kit.name, mutation, queryClient]
  );

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

    const snapshot = instrumentationSnapshot(form.values);
    for (const [field, message] of Object.entries(errors)) {
      if (message) {
        trackFormValidationError(FORM_ID, field, message, snapshot);
      }
    }
  }, [form.values, instrumentationSnapshot]);

  const handleSubmit = useCallback(async () => {
    const syntheticEvent = {
      preventDefault: () => {},
    } as React.FormEvent<HTMLFormElement>;
    await form.handleSubmit(syntheticEvent);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    handleValidationTracking();
  }, [form, handleValidationTracking]);

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        if (mutation.isPending) {
          return;
        }
        onOpenChange(false);
        form.reset();
        form.setValue('name', kit.name);
        form.setValue('description', kit.description ?? '');
        form.setValue('buildTarget', String(kit.buildTarget));
      } else {
        onOpenChange(true);
      }
    },
    [form, kit.description, kit.buildTarget, kit.name, mutation.isPending, onOpenChange]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={handleDialogOpenChange}
      contentProps={{ 'data-testid': 'kits.detail.metadata.dialog' } as DialogContentProps}
    >
      <DialogContent>
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
          data-testid="kits.detail.metadata.form"
        >
          <DialogHeader>
            <DialogTitle>Edit kit metadata</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <FormField>
              <FormLabel htmlFor="kits.detail.metadata.name" required>
                Name
              </FormLabel>
              <Input
                id="kits.detail.metadata.name"
                maxLength={NAME_LIMIT}
                value={form.values.name}
                onChange={(event) => form.setValue('name', event.target.value)}
                onBlur={() => form.setFieldTouched('name')}
                error={form.errors.name}
                data-testid="kits.detail.metadata.field.name"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {normalizeWhitespace(String(form.values.name ?? '')).length}/{NAME_LIMIT} characters
              </p>
            </FormField>

            <FormField>
              <FormLabel htmlFor="kits.detail.metadata.description">
                Description <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </FormLabel>
              <textarea
                id="kits.detail.metadata.description"
                maxLength={DESCRIPTION_LIMIT}
                className={cn(
                  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                  'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50 min-h-[96px]'
                )}
                value={form.values.description}
                onChange={(event) => form.setValue('description', event.target.value)}
                onBlur={() => form.setFieldTouched('description')}
                aria-invalid={form.errors.description ? 'true' : undefined}
                data-testid="kits.detail.metadata.field.description"
              />
              {form.errors.description ? (
                <p className="mt-1 text-sm text-destructive">{form.errors.description}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {normalizeWhitespace(String(form.values.description ?? '')).length}/{DESCRIPTION_LIMIT} characters
              </p>
            </FormField>

            <FormField>
              <FormLabel htmlFor="kits.detail.metadata.build-target" required>
                Build target
              </FormLabel>
              <Input
                id="kits.detail.metadata.build-target"
                type="number"
                min={1}
                value={form.values.buildTarget}
                onChange={(event) => form.setValue('buildTarget', event.target.value)}
                onBlur={() => form.setFieldTouched('buildTarget')}
                error={form.errors.buildTarget}
                data-testid="kits.detail.metadata.field.build-target"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Set the number of complete kits to keep available. Updating this value recalculates BOM shortfalls.
              </p>
            </FormField>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              preventValidation
              onClick={() => handleDialogOpenChange(false)}
              disabled={mutation.isPending}
              data-testid="kits.detail.metadata.cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                void handleSubmit();
              }}
              disabled={mutation.isPending}
              loading={mutation.isPending}
              data-testid="kits.detail.metadata.submit"
            >
              Save changes
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
