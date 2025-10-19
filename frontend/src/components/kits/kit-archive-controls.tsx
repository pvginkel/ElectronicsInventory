import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { buildKitsQueryKey } from '@/hooks/use-kits';
import { trackFormError, trackFormSubmit, trackFormSuccess } from '@/lib/test/form-instrumentation';
import { usePostKitsArchiveByKitId, usePostKitsUnarchiveByKitId } from '@/lib/api/generated/hooks';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { KitStatus, KitSummary, KitSummaryRecord } from '@/types/kits';
import { toKitSummaryRecord } from '@/types/kits';

const ARCHIVE_FORM_ID = 'KitLifecycle:archive';
const UNARCHIVE_FORM_ID = 'KitLifecycle:unarchive';

type KitsQueryKey = ReturnType<typeof buildKitsQueryKey>;
type PendingAction = 'archive' | 'unarchive' | null;

interface TransitionSnapshot {
  sourceKey: KitsQueryKey;
  targetKey: KitsQueryKey;
  previousSource?: KitSummaryRecord[];
  previousTarget?: KitSummaryRecord[];
}

interface MutationContext {
  snapshot: TransitionSnapshot;
}

interface KitArchiveControlsProps {
  kit: KitSummary;
  search: string;
}

export function KitArchiveControls({ kit, search }: KitArchiveControlsProps) {
  const queryClient = useQueryClient();
  const { showSuccess, showException } = useToast();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const undoInFlightRef = useRef(false);
  const archiveSnapshotRef = useRef<TransitionSnapshot | null>(null);
  const unarchiveSnapshotRef = useRef<TransitionSnapshot | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const safeSetPending = useCallback((state: PendingAction) => {
    if (isMountedRef.current) {
      setPendingAction(state);
    }
  }, []);

  const cancelOverviewQueries = useCallback(async () => {
    await Promise.all([
      queryClient.cancelQueries({ queryKey: buildKitsQueryKey('active', search) }),
      queryClient.cancelQueries({ queryKey: buildKitsQueryKey('archived', search) }),
    ]);
  }, [queryClient, search]);

  const unarchiveMutation = usePostKitsUnarchiveByKitId({
    onMutate: async () => {
      await cancelOverviewQueries();
      const snapshot = applyStatusTransition(queryClient, kit, search, 'active');
      unarchiveSnapshotRef.current = snapshot;
      safeSetPending('unarchive');
      return { snapshot } as MutationContext;
    },
    onError: (error, _variables, context) => {
      const snapshot = (context as MutationContext | undefined)?.snapshot;
      restoreSnapshot(queryClient, snapshot ?? unarchiveSnapshotRef.current);
      safeSetPending(null);
      const metadata = buildFormMetadata(kit.id, 'active', undoInFlightRef.current);
      trackFormError(UNARCHIVE_FORM_ID, metadata);
      showException(`Failed to unarchive "${kit.name}"`, error);
      undoInFlightRef.current = false;
    },
    onSuccess: (_data, _variables, context) => {
      safeSetPending(null);
      const undoTriggered = undoInFlightRef.current;
      const metadata = buildFormMetadata(kit.id, 'active', undoTriggered);
      trackFormSuccess(UNARCHIVE_FORM_ID, metadata);
      if (undoTriggered) {
        archiveSnapshotRef.current = null;
        showSuccess(`Restored "${kit.name}" to Active`);
      } else {
        showSuccess(`Unarchived "${kit.name}"`);
      }
      const snapshot = (context as MutationContext | undefined)?.snapshot ?? null;
      unarchiveSnapshotRef.current = snapshot;
      undoInFlightRef.current = false;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['getKits'] });
    },
  });

  const handleUndo = useCallback(() => {
    if (undoInFlightRef.current) {
      return;
    }
    undoInFlightRef.current = true;
    trackFormSubmit(UNARCHIVE_FORM_ID, buildFormMetadata(kit.id, 'active', true));
    unarchiveMutation
      .mutateAsync({ path: { kit_id: kit.id } })
      .catch(() => {
        // Mutation error feedback handled in onError
      });
  }, [kit.id, unarchiveMutation]);

  const archiveMutation = usePostKitsArchiveByKitId({
    onMutate: async () => {
      await cancelOverviewQueries();
      const snapshot = applyStatusTransition(queryClient, kit, search, 'archived');
      archiveSnapshotRef.current = snapshot;
      safeSetPending('archive');
      return { snapshot } as MutationContext;
    },
    onError: (error, _variables, context) => {
      const snapshot = (context as MutationContext | undefined)?.snapshot;
      restoreSnapshot(queryClient, snapshot ?? archiveSnapshotRef.current);
      safeSetPending(null);
      trackFormError(ARCHIVE_FORM_ID, buildFormMetadata(kit.id, 'archived'));
      showException(`Failed to archive "${kit.name}"`, error);
    },
    onSuccess: (_data, _variables, context) => {
      safeSetPending(null);
      trackFormSuccess(ARCHIVE_FORM_ID, buildFormMetadata(kit.id, 'archived'));
      const snapshot = (context as MutationContext | undefined)?.snapshot ?? archiveSnapshotRef.current;
      archiveSnapshotRef.current = snapshot;
      showSuccess(`Archived "${kit.name}"`, {
        action: {
          id: 'undo',
          label: 'Undo',
          testId: `kits.overview.toast.undo.${kit.id}`,
          onClick: handleUndo,
        },
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['getKits'] });
    },
  });

  const handleArchiveClick = () => {
    if (pendingAction) {
      return;
    }
    trackFormSubmit(ARCHIVE_FORM_ID, buildFormMetadata(kit.id, 'archived'));
    archiveMutation
      .mutateAsync({ path: { kit_id: kit.id } })
      .catch(() => {
        // onError handles user feedback
      });
  };

  const handleUnarchiveClick = () => {
    if (pendingAction) {
      return;
    }
    trackFormSubmit(UNARCHIVE_FORM_ID, buildFormMetadata(kit.id, 'active'));
    unarchiveMutation
      .mutateAsync({ path: { kit_id: kit.id } })
      .catch(() => {
        // onError handles user feedback
      });
  };

  const isArchiving = pendingAction === 'archive';
  const isUnarchiving = pendingAction === 'unarchive';

  if (kit.status === 'active') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleArchiveClick}
        disabled={isArchiving || isUnarchiving}
        data-testid={`kits.overview.controls.archive.${kit.id}`}
      >
        {isArchiving ? 'Archiving…' : 'Archive'}
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleUnarchiveClick}
      disabled={isArchiving || isUnarchiving}
      data-testid={`kits.overview.controls.unarchive.${kit.id}`}
    >
      {isUnarchiving ? 'Restoring…' : 'Unarchive'}
    </Button>
  );
}

