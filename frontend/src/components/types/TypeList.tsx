import { useState } from 'react'
import { useCreateType, useUpdateType, useDeleteType, useGetTypesWithStats } from '@/hooks/use-types'
import { TypeCard } from './TypeCard'
import { TypeForm } from './TypeForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useConfirm } from '@/hooks/use-confirm'

export function TypeList() {
  const [createFormOpen, setCreateFormOpen] = useState(false)
  const [editFormOpen, setEditFormOpen] = useState(false)
  const [editingType, setEditingType] = useState<{ id: number; name: string; created_at?: string; updated_at?: string } | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const { confirm, confirmProps } = useConfirm()
  
  const { data: types, isLoading, error } = useGetTypesWithStats(true)
  const createMutation = useCreateType()
  const updateMutation = useUpdateType()
  const deleteMutation = useDeleteType()

  const filteredTypes = types?.filter((type: { name: string }) => 
    type.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  const handleCreateType = async (data: { name: string }) => {
    await createMutation.mutateAsync({ body: data })
  }

  const handleEditType = (type: { id: number; name: string; created_at?: string; updated_at?: string }) => {
    setEditingType(type)
    setEditFormOpen(true)
  }

  const handleUpdateType = async (data: { name: string }) => {
    if (!editingType) return
    
    await updateMutation.mutateAsync({
      path: { type_id: editingType.id },
      body: data
    })
    setEditingType(null)
  }

  const handleDeleteType = async (type: { id: number; name: string; created_at?: string; updated_at?: string }) => {
    const confirmed = await confirm({
      title: 'Delete Type',
      description: `Are you sure you want to delete the type "${type.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      destructive: true
    })

    if (confirmed) {
      await deleteMutation.mutateAsync({
        path: { type_id: type.id }
      })
    }
  }

  if (isLoading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Types</h1>
          <Button disabled>Add Type</Button>
        </div>
        <div className="mb-6">
          <Input placeholder="Search types..." disabled />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <div className="text-center py-12">
          <p className="text-lg text-muted-foreground">Failed to load types</p>
          <p className="text-sm text-muted-foreground mt-2">{String(error)}</p>
        </div>
      </div>
    )
  }

  const isEmpty = !types || (Array.isArray(types) && types.length === 0)
  const noSearchResults = searchTerm && filteredTypes.length === 0

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Types</h1>
        <Button onClick={() => setCreateFormOpen(true)}>
          Add Type
        </Button>
      </div>

      {!isEmpty && (
        <div className="mb-6">
          <Input 
            placeholder="Search types..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      )}

      {isEmpty ? (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-muted-foreground">No types yet</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Add your first part type to start organizing your electronics parts.
          </p>
          <Button 
            className="mt-4" 
            onClick={() => setCreateFormOpen(true)}
          >
            Add First Type
          </Button>
        </div>
      ) : noSearchResults ? (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-muted-foreground">No matching types</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Try adjusting your search terms or add a new type.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTypes.map((type: { id: number; name: string; part_count?: number }) => (
            <TypeCard
              key={type.id}
              type={type}
              partCount={type.part_count}
              onEdit={() => handleEditType(type)}
              onDelete={() => handleDeleteType(type)}
            />
          ))}
        </div>
      )}

      <TypeForm
        open={createFormOpen}
        onOpenChange={setCreateFormOpen}
        onSubmit={handleCreateType}
        title="Add Type"
        submitText="Add Type"
      />

      {editingType && (
        <TypeForm
          open={editFormOpen}
          onOpenChange={(open) => {
            setEditFormOpen(open)
            if (!open) setEditingType(null)
          }}
          onSubmit={handleUpdateType}
          initialValues={editingType}
          title="Edit Type"
          submitText="Update Type"
        />
      )}

      <ConfirmDialog {...confirmProps} />
    </div>
  )
}