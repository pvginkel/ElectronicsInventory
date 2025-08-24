import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { 
  useGet__boxes, 
  usePost__boxes, 
  usePut__boxes__box_no_, 
  useDelete__boxes__box_no_ 
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
  const [editingBox, setEditingBox] = useState<{ box_no: number; description: string; capacity: number } | null>(null)

  const { confirm, confirmProps } = useConfirm()
  
  const { data: boxes, isLoading, error } = useGet__boxes()
  const createMutation = usePost__boxes()
  const updateMutation = usePut__boxes__box_no_()
  const deleteMutation = useDelete__boxes__box_no_()

  const handleCreateBox = async (data: { description: string; capacity: number }) => {
    await createMutation.mutateAsync({ body: data })
  }

  const handleEditBox = (box: { box_no: number; description: string; capacity: number }) => {
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

  const handleDeleteBox = async (box: { box_no: number; description: string; capacity: number }) => {
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
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Storage Boxes</h1>
          <Button disabled>Create Box</Button>
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
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-lg text-muted-foreground">Failed to load boxes</p>
          <p className="text-sm text-muted-foreground mt-2">{String(error)}</p>
        </div>
      </div>
    )
  }

  const isEmpty = !boxes || boxes.length === 0

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Storage Boxes</h1>
        <Button onClick={() => setCreateFormOpen(true)}>
          Create Box
        </Button>
      </div>

      {isEmpty ? (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-muted-foreground">No storage boxes yet</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Create your first storage box to start organizing your electronics parts.
          </p>
          <Button 
            className="mt-4" 
            onClick={() => setCreateFormOpen(true)}
          >
            Create First Box
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boxes!.map((box) => (
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
        title="Create New Box"
        submitText="Create Box"
      />

      <BoxForm
        open={editFormOpen}
        onOpenChange={(open) => {
          setEditFormOpen(open)
          if (!open) setEditingBox(null)
        }}
        onSubmit={handleUpdateBox}
        initialValues={editingBox || undefined}
        title="Edit Box"
        submitText="Update Box"
      />

      <ConfirmDialog {...confirmProps} />
    </div>
  )
}