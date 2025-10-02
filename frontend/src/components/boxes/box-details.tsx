import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { 
  useGetBoxesByBoxNo, 
  useGetBoxes,
  usePutBoxesByBoxNo, 
  useDeleteBoxesByBoxNo 
} from '@/lib/api/generated/hooks'
import { useBoxLocationsWithParts } from '@/hooks/use-box-locations'
import { LocationList } from './location-list'
import { BoxForm } from './box-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useConfirm } from '@/hooks/use-confirm'
import { useToast } from '@/hooks/use-toast'
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation'

interface BoxDetailsProps {
  boxNo: number
  onDeleted?: () => void
}

export function BoxDetails({ boxNo, onDeleted }: BoxDetailsProps) {
  const [editFormOpen, setEditFormOpen] = useState(false)
  const { confirm, confirmProps } = useConfirm()
  const { showSuccess, showError } = useToast()

  const { data: box, isLoading, isFetching, error } = useGetBoxesByBoxNo({ path: { box_no: boxNo } })
  const { data: boxes } = useGetBoxes() // Get all boxes to find usage stats for this specific box  
  const {
    data: locations,
    isLoading: locationsLoading,
    isFetching: locationsFetching,
    error: locationsError
  } = useBoxLocationsWithParts(boxNo)
  const updateMutation = usePutBoxesByBoxNo()
  const deleteMutation = useDeleteBoxesByBoxNo()

  useListLoadingInstrumentation({
    scope: 'boxes.detail',
    isLoading: isLoading || locationsLoading,
    isFetching: isFetching || locationsFetching,
    error: error || locationsError,
    getReadyMetadata: () => ({
      status: 'success',
      boxNo,
      locations: locations?.length ?? box?.locations?.length ?? 0
    }),
    getErrorMetadata: () => ({
      status: 'error',
      message: (error instanceof Error ? error.message : error) || (locationsError instanceof Error ? locationsError.message : locationsError) || 'Unknown error'
    }),
    getAbortedMetadata: () => ({ status: 'aborted', boxNo })
  })

  const handleUpdateBox = async (data: { description: string; capacity: number }) => {
    try {
      await updateMutation.mutateAsync({
        path: { box_no: boxNo },
        body: data
      })
      showSuccess('Box updated successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update box'
      showError(message)
    }
  }

  const handleDeleteBox = async () => {
    if (!box) return

    const confirmed = await confirm({
      title: 'Delete Box',
      description: `Are you sure you want to delete Box ${box.box_no} (${box.description})? This action cannot be undone.`,
      confirmText: 'Delete',
      destructive: true
    })

    if (confirmed) {
      try {
        await deleteMutation.mutateAsync({ path: { box_no: boxNo } })
        showSuccess(`Box #${box.box_no} deleted`)
        onDeleted?.()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete box'
        showError(message)
      }
    }
  }

  if (isLoading || locationsLoading) {
    return (
      <div data-testid="boxes.detail.loading">
        <div className="mb-6">
          <div className="h-8 w-32 bg-muted animate-pulse rounded mb-2" />
          <div className="h-6 w-48 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="h-64 bg-muted animate-pulse rounded-lg" />
          </div>
          <div className="lg:col-span-2">
            <div className="h-64 bg-muted animate-pulse rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !box) {
    return (
      <div data-testid="boxes.detail.error">
        <div className="text-center py-12">
          <p className="text-lg text-muted-foreground">Failed to load box details</p>
          <p className="text-sm text-muted-foreground mt-2">
            {String(error) || 'Box not found'}
          </p>
          <Link to="/boxes" className="mt-4 inline-block">
            <Button variant="outline">Back to Boxes</Button>
          </Link>
        </div>
      </div>
    )
  }

  // Show locations error if there's an issue loading them, but don't block the whole page
  if (locationsError) {
    console.error('Failed to load enhanced location data:', locationsError)
  }

  // Get usage statistics from the boxes list endpoint which includes the new usage fields
  const boxFromList = boxes?.find(b => b.box_no === boxNo)
  const usedLocations = boxFromList && 'occupied_locations' in boxFromList 
    ? (boxFromList as { occupied_locations: number }).occupied_locations 
    : 0
  const usagePercentage = boxFromList && 'usage_percentage' in boxFromList
    ? Math.round((boxFromList as { usage_percentage: number }).usage_percentage)
    : Math.round((usedLocations / box!.capacity) * 100)
  const totalLocations = boxFromList && 'total_locations' in boxFromList
    ? (boxFromList as { total_locations: number }).total_locations
    : box?.capacity

  return (
    <div data-testid="boxes.detail">
      <div className="flex items-center justify-between mb-6" data-testid="boxes.detail.header">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
            <Link to="/boxes" className="hover:text-foreground">Storage Boxes</Link>
            <span>/</span>
            <span>Box {box!.box_no}</span>
          </div>
          <h1 className="text-3xl font-bold">#{box!.box_no} {box!.description}</h1>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => setEditFormOpen(true)}>
            Edit Box
          </Button>
          <Button variant="outline" onClick={handleDeleteBox}>
            Delete Box
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card data-testid="boxes.detail.summary">
            <CardHeader>
              <CardTitle>Box Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm font-medium">Box Number</div>
                <div className="text-2xl font-bold">{box!.box_no}</div>
              </div>
              
              <div>
                <div className="text-sm font-medium">Description</div>
                <div className="text-lg">{box!.description}</div>
              </div>
              
              <div>
                <div className="text-sm font-medium">Capacity</div>
                <div className="text-lg">{box!.capacity} locations</div>
              </div>
              
              <div>
                <div className="text-sm font-medium">Usage</div>
                <div className="text-lg">{usedLocations}/{totalLocations} ({usagePercentage}%)</div>
                <div className="mt-2 bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${usagePercentage}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">Last Updated</div>
                <div className="text-sm text-muted-foreground">
                  {new Date(box!.updated_at).toLocaleDateString()}
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
                <div className="text-center py-8" data-testid="boxes.detail.locations.error">
                  <p className="text-muted-foreground mb-2">Failed to load location details</p>
                  <p className="text-xs text-muted-foreground">Falling back to basic location view</p>
                  <LocationList locations={box!.locations?.map(loc => ({
                    boxNo: loc.box_no,
                    locNo: loc.loc_no,
                    isOccupied: false,
                    partAssignments: null,
                    totalQuantity: 0,
                    displayText: 'Unknown',
                    isEmpty: true,
                    stylingClasses: 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                  })) || []} />
                </div>
              ) : (
                <LocationList locations={locations || []} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <BoxForm
        open={editFormOpen}
        onOpenChange={setEditFormOpen}
        onSubmit={handleUpdateBox}
        initialValues={{
          description: box!.description,
          capacity: box!.capacity
        }}
        title="Edit Box"
        submitText="Update Box"
        formId={`boxes.detail.edit.${boxNo}`}
      />

      <ConfirmDialog {...confirmProps} />
    </div>
  )
}
