import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { 
  useGetBoxesByBoxNo, 
  usePutBoxesByBoxNo, 
  useDeleteBoxesByBoxNo 
} from '@/lib/api/generated/hooks'
import { LocationList } from './location-list'
import { BoxForm } from './box-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useConfirm } from '@/hooks/use-confirm'

interface BoxDetailsProps {
  boxNo: number
  onDeleted?: () => void
}

export function BoxDetails({ boxNo, onDeleted }: BoxDetailsProps) {
  const [editFormOpen, setEditFormOpen] = useState(false)
  const { confirm, confirmProps } = useConfirm()

  const { data: box, isLoading, error } = useGetBoxesByBoxNo({ path: { box_no: boxNo } })
  const updateMutation = usePutBoxesByBoxNo()
  const deleteMutation = useDeleteBoxesByBoxNo()

  const handleUpdateBox = async (data: { description: string; capacity: number }) => {
    await updateMutation.mutateAsync({
      path: { box_no: boxNo },
      body: data
    })
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
      await deleteMutation.mutateAsync({
        path: { box_no: boxNo }
      })
      onDeleted?.()
    }
  }

  if (isLoading) {
    return (
      <div className="p-6">
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
      <div className="p-6">
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

  const usedLocations = 0 // TODO: Calculate based on actual parts data when available
  const usagePercentage = Math.round((usedLocations / box!.capacity) * 100)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
            <Link to="/boxes" className="hover:text-foreground">Storage Boxes</Link>
            <span>/</span>
            <span>Box {box!.box_no}</span>
          </div>
          <h1 className="text-3xl font-bold">Box {box!.box_no}</h1>
          <p className="text-lg text-muted-foreground">{box!.description}</p>
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
          <Card>
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
                <div className="text-lg">{usedLocations}/{box!.capacity} ({usagePercentage}%)</div>
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
          <Card>
            <CardHeader>
              <CardTitle>Locations</CardTitle>
            </CardHeader>
            <CardContent>
              <LocationList locations={box!.locations || []} />
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
      />

      <ConfirmDialog {...confirmProps} />
    </div>
  )
}