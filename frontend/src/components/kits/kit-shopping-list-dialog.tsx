import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  type DialogContentProps,
} from '@/components/ui/dialog';
import { Form, FormDescription, FormError, FormField, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ShoppingListSelector } from '@/components/shopping-lists/shopping-list-selector';
import { useFormState } from '@/hooks/use-form-state';
import { useFormInstrumentation, type UseFormInstrumentationResult } from '@/hooks/use-form-instrumentation';
import {
  mapKitShoppingListLinkResponse,
  useKitShoppingListLinkMutation,
} from '@/hooks/use-kit-shopping-list-links';
import type { KitContentRow, KitDetail } from '@/types/kits';
import { emitTestEvent } from '@/lib/test/event-emitter';
import type { UiStateTestEvent } from '@/types/test-events';
import type { ShoppingListStatus } from '@/types/shopping-lists';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/api/api-error';

const FLOW_SCOPE = 'kits.detail.shoppingListFlow';
const FORM_ID = 'KitShoppingList:link';
const SHOPPING_LIST_STATUSES: ShoppingListStatus[] = ['concept'];

interface KitShoppingListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kit: KitDetail;
  contents: KitContentRow[];
}

interface FormValues extends Record<string, unknown> {
  listId: number | null;
  requestedUnits: string;
  honorReserved: boolean;
}

const emitUiState = (payload: Omit<UiStateTestEvent, 'timestamp'>) => emitTestEvent(payload);

interface ShoppingListFlowSnapshot extends Record<string, unknown> {
  kitId: number;
  listId: number | null;
  requestedUnits: number;
  honorReserved: boolean;
}

type FlowPhase = Extract<UiStateTestEvent['phase'], 'open' | 'submit' | 'success' | 'error'>;

function emitFlowEvent(phase: FlowPhase, metadata: Record<string, unknown>): void {
  emitUiState({
    kind: 'ui_state',
    scope: FLOW_SCOPE,
    phase,
    metadata,
  });
}