function applyStatusTransition(
  queryClient: QueryClient,
  kit: KitSummary,
  search: string,
  targetStatus: KitStatus,
): TransitionSnapshot {
  const sourceStatus: KitStatus = targetStatus === 'archived' ? 'active' : 'archived';
  const sourceKey = buildKitsQueryKey(sourceStatus, search);
  const targetKey = buildKitsQueryKey(targetStatus, search);
  const previousSource = queryClient.getQueryData<KitSummaryRecord[]>(sourceKey);
  const previousTarget = queryClient.getQueryData<KitSummaryRecord[]>(targetKey);
  const timestamp = new Date().toISOString();
  const summaryRecord = createRecordForStatus(kit, targetStatus, timestamp);

  queryClient.setQueryData(sourceKey, (current?: KitSummaryRecord[]) => removeKitFromList(current, kit.id));
  queryClient.setQueryData(targetKey, (current?: KitSummaryRecord[]) => upsertKitRecord(current, summaryRecord));

  return { sourceKey, targetKey, previousSource, previousTarget };
}

function restoreSnapshot(queryClient: QueryClient, snapshot: TransitionSnapshot | null) {
  if (!snapshot) {
    return;
  }
  queryClient.setQueryData(snapshot.sourceKey, snapshot.previousSource);
  queryClient.setQueryData(snapshot.targetKey, snapshot.previousTarget);
}

function removeKitFromList(list: KitSummaryRecord[] | undefined, kitId: number): KitSummaryRecord[] | undefined {
  if (!list) {
    return list;
  }
  return list.filter((item) => item.id !== kitId);
}

function upsertKitRecord(list: KitSummaryRecord[] | undefined, record: KitSummaryRecord): KitSummaryRecord[] {
  const base = list ? list.filter((item) => item.id !== record.id) : [];
  return [record, ...base];
}

function createRecordForStatus(kit: KitSummary, status: KitStatus, timestamp: string): KitSummaryRecord {
  const record = toKitSummaryRecord(kit);
  return {
    ...record,
    status,
    archived_at: status === 'archived' ? timestamp : null,
    updated_at: timestamp,
  };
}

function buildFormMetadata(kitId: number, targetStatus: KitStatus, undo = false) {
  return {
    kitId,
    targetStatus,
    ...(undo ? { undo: true } : {}),
  };
}
