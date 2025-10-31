import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useDeleteKitsContentsByKitIdAndContentId,
  usePatchKitsContentsByKitIdAndContentId,
  usePostKitsContentsByKitId,
  type KitContentDetailSchema_b98797e,
  type KitDetailResponseSchema_b98797e,
  type PartWithTotalSchemaList_a9993e3,
} from '@/lib/api/generated/hooks';
import { ApiError } from '@/lib/api/api-error';
import { useToast } from '@/hooks/use-toast';
import { useFormInstrumentation, type UseFormInstrumentationResult } from '@/hooks/use-form-instrumentation';
import { trackFormSubmit, trackFormSuccess, trackFormError } from '@/lib/test/form-instrumentation';
import type { UseKitDetailResult } from '@/hooks/use-kit-detail';
import type { PartSelectorSummary } from '@/hooks/use-parts-selector';
import type { KitContentRow, KitDetail } from '@/types/kits';

type KitDetailQuery = UseKitDetailResult['query'];

export interface KitContentFormMetadata extends Record<string, unknown> {
  kitId: number;
  contentId?: number | null;
  partKey?: string | null;
  phase: 'idle' | 'pending' | 'success' | 'error' | 'conflict';
}

export interface CreateDraft {
  partKey?: string;
  partId: number | null;
  partLabel?: string;
  requiredPerUnit: string;
  note: string;
}

export interface CreateErrors {
  [key: string]: string | undefined;
  partKey?: string;
  requiredPerUnit?: string;
  note?: string;
  form?: string;
}

export interface UpdateDraft {
  contentId: number;
  version: number;
  requiredPerUnit: string;
  note: string;
}

export interface UpdateErrors {
  [key: string]: string | undefined;
  requiredPerUnit?: string;
  note?: string;
  form?: string;
  conflict?: string;
}

export interface PendingCreateRow {
  tempId: 'temp-create';
  partKey: string;
  partId: number;
  requiredPerUnit: number;
  note: string | null;
  status: 'creating' | 'refetching';
  partLabel?: string;
}

export interface PendingUpdateDraft {
  contentId: number;
  requiredPerUnit: number;
  note: string | null;
  status: 'updating' | 'refetching';
}

interface UseKitContentsOptions {
  detail: KitDetail;
  contents: KitContentRow[];
  query: KitDetailQuery;
}

interface CreateControls {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  draft: CreateDraft;
  errors: CreateErrors;
  isSubmitting: boolean;
  setPartSelection: (summary: PartSelectorSummary | undefined) => void;
  setRequiredPerUnit: (value: string) => void;
  setNote: (value: string) => void;
  submit: () => Promise<void>;
  instrumentation: UseFormInstrumentationResult<KitContentFormMetadata>;
}

interface EditControls {
  editingRowId: number | null;
  start: (row: KitContentRow) => void;
  cancel: () => void;
  draft: UpdateDraft | null;
  errors: UpdateErrors | null;
  isSubmitting: boolean;
  setRequiredPerUnit: (value: string) => void;
  setNote: (value: string) => void;
  submit: () => Promise<void>;
  instrumentation: UseFormInstrumentationResult<KitContentFormMetadata>;
}

interface DeleteControls {
  confirmRowId: number | null;
  confirmRow: KitContentRow | null;
  open: (row: KitContentRow) => void;
  close: () => void;
  isSubmitting: boolean;
  instrumentation: UseFormInstrumentationResult<KitContentFormMetadata>;
}

export interface UseKitContentsResult {
  kitId: number;
  kitName: string;
  isArchived: boolean;
  existingPartKeys: string[];
  create: CreateControls;
  edit: EditControls;
  remove: DeleteControls;
  overlays: {
    pendingCreateRow: PendingCreateRow | null;
    pendingUpdates: Map<number, PendingUpdateDraft>;
    pendingDeleteId: number | null;
  };
  isMutationPending: boolean;
}

const INITIAL_CREATE_DRAFT: CreateDraft = {
  partKey: undefined,
  partId: null,
  partLabel: undefined,
  requiredPerUnit: '',
  note: '',
};