export function KitShoppingListDialog({
  open,
  onOpenChange,
  kit,
  contents,
}: KitShoppingListDialogProps) {
  const { showSuccess, showInfo, showWarning, showException } = useToast();
  const instrumentationRef = useRef<UseFormInstrumentationResult<ShoppingListFlowSnapshot> | null>(null);
  const mutation = useKitShoppingListLinkMutation();

  const form = useFormState<FormValues>({
    initialValues: {
      listId: null,
      requestedUnits: String(Math.max(kit.buildTarget, 1)),
      honorReserved: true,
    },
    validationRules: (
      {
        listId: (value) => {
          if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return undefined;
          }
          return 'Select a Concept list';
        },
        requestedUnits: (value) => {
          const trimmed = String(value ?? '').trim();
          if (!trimmed) {
            return 'Enter requested units';
          }
          const parsed = Number.parseInt(trimmed, 10);
          if (!Number.isFinite(parsed) || parsed < 1) {
            return 'Requested units must be an integer of at least 1';
          }
          if (!Number.isInteger(parsed)) {
            return 'Requested units must be a whole number';
          }
          return undefined;
        },
      } as { [K in keyof FormValues]?: (value: unknown) => string | undefined }
    ),
    onSubmit: async (values) => {
      const requestedUnits = Math.max(Number.parseInt(values.requestedUnits, 10) || 0, 0);
      const initialListId = typeof values.listId === 'number' ? values.listId : null;
      const honorReserved = Boolean(values.honorReserved);

      const snapshot: ShoppingListFlowSnapshot = {
        kitId: kit.id,
        listId: initialListId,
        requestedUnits,
        honorReserved,
      };

      instrumentationRef.current?.trackSubmit(snapshot);
      emitFlowEvent('submit', {
        kitId: kit.id,
        action: 'order',
        targetListId: initialListId,
        requestedUnits,
        honorReserved,
      });

      if (initialListId === null) {
        instrumentationRef.current?.trackError(snapshot);
        emitFlowEvent('error', {
          kitId: kit.id,
          action: 'order',
          targetListId: null,
          requestedUnits,
          honorReserved,
          message: 'Concept list selection missing',
        });
        showWarning('Select a Concept list before ordering stock.');
        return;
      }

      try {
        const response = await mutation.mutateAsync({
          kitId: kit.id,
          shoppingListId: initialListId,
          requestedUnits,
          honorReserved,
          notePrefix: null
        });

        const mapped = mapKitShoppingListLinkResponse(response, initialListId);
        instrumentationRef.current?.trackSuccess(snapshot);
        emitFlowEvent('success', {
          kitId: kit.id,
          action: 'order',
          targetListId: mapped.shoppingListId,
          requestedUnits,
          honorReserved,
          noop: mapped.noop,
          linesModified: mapped.linesModified,
          totalNeededQuantity: mapped.totalNeededQuantity,
        });

        if (mapped.noop) {
          showInfo('Shopping list already up to date – no stock changes were required.');
        } else if (mapped.link?.name) {
          const unitsLabel = mapped.totalNeededQuantity === 1 ? 'unit' : 'units';
          showSuccess(`Queued ${mapped.totalNeededQuantity} ${unitsLabel} for "${mapped.link.name}".`);
        } else if (mapped.shoppingListId) {
          const unitsLabel = mapped.totalNeededQuantity === 1 ? 'unit' : 'units';
          showSuccess(`Queued ${mapped.totalNeededQuantity} ${unitsLabel} for Concept list #${mapped.shoppingListId}.`);
        } else {
          showSuccess('Queued stock for Concept list.');
        }

        handleDialogOpenChange(false);
      } catch (error) {
        instrumentationRef.current?.trackError(snapshot);
        const message =
          error instanceof Error ? error.message : 'Failed to order stock from kit contents';
        emitFlowEvent('error', {
          kitId: kit.id,
          action: 'order',
          targetListId: initialListId,
          requestedUnits,
          honorReserved,
          message,
          status: error instanceof ApiError ? error.status : undefined,
        });

        if (error instanceof ApiError && error.status === 404) {
          showWarning('The selected shopping list could not be found. Please refresh and try again.');
        } else {
          showException('Failed to order stock from kit contents', error);
        }
        throw error;
      }
    },
  });

  const parsedUnits = useMemo(() => {
    const trimmed = form.values.requestedUnits.trim();
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }
    return Math.trunc(parsed);
  }, [form.values.requestedUnits]);

  const hasBOM = contents.length > 0;
  const isSubmitDisabled =
    mutation.isPending ||
    form.isSubmitting ||
    !hasBOM ||
    parsedUnits < 1 ||
    typeof form.values.listId !== 'number' ||
    Boolean(form.errors.listId) ||
    Boolean(form.errors.requestedUnits);

  const selectorInstrumentation = useMemo(
    () => ({
      scope: 'kits.detail.shoppingLists',
      getReadyMetadata: () => ({ kitId: kit.id }),
      getErrorMetadata: (error: unknown) => ({
        kitId: kit.id,
        message: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
      }),
      getAbortedMetadata: () => ({ kitId: kit.id, reason: 'dialog-closed' }),
    }),
    [kit.id]
  );

  const instrumentation = useFormInstrumentation<ShoppingListFlowSnapshot>({
    formId: FORM_ID,
    isOpen: open,
    snapshotFields: () => ({
      kitId: kit.id,
      listId: form.values.listId ?? null,
      requestedUnits: parsedUnits,
      honorReserved: form.values.honorReserved,
    }),
  });

  instrumentationRef.current = instrumentation;

  const lastOpenRef = useRef(open);
  useEffect(() => {
    if (open && !lastOpenRef.current) {
      const defaultUnits = Math.max(kit.buildTarget, 1);
      form.reset();
      form.setValue('listId', null);
      form.setValue('honorReserved', true);
      form.setValue('requestedUnits', String(defaultUnits));
      emitFlowEvent('open', {
        kitId: kit.id,
        action: 'order',
        targetListId: null,
        requestedUnits: defaultUnits,
        honorReserved: true,
      });
    }
    lastOpenRef.current = open;
  }, [form, kit.buildTarget, kit.id, open]);

  useEffect(() => {
    if (!open) {
      form.reset();
    }
  }, [form, open]);

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        if (mutation.isPending) {
          return;
        }
        onOpenChange(false);
        return;
      }
      onOpenChange(true);
    },
    [mutation.isPending, onOpenChange]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={handleDialogOpenChange}
      contentProps={{ 'data-testid': 'kits.detail.shopping-list.dialog' } as DialogContentProps}
    >
      <DialogContent className="max-w-3xl">
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit(event);
          }}
          data-testid="kits.detail.shopping-list.form"
          className="space-y-6"
        >
          <DialogHeader>
            <DialogTitle>Order stock to a Concept list</DialogTitle>
            <DialogDescription>
              Push the kit&rsquo;s shortfalls to a shopping list. Honor reservations to
              avoid reallocating parts already committed to other kits.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 md:grid-cols-2">
            <FormField className="space-y-1">
              <FormLabel htmlFor="kits-detail-shopping-list-units" required>
                Requested units
              </FormLabel>
              <Input
                id="kits-detail-shopping-list-units"
                inputMode="numeric"
                pattern="[0-9]*"
                min={1}
                step={1}
                value={form.values.requestedUnits}
                onChange={(event) => form.setValue('requestedUnits', event.target.value)}
                onBlur={() => form.setFieldTouched('requestedUnits')}
                disabled={mutation.isPending || !hasBOM}
                data-testid="kits.detail.shopping-list.units"
              />
              <FormDescription>
                Default aligns with the kit build target ({kit.buildTarget} units).
              </FormDescription>
              <FormError message={form.touched.requestedUnits ? form.errors.requestedUnits : undefined} />
            </FormField>

            <FormField>
              <div className="flex items-start gap-3">
                <input
                  id="kits-detail-shopping-list-honor"
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  checked={form.values.honorReserved}
                  onChange={(event) => form.setValue('honorReserved', event.target.checked)}
                  disabled={mutation.isPending || !hasBOM}
                  data-testid="kits.detail.shopping-list.honor-reservations"
                />
                <div className="space-y-1">
                  <FormLabel htmlFor="kits-detail-shopping-list-honor">Honor reservations</FormLabel>
                  <FormDescription>
                    Keep existing kit reservations intact. Uncheck to ignore reservations when ordering stock.
                  </FormDescription>
                </div>
              </div>
            </FormField>
          </div>

          <FormField className="space-y-1">
            <FormLabel required>Concept list</FormLabel>
            <div data-testid="kits.detail.shopping-list.selector">
              <ShoppingListSelector
                value={form.values.listId ?? undefined}
                onChange={(value) => {
                  form.setValue('listId', typeof value === 'number' ? value : null);
                  form.setFieldTouched('listId');
                }}
                statuses={SHOPPING_LIST_STATUSES}
                enableCreate
                enabled={open && hasBOM}
                disabled={mutation.isPending || !hasBOM}
                instrumentation={selectorInstrumentation}
                placeholder="Search or create a Concept list"
                error={form.touched.listId ? form.errors.listId : undefined}
                onListCreated={({ id }) => {
                  form.setValue('listId', id);
                  form.setFieldTouched('listId');
                }}
              />
            </div>
            <FormDescription>
              Inline create will open a Concept list dialog without leaving this flow.
            </FormDescription>
          </FormField>

          <DialogFooter className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
              disabled={mutation.isPending}
              data-testid="kits.detail.shopping-list.cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitDisabled}
              loading={mutation.isPending}
              data-testid="kits.detail.shopping-list.submit"
            >
              Order stock
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
