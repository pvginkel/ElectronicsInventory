import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { 
  useGetBoxes, 
  usePostBoxes, 
  usePutBoxesByBoxNo, 
  useDeleteBoxesByBoxNo,
  type BoxWithUsageSchemaList_a9993e3_BoxWithUsageSchema
} from '@/lib/api/generated/hooks'
import { BoxCard } from './box-card'
import { BoxForm } from './box-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useConfirm } from '@/hooks/use-confirm'

export function BoxList() {
  const navigate = useNavigate()
  const [createFormOpen, setCreateFormOpen] = useState(false)
  const [editFormOpen, setEditFormOpen] = useState(false)
  const [editingBox, setEditingBox] = useState<BoxWithUsageSchemaList_a9993e3_BoxWithUsageSchema | null>(null)

  const { confirm, confirmProps } = useConfirm()
  
  const { data: boxes, isLoading, error } = useGetBoxes()
  const createMutation = usePostBoxes()
  const updateMutation = usePutBoxesByBoxNo()
  const deleteMutation = useDeleteBoxesByBoxNo()

  const handleCreateBox = async (data: { description: string; capacity: number }) => {
    await createMutation.mutateAsync({ body: data })
  }

  const handleEditBox = (box: BoxWithUsageSchemaList_a9993e3_BoxWithUsageSchema) => {
    setEditingBox(box)
    setEditFormOpen(true)
  }

  const handleUpdateBox = async (data: { description: string; capacity: number }) => {
    if (!editingBox) return
    
    await updateMutation.mutateAsync({
      path: { box_no: editingBox.box_no },
      body: data
    })
    setEditingBox(null)
  }

  const handleDeleteBox = async (box: BoxWithUsageSchemaList_a9993e3_BoxWithUsageSchema) => {
    const confirmed = await confirm({
      title: 'Delete Box',
      description: `Are you sure you want to delete Box ${box.box_no} (${box.description})? This action cannot be undone.`,
      confirmText: 'Delete',
      destructive: true
    })

    if (confirmed) {
      await deleteMutation.mutateAsync({
        path: { box_no: box.box_no }
      })
    }
  }

  const handleViewBox = (boxNo: number) => {
    navigate({ to: '/boxes/$boxNo', params: { boxNo: boxNo.toString() } })
  }

  if (isLoading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Storage Boxes</h1>
          <Button disabled>Add Box</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <div className="text-center py-12">
          <p className="text-lg text-muted-foreground">Failed to load boxes</p>
          <p className="text-sm text-muted-foreground mt-2">{String(error)}</p>
        </div>
      </div>
    )
  }

  const isEmpty = !boxes || boxes.length === 0

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Storage Boxes</h1>
        <Button onClick={() => setCreateFormOpen(true)}>
          Add Box
        </Button>
      </div>

      {isEmpty ? (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-muted-foreground">No storage boxes yet</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Add your first storage box to start organizing your electronics parts.
          </p>
          <Button 
            className="mt-4" 
            onClick={() => setCreateFormOpen(true)}
          >
            Add First Box
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boxes!.map((box: BoxWithUsageSchemaList_a9993e3_BoxWithUsageSchema) => (
            <BoxCard
              key={box.box_no}
              box={box}
              onView={() => handleViewBox(box.box_no)}
              onEdit={() => handleEditBox(box)}
              onDelete={() => handleDeleteBox(box)}
            />
          ))}
        </div>
      )}

      <BoxForm
        open={createFormOpen}
        onOpenChange={setCreateFormOpen}
        onSubmit={handleCreateBox}
        title="Add Box"
        submitText="Add Box"
      />

      {editingBox && (
        <BoxForm
          open={editFormOpen}
          onOpenChange={(open) => {
            setEditFormOpen(open)
            if (!open) setEditingBox(null)
          }}
          onSubmit={handleUpdateBox}
          initialValues={editingBox}
          title="Edit Box"
          submitText="Update Box"
        />
      )}

      <ConfirmDialog {...confirmProps} />
    </div>
  )
}