const KIT_CONTENT_CREATE_FORM_ID = 'KitContent:create';
const KIT_CONTENT_UPDATE_FORM_ID = 'KitContent:update';
const KIT_CONTENT_DELETE_FORM_ID = 'KitContent:delete';

export function useKitContents({ detail, contents, query }: UseKitContentsOptions): UseKitContentsResult {
  const queryClient = useQueryClient();
  const { showSuccess, showException } = useToast();

  const kitId = detail.id;
  const kitName = detail.name;
  const isArchived = detail.status === 'archived';
  const kitQueryKey = useMemo(
    () => ['getKitsByKitId', { path: { kit_id: kitId } }] as const,
    [kitId]
  );

  const [isAdding, setIsAdding] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>(INITIAL_CREATE_DRAFT);
  const [createErrors, setCreateErrors] = useState<CreateErrors>({});
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);

  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [editDraft, setEditDraftState] = useState<UpdateDraft | null>(null);
  const [editErrors, setEditErrors] = useState<UpdateErrors | null>(null);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const syncEditDraftRef = useRef(false);

  const [confirmRowId, setConfirmRowId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);

  // Undo support for deletion - using Map to support concurrent deletions
  interface DeletedContentSnapshot {
    contentId: number;
    kitId: number;
    partId: number;
    partKey: string;
    requiredPerUnit: number;
    note: string | null;
  }
  const deletedContentSnapshotsRef = useRef<Map<number, DeletedContentSnapshot>>(new Map());
  const undoInFlightRef = useRef(false);

  const [pendingCreateRow, setPendingCreateRow] = useState<PendingCreateRow | null>(null);
  const [pendingUpdates, setPendingUpdates] = useState<Map<number, PendingUpdateDraft>>(() => new Map());

  const createMutation = usePostKitsContentsByKitId({ onSuccess: () => {} });
  const updateMutation = usePatchKitsContentsByKitIdAndContentId({ onSuccess: () => {} });
  const deleteMutation = useDeleteKitsContentsByKitIdAndContentId({ onSuccess: () => {} });

  const resolvePartId = useCallback(
    async (partKey: string | undefined): Promise<number | null> => {
      if (!partKey) {
        return null;
      }
      const cachedParts = queryClient.getQueryData<PartWithTotalSchemaList_a9993e3>(['getParts', undefined]);
      if (cachedParts?.length) {
        for (const entry of cachedParts) {
          const keyCandidate = (entry as { key?: string }).key ?? (entry as { part_key?: string }).part_key;
          if (keyCandidate !== partKey) {
            continue;
          }
          if ('id' in entry && typeof (entry as { id?: unknown }).id === 'number') {
            return (entry as { id: number }).id;
          }
          if ('part_id' in entry && typeof (entry as { part_id?: unknown }).part_id === 'number') {
            return (entry as { part_id: number }).part_id;
          }
        }
      }
      try {
        const response = await fetch(`/api/parts/${encodeURIComponent(partKey)}/kit-reservations`);
        if (!response.ok) {
          return null;
        }
        const payload = (await response.json()) as Record<string, unknown>;
        if (typeof payload.part_id === 'number') {
          return payload.part_id as number;
        }
        return null;
      } catch {
        return null;
      }
      return null;
    },
    [queryClient]
  );

  const editingRow = useMemo(
    () => (editingRowId === null ? null : contents.find((row) => row.id === editingRowId) ?? null),
    [contents, editingRowId]
  );

  const confirmRow = useMemo(
    () => (confirmRowId === null ? null : contents.find((row) => row.id === confirmRowId) ?? null),
    [confirmRowId, contents]
  );

  useEffect(() => {
    if (!editingRow) {
      setEditDraftState(null);
      setEditErrors(null);
      return;
    }

    if (syncEditDraftRef.current || editDraft === null || editDraft.contentId !== editingRow.id) {
      setEditDraftState({
        contentId: editingRow.id,
        version: editingRow.version,
        requiredPerUnit: editingRow.requiredPerUnit.toString(),
        note: editingRow.note ?? '',
      });
      syncEditDraftRef.current = false;
      setEditErrors(null);
      return;
    }

    if (editingRow.version !== editDraft.version) {
      setEditDraftState((previous) =>
        previous
          ? {
              ...previous,
              version: editingRow.version,
              requiredPerUnit: editingRow.requiredPerUnit.toString(),
              note: editingRow.note ?? '',
            }
          : previous
      );
    }
  }, [editDraft, editingRow, isEditSubmitting]);

  useEffect(() => {
    if (confirmRowId !== null && !confirmRow) {
      setConfirmRowId(null);
    }
  }, [confirmRow, confirmRowId]);

  useEffect(() => {
    if (!pendingCreateRow) {
      return;
    }
    if (!createMutation.isPending && pendingCreateRow.status === 'creating') {
      setPendingCreateRow((previous) =>
        previous ? { ...previous, status: 'refetching' } : previous
      );
    }
  }, [createMutation.isPending, pendingCreateRow]);

  useEffect(() => {
    if (!isEditSubmitting) {
      setPendingUpdates((previous) => {
        const next = new Map(previous);
        for (const [rowId, pending] of previous) {
          if (pending.status === 'updating') {
            next.set(rowId, { ...pending, status: 'refetching' });
          }
        }
        return next;
      });
    }
  }, [isEditSubmitting]);

  const existingPartKeys = useMemo(() => {
    const keys = new Set<string>();
    contents.forEach((row) => {
      if (row.part?.key) {
        keys.add(row.part.key);
      }
    });
    if (pendingCreateRow) {
      keys.add(pendingCreateRow.partKey);
    }
    return Array.from(keys);
  }, [contents, pendingCreateRow]);

  const buildCreateMetadata = useCallback(
    (phase: KitContentFormMetadata['phase']): KitContentFormMetadata => ({
      kitId,
      contentId: pendingCreateRow?.status === 'refetching' ? null : null,
      partKey: createDraft.partKey ?? pendingCreateRow?.partKey ?? null,
      phase,
    }),
    [createDraft.partKey, kitId, pendingCreateRow]
  );

  const buildEditMetadata = useCallback(
    (phase: KitContentFormMetadata['phase']): KitContentFormMetadata => ({
      kitId,
      contentId: editingRowId,
      partKey: editingRow?.part.key ?? null,
      phase,
    }),
    [editingRow?.part.key, editingRowId, kitId]
  );

  const buildDeleteMetadata = useCallback(
    (phase: KitContentFormMetadata['phase']): KitContentFormMetadata => ({
      kitId,
      contentId: confirmRowId,
      partKey: confirmRow?.part.key ?? null,
      phase,
    }),
    [confirmRow?.part.key, confirmRowId, kitId]
  );

  const createInstrumentation = useFormInstrumentation<KitContentFormMetadata>({
    formId: KIT_CONTENT_CREATE_FORM_ID,
    isOpen: isAdding,
    snapshotFields: () => buildCreateMetadata(isCreateSubmitting ? 'pending' : 'idle'),
  });

  const updateInstrumentation = useFormInstrumentation<KitContentFormMetadata>({
    formId: KIT_CONTENT_UPDATE_FORM_ID,
    isOpen: editingRowId !== null,
    snapshotFields: () => buildEditMetadata(isEditSubmitting ? 'pending' : 'idle'),
  });

  const deleteInstrumentation = useFormInstrumentation<KitContentFormMetadata>({
    formId: KIT_CONTENT_DELETE_FORM_ID,
    isOpen: confirmRowId !== null,
    snapshotFields: () => buildDeleteMetadata(isDeleteSubmitting ? 'pending' : 'idle'),
  });

  const resetCreateDraft = useCallback(() => {
    setCreateDraft(INITIAL_CREATE_DRAFT);
    setCreateErrors({});
  }, []);

  const openCreate = useCallback(() => {
    if (isArchived) {
      showException('Cannot add parts to an archived kit', new Error('Kit archived'));
      return;
    }
    setIsAdding(true);
    setCreateErrors({});
  }, [isArchived, showException]);

  const closeCreate = useCallback(() => {
    setIsAdding(false);
    resetCreateDraft();
    setPendingCreateRow(null);
  }, [resetCreateDraft]);

  const setCreatePartSelection = useCallback((summary: PartSelectorSummary | undefined) => {
    const derivedPartId = (() => {
      if (!summary) {
        return null;
      }
      if (typeof summary.partId === 'number' && Number.isFinite(summary.partId)) {
        return summary.partId;
      }
      const raw = summary.raw as Record<string, unknown> | undefined;
      if (!raw) {
        return null;
      }
      if (typeof raw.id === 'number') {
        return raw.id;
      }
      if (typeof raw.part_id === 'number') {
        return raw.part_id as number;
      }
      return null;
    })();
    setCreateDraft((previous) => ({
      ...previous,
      partKey: summary?.id,
      partId: derivedPartId,
      partLabel: summary ? `${summary.displayDescription} (${summary.id})` : undefined,
    }));
    setCreateErrors((previous) => ({ ...previous, partKey: undefined, form: undefined }));

    if (summary?.id && derivedPartId === null) {
      void resolvePartId(summary.id).then((partId) => {
        if (partId === null) {
          return;
        }
        setCreateDraft((previous) => {
          if (previous.partKey !== summary.id) {
            return previous;
          }
          return {
            ...previous,
            partId,
          };
        });
      });
    }
  }, [resolvePartId]);

  const setCreateRequiredPerUnit = useCallback((value: string) => {
    setCreateDraft((previous) => ({ ...previous, requiredPerUnit: value }));
    setCreateErrors((previous) => ({ ...previous, requiredPerUnit: undefined, form: undefined }));
  }, []);

  const setCreateNote = useCallback((value: string) => {
    setCreateDraft((previous) => ({ ...previous, note: value }));
    setCreateErrors((previous) => ({ ...previous, note: undefined, form: undefined }));
  }, []);

  const validateQuantity = useCallback((value: string): string | undefined => {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'Quantity is required';
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      return 'Enter a whole number greater than zero';
    }
    return undefined;
  }, []);

  const normalizeNote = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const appendContentToCache = useCallback(
    (content: KitContentDetailSchema_b98797e) => {
      queryClient.setQueryData<KitDetailResponseSchema_b98797e>(kitQueryKey, (previous) => {
        if (!previous) {
          return previous;
        }
        const contentsList = Array.isArray(previous.contents) ? previous.contents : [];
        const existingIndex = contentsList.findIndex((row) => row.id === content.id);
        let nextContents: KitDetailResponseSchema_b98797e['contents'];
        if (existingIndex === -1) {
          nextContents = [...contentsList, content];
        } else {
          nextContents = contentsList.map((row, index) => (index === existingIndex ? content : row));
        }
        return {
          ...previous,
          contents: nextContents,
        };
      });
    },
    [kitQueryKey, queryClient]
  );

  const replaceContentInCache = useCallback(
    (content: KitContentDetailSchema_b98797e) => {
      queryClient.setQueryData<KitDetailResponseSchema_b98797e>(kitQueryKey, (previous) => {
        if (!previous) {
          return previous;
        }
        const contentsList = Array.isArray(previous.contents) ? previous.contents : [];
        const nextContents = contentsList.map((row) => (row.id === content.id ? content : row));
        return {
          ...previous,
          contents: nextContents,
        };
      });
    },
    [kitQueryKey, queryClient]
  );

  const handleCreateSubmit = useCallback(async () => {
    if (isArchived) {
      showException('Cannot add parts to an archived kit', new Error('Kit archived'));
      return;
    }

    const resolvedPartId = createDraft.partId ?? (await resolvePartId(createDraft.partKey));
    const errors: CreateErrors = {};
    if (!createDraft.partKey || resolvedPartId === null) {
      errors.partKey = 'Select a part to add';
    } else if (existingPartKeys.includes(createDraft.partKey)) {
      errors.partKey = 'This part is already in the kit';
    }
    const quantityError = validateQuantity(createDraft.requiredPerUnit);
    if (quantityError) {
      errors.requiredPerUnit = quantityError;
    }

    if (errors.partKey || errors.requiredPerUnit) {
      setCreateErrors(errors);
      createInstrumentation.trackValidationErrors(errors, buildCreateMetadata('error'));
      return;
    }

    const requiredPerUnit = Number.parseInt(createDraft.requiredPerUnit.trim(), 10);
    const note = normalizeNote(createDraft.note);

    setIsCreateSubmitting(true);
    setCreateErrors({});
    setPendingCreateRow({
      tempId: 'temp-create',
      partKey: createDraft.partKey!,
      partId: resolvedPartId!,
      requiredPerUnit,
      note,
      status: 'creating',
      partLabel: createDraft.partLabel,
    });
    createInstrumentation.trackSubmit({
      kitId,
      contentId: null,
      partKey: createDraft.partKey,
      phase: 'pending',
    });

    try {
      const response = await createMutation.mutateAsync({
        path: { kit_id: kitId },
        body: {
          part_id: resolvedPartId!,
          required_per_unit: requiredPerUnit,
          note,
        },
      });
      appendContentToCache(response);
      const partLabel = createDraft.partLabel ?? createDraft.partKey;
      setPendingCreateRow({
        tempId: 'temp-create',
        partKey: createDraft.partKey!,
        partId: resolvedPartId!,
        requiredPerUnit,
        note,
        status: 'refetching',
        partLabel,
      });
      resetCreateDraft();
      setIsAdding(false);
      await query.refetch();
      setPendingCreateRow(null);
      createInstrumentation.trackSuccess({
        kitId,
        contentId: response.id,
        partKey: response.part?.key ?? createDraft.partKey,
        phase: 'success',
      });
      showSuccess(partLabel ? `Added ${partLabel} to kit` : 'Added part to kit');
    } catch (error) {
      setPendingCreateRow(null);
      setIsAdding(true);
      const apiError = error instanceof ApiError ? error : undefined;
      const message = apiError?.message ?? 'Failed to add part';
      setCreateErrors((previous) => ({ ...previous, form: message }));
      createInstrumentation.trackError({
        kitId,
        contentId: null,
        partKey: createDraft.partKey,
        phase: 'error',
      });
      showException(`Failed to add part to "${kitName}"`, error);
    } finally {
      setIsCreateSubmitting(false);
    }
  }, [
    appendContentToCache,
    buildCreateMetadata,
    createDraft.partId,
    createDraft.partKey,
    createDraft.partLabel,
    createDraft.note,
    createDraft.requiredPerUnit,
    createInstrumentation,
    createMutation,
    existingPartKeys,
    isArchived,
    kitId,
    kitName,
    query,
    resetCreateDraft,
    resolvePartId,
    showException,
    showSuccess,
    validateQuantity,
  ]);

  const startEdit = useCallback(
    (row: KitContentRow) => {
      if (isArchived) {
        showException('Cannot edit parts on an archived kit', new Error('Kit archived'));
        return;
      }
      setEditingRowId(row.id);
      syncEditDraftRef.current = true;
    },
    [isArchived, showException]
  );

  const cancelEdit = useCallback(() => {
    setEditingRowId(null);
    setEditDraftState(null);
    setEditErrors(null);
    setPendingUpdates((previous) => {
      const next = new Map(previous);
      next.delete(editingRowId ?? -1);
      return next;
    });
  }, [editingRowId]);

  const setEditRequiredPerUnit = useCallback((value: string) => {
    setEditDraftState((previous) => (previous ? { ...previous, requiredPerUnit: value } : previous));
    setEditErrors((previous) => (previous ? { ...previous, requiredPerUnit: undefined, form: undefined } : previous));
  }, []);

  const setEditNote = useCallback((value: string) => {
    setEditDraftState((previous) => (previous ? { ...previous, note: value } : previous));
    setEditErrors((previous) => (previous ? { ...previous, note: undefined, form: undefined } : previous));
  }, []);

  const handleEditSubmit = useCallback(async () => {
    if (!editingRow || !editDraft) {
      return;
    }
    if (isArchived) {
      showException('Cannot edit parts on an archived kit', new Error('Kit archived'));
      return;
    }

    const quantityError = validateQuantity(editDraft.requiredPerUnit);
    if (quantityError) {
      const validationErrors: UpdateErrors = { requiredPerUnit: quantityError };
      setEditErrors(validationErrors);
      updateInstrumentation.trackValidationErrors(validationErrors, buildEditMetadata('error'));
      return;
    }

    const requiredPerUnit = Number.parseInt(editDraft.requiredPerUnit.trim(), 10);
    const note = normalizeNote(editDraft.note);
    const version = editDraft.version;

    setIsEditSubmitting(true);
    setEditErrors(null);
    setPendingUpdates((previous) => {
      const next = new Map(previous);
      next.set(editingRow.id, {
        contentId: editingRow.id,
        requiredPerUnit,
        note,
        status: 'updating',
      });
      return next;
    });
    updateInstrumentation.trackSubmit(buildEditMetadata('pending'));

    try {
      const response = await updateMutation.mutateAsync({
        path: { kit_id: kitId, content_id: editingRow.id },
        body: {
          required_per_unit: requiredPerUnit,
          note,
          version,
        },
      });
      replaceContentInCache(response);
      setPendingUpdates((previous) => {
        const next = new Map(previous);
        next.set(editingRow.id, {
          contentId: editingRow.id,
          requiredPerUnit,
          note,
          status: 'refetching',
        });
        return next;
      });
      await query.refetch();
      setPendingUpdates((previous) => {
        const next = new Map(previous);
        next.delete(editingRow.id);
        return next;
      });
      setEditingRowId(null);
      setEditDraftState(null);
      updateInstrumentation.trackSuccess({
        kitId,
        contentId: editingRow.id,
        partKey: editingRow.part.key,
        phase: 'success',
      });
      showSuccess('Updated kit part');
    } catch (error) {
      const apiError = error instanceof ApiError ? error : undefined;
      if (apiError?.status === 409) {
        setEditErrors({ conflict: 'Another user updated this part. Showing the latest values.' });
        updateInstrumentation.trackError({
          kitId,
          contentId: editingRow.id,
          partKey: editingRow.part.key,
          phase: 'conflict',
        });
        showException('Changes conflict with a newer version. Refreshing latest data.', error);
        syncEditDraftRef.current = true;
        await query.refetch();
        const latestDetail = queryClient.getQueryData<KitDetailResponseSchema_b98797e>(kitQueryKey);
        const latestRow = latestDetail?.contents?.find((row) => row.id === editingRow.id);
        if (latestRow) {
          setEditDraftState({
            contentId: latestRow.id,
            version: latestRow.version,
            requiredPerUnit: String(latestRow.required_per_unit),
            note: latestRow.note ?? '',
          });
        }
        return;
      }
      setEditErrors({ form: apiError?.message ?? 'Failed to update part' });
      updateInstrumentation.trackError({
        kitId,
        contentId: editingRow.id,
        partKey: editingRow.part.key,
        phase: 'error',
      });
      showException(`Failed to update "${editingRow.part.description}"`, error);
    } finally {
      setIsEditSubmitting(false);
    }
  }, [
    editDraft,
    editingRow,
    isArchived,
    kitId,
    buildEditMetadata,
    query,
    replaceContentInCache,
    showException,
    showSuccess,
    updateInstrumentation,
    updateMutation,
    validateQuantity,
    kitQueryKey,
    queryClient,
  ]);

  // Undo handler for content deletion - accepts contentId to retrieve specific snapshot
  const handleUndoDeleteContent = useCallback((contentId: number) => {
    return () => {
      if (undoInFlightRef.current) {
        return;
      }
      const snapshot = deletedContentSnapshotsRef.current.get(contentId);
      if (!snapshot) {
        return;
      }
      undoInFlightRef.current = true;

      trackFormSubmit('KitContent:restore', {
        kitId: snapshot.kitId,
        contentId: snapshot.contentId,
        partKey: snapshot.partKey,
        undo: true,
      });

      createMutation
        .mutateAsync({
          path: { kit_id: snapshot.kitId },
          body: {
            part_id: snapshot.partId,
            required_per_unit: snapshot.requiredPerUnit,
            note: snapshot.note,
          },
        })
        .then(() => {
          undoInFlightRef.current = false;
          deletedContentSnapshotsRef.current.delete(contentId);
          trackFormSuccess('KitContent:restore', {
            kitId: snapshot.kitId,
            contentId: snapshot.contentId,
            partKey: snapshot.partKey,
            undo: true,
          });
          showSuccess('Restored part to kit');
          void query.refetch();
        })
        .catch((error) => {
          undoInFlightRef.current = false;
          trackFormError('KitContent:restore', {
            kitId: snapshot.kitId,
            contentId: snapshot.contentId,
            partKey: snapshot.partKey,
            undo: true,
          });
          showException('Failed to restore part', error);
        });
    };
  }, [createMutation, query, showException, showSuccess]);

  const openDelete = useCallback(
    (row: KitContentRow) => {
      if (isArchived) {
        showException('Cannot delete parts from an archived kit', new Error('Kit archived'));
        return;
      }
      // No confirmation dialog - immediate deletion with undo
      // Capture snapshot for undo - store in Map for concurrent deletion support
      const snapshot: DeletedContentSnapshot = {
        contentId: row.id,
        kitId,
        partId: row.partId,
        partKey: row.part.key,
        requiredPerUnit: row.requiredPerUnit,
        note: row.note,
      };
      deletedContentSnapshotsRef.current.set(row.id, snapshot);

      setIsDeleteSubmitting(true);
      setPendingDeleteId(row.id);
      deleteInstrumentation.trackSubmit({
        kitId,
        contentId: row.id,
        partKey: row.part.key,
        phase: 'pending',
      });

      // Perform immediate deletion
      deleteMutation
        .mutateAsync({
          path: { kit_id: kitId, content_id: row.id },
        })
        .then(() => {
          setPendingDeleteId(null);
          setIsDeleteSubmitting(false);
          deleteInstrumentation.trackSuccess({
            kitId,
            contentId: row.id,
            partKey: row.part.key,
            phase: 'success',
          });
          showSuccess('Removed part from kit', {
            action: {
              id: 'undo',
              label: 'Undo',
              testId: `kits.detail.toast.undo.${row.id}`,
              onClick: handleUndoDeleteContent(row.id),
            },
          });
          void query.refetch();
        })
        .catch((error) => {
          setPendingDeleteId(null);
          setIsDeleteSubmitting(false);
          // Remove snapshot if deletion fails
          deletedContentSnapshotsRef.current.delete(row.id);
          deleteInstrumentation.trackError({
            kitId,
            contentId: row.id,
            partKey: row.part.key,
            phase: 'error',
          });
          showException(`Failed to remove "${row.part.description}"`, error);
        });
    },
    [
      deleteInstrumentation,
      deleteMutation,
      handleUndoDeleteContent,
      isArchived,
      kitId,
      query,
      showException,
      showSuccess,
    ]
  );

  const closeDelete = useCallback(() => {
    setConfirmRowId(null);
  }, []);

  const isMutationPending =
    isCreateSubmitting || isEditSubmitting || isDeleteSubmitting || createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return {
    kitId,
    kitName,
    isArchived,
    existingPartKeys,
    create: {
      isOpen: isAdding,
      open: openCreate,
      close: closeCreate,
      draft: createDraft,
      errors: createErrors,
      isSubmitting: isCreateSubmitting,
      setPartSelection: setCreatePartSelection,
      setRequiredPerUnit: setCreateRequiredPerUnit,
      setNote: setCreateNote,
      submit: handleCreateSubmit,
      instrumentation: createInstrumentation,
    },
    edit: {
      editingRowId,
      start: startEdit,
      cancel: cancelEdit,
      draft: editDraft,
      errors: editErrors,
      isSubmitting: isEditSubmitting,
      setRequiredPerUnit: setEditRequiredPerUnit,
      setNote: setEditNote,
      submit: handleEditSubmit,
      instrumentation: updateInstrumentation,
    },
    remove: {
      confirmRowId,
      confirmRow,
      open: openDelete,
      close: closeDelete,
      isSubmitting: isDeleteSubmitting,
      instrumentation: deleteInstrumentation,
    },
    overlays: {
      pendingCreateRow,
      pendingUpdates,
      pendingDeleteId,
    },
    isMutationPending,
  };
}
