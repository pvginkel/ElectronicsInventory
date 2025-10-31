import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  useGetBoxesByBoxNo,
  useGetBoxes,
  usePutBoxesByBoxNo,
  useDeleteBoxesByBoxNo,
} from '@/lib/api/generated/hooks';
import { useBoxLocationsWithParts } from '@/hooks/use-box-locations';
import { LocationList } from './location-list';
import { BoxForm } from './box-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useConfirm } from '@/hooks/use-confirm';
import { useToast } from '@/hooks/use-toast';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { DetailScreenLayout } from '@/components/layout/detail-screen-layout';
import { KeyValueBadge } from '@/components/ui';

interface BoxDetailsProps {
  boxNo: number;
  onDeleted?: () => void;
}

export function BoxDetails({ boxNo, onDeleted }: BoxDetailsProps) {
  const [editFormOpen, setEditFormOpen] = useState(false);
  const { confirm, confirmProps } = useConfirm();
  const { showSuccess, showException } = useToast();

  const {
    data: box,
    isLoading,
    isFetching,
    error,
  } = useGetBoxesByBoxNo({ path: { box_no: boxNo } });

  const { data: boxes } = useGetBoxes();

  const {
    data: locations,
    isLoading: locationsLoading,
    isFetching: locationsFetching,
    error: locationsError,
  } = useBoxLocationsWithParts(boxNo);

  const updateMutation = usePutBoxesByBoxNo();
  const deleteMutation = useDeleteBoxesByBoxNo();

  const usageStats = useMemo(() => {
    const boxFromList = boxes?.find((candidate) => candidate.box_no === boxNo) ?? null;

    const usedLocations =
      boxFromList && 'occupied_locations' in boxFromList
        ? (boxFromList as { occupied_locations: number }).occupied_locations
        : 0;

    const totalLocations =
      boxFromList && 'total_locations' in boxFromList
        ? (boxFromList as { total_locations: number }).total_locations
        : box?.capacity ?? 0;

    const usagePercentage =
      box && totalLocations > 0 ? Math.min(100, Math.round((usedLocations / totalLocations) * 100)) : 0;

    return {
      usedLocations,
      totalLocations,
      usagePercentage,
    };
  }, [box, boxes, boxNo]);

  useListLoadingInstrumentation({
    scope: 'boxes.detail',
    isLoading: isLoading || locationsLoading,
    isFetching: isFetching || locationsFetching,
    error: error || locationsError,
    getReadyMetadata: () =>
      box
        ? {
            status: 'success',
            boxNo,
            capacity: box.capacity,
            locationCount: locations?.length ?? box.locations?.length ?? 0,
            usagePercentage: usageStats.usagePercentage,
          }
        : undefined,
    getErrorMetadata: (instrumentationError) => ({
      status: 'error',
      message:
        (instrumentationError instanceof Error ? instrumentationError.message : String(instrumentationError)) ??
        (error instanceof Error ? error.message : String(error)) ??
        (locationsError instanceof Error ? locationsError.message : String(locationsError)) ??
        'Unknown error',
      boxNo,
    }),
    getAbortedMetadata: () => ({ status: 'aborted', boxNo }),
  });

  if (locationsError) {
    // Preserve the existing logging for unexpected instrumentation gaps.
    console.error('Failed to load enhanced location data:', locationsError);
  }

  const handleUpdateBox = async (data: { description: string; capacity: number }) => {
    try {
      await updateMutation.mutateAsync({
        path: { box_no: boxNo },
        body: data,
      });
      showSuccess('Box updated successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update box';
      showException(message, err);
    }
  };

  const handleDeleteBox = async () => {
    if (!box) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete Box',
      description: `Are you sure you want to delete Box ${box.box_no} (${box.description})? This action cannot be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({ path: { box_no: boxNo } });
      showSuccess(`Box #${box.box_no} deleted`);
      onDeleted?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete box';
      showException(message, err);
    }
  };

  const isLoadingState = isLoading || locationsLoading;
  const hasPrimaryError = Boolean(error) || (!isLoadingState && !box);
  const ready = Boolean(box) && !isLoadingState && !hasPrimaryError;

  const breadcrumbs = (
    <>
      <Link to="/boxes" className="hover:text-foreground">
        Storage Boxes
      </Link>
      <span>/</span>
      <span>Box {boxNo}</span>
    </>
  );

  const actions = ready ? (
    <>
      <Button variant='outline' onClick={() => setEditFormOpen(true)} data-testid="boxes.detail.actions.edit">
        Edit Box
      </Button>
      <Button
        variant='outline'
        onClick={handleDeleteBox}
        disabled={deleteMutation.isPending}
        data-testid="boxes.detail.actions.delete"
      >
        Delete Box
      </Button>
    </>
  ) : null;

  const metadataRow = ready && box ? (
    <>
      <KeyValueBadge
        label="Capacity"
        value={box.capacity}
        color="neutral"
        testId="boxes.detail.metadata.capacity"
      />
      <KeyValueBadge
        label="Usage"
        value={`${usageStats.usagePercentage}%`}
        color={usageStats.usagePercentage >= 90 ? 'danger' : 'neutral'}
        testId="boxes.detail.metadata.usage"
      />
      <KeyValueBadge
        label="Updated"
        value={new Date(box.updated_at).toLocaleDateString()}
        color="neutral"
        testId="boxes.detail.metadata.updated"
      />
    </>
  ) : null;

  const detailContent = (() => {
    if (isLoadingState) {
      return (
        <div data-testid="boxes.detail.loading" className="space-y-6">
          <Card className="p-6">
            <div className="space-y-4">
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="h-40 animate-pulse rounded-lg bg-muted" />
                <div className="h-40 animate-pulse rounded-lg bg-muted lg:col-span-2" />
              </div>
            </div>
          </Card>
        </div>
      );
    }

    if (hasPrimaryError || !box) {
      return (
        <div
          className="flex flex-col items-center justify-center gap-4 py-12 text-center"
          data-testid="boxes.detail.error"
        >
          <p className="text-lg text-muted-foreground">Failed to load box details</p>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : String(error ?? 'Box not found')}
          </p>
          <Link to="/boxes">
            <Button variant="outline">View All Boxes</Button>
          </Link>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <Card data-testid="boxes.detail.summary">
              <CardHeader>
                <CardTitle>Box Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm font-medium">Box Number</div>
                  <div className="text-2xl font-bold">#{box.box_no}</div>
                </div>

                <div>
                  <div className="text-sm font-medium">Description</div>
                  <div className="text-lg">{box.description}</div>
                </div>

                <div>
                  <div className="text-sm font-medium">Capacity</div>
                  <div className="text-lg">{box.capacity} locations</div>
                </div>

                <div>
                  <div className="text-sm font-medium">Usage</div>
                  <div className="text-lg">
                    {usageStats.usedLocations}/{usageStats.totalLocations} ({usageStats.usagePercentage}%)
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${usageStats.usagePercentage}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card data-testid="boxes.detail.locations">
              <CardHeader>
                <CardTitle>Locations</CardTitle>
              </CardHeader>
              <CardContent>
                {locationsError ? (
                  <div className="py-8 text-center" data-testid="boxes.detail.locations.error">
                    <p className="mb-2 text-muted-foreground">Failed to load location details</p>
                    <p className="text-xs text-muted-foreground">Falling back to basic location view</p>
                    <LocationList
                      locations={
                        box.locations?.map((loc) => ({
                          boxNo: loc.box_no,
                          locNo: loc.loc_no,
                          isOccupied: false,
                          partAssignments: null,
                          totalQuantity: 0,
                          displayText: 'Unknown',
                          isEmpty: true,
                          stylingClasses: 'border-gray-200 bg-gray-50 hover:bg-gray-100',
                        })) ?? []
                      }
                    />
                  </div>
                ) : (
                  <LocationList locations={locations ?? []} />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  })();

  const title = ready && box
    ? `#${box.box_no} ${box.description}`
    : isLoadingState
      ? 'Loading box…'
      : 'Box details';

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="boxes.detail">
      <DetailScreenLayout
        rootTestId="boxes.detail.layout"
        headerTestId="boxes.detail.header"
        contentTestId="boxes.detail.content"
        footerTestId="boxes.detail.footer"
        actionsTestId="boxes.detail.actions"
        breadcrumbs={breadcrumbs}
        title={title}
        metadataRow={metadataRow}
        actions={actions}
      >
        {detailContent}
      </DetailScreenLayout>

      {ready && box ? (
        <BoxForm
          open={editFormOpen}
          onOpenChange={setEditFormOpen}
          onSubmit={handleUpdateBox}
          initialValues={{
            description: box.description,
            capacity: box.capacity,
          }}
          title="Edit Box"
          submitText="Update Box"
          formId={`boxes.detail.edit.${boxNo}`}
        />
      ) : null}

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}
