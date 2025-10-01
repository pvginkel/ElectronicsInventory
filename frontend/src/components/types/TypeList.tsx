import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCreateType, useUpdateType, useDeleteType, useGetTypesWithStats } from '@/hooks/use-types'
import { TypeCard } from './TypeCard'
import { TypeForm } from './TypeForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useConfirm } from '@/hooks/use-confirm'
import { ClearButtonIcon } from '@/components/icons/clear-button-icon'
import { beginUiState, endUiState } from '@/lib/test/ui-state'
import { isTestMode } from '@/lib/config/test-mode'

interface TypeListProps {
  searchTerm?: string;
}

export function TypeList({ searchTerm = '' }: TypeListProps) {
  const navigate = useNavigate()
  const [createFormOpen, setCreateFormOpen] = useState(false)
  const [editFormOpen, setEditFormOpen] = useState(false)
  const [editingType, setEditingType] = useState<{ id: number; name: string; created_at?: string; updated_at?: string } | null>(null)

  const { confirm, confirmProps } = useConfirm()

  const { data: types, isLoading, isFetching, error } = useGetTypesWithStats()
  const createMutation = useCreateType()
  const updateMutation = useUpdateType()
  const deleteMutation = useDeleteType()

  const [showLoading, setShowLoading] = useState(isLoading)
  const instrumentationActiveRef = useRef(false)
  const testMode = isTestMode()

  useEffect(() => {
    if (isLoading) {
      setShowLoading(true)
      return
    }

    if (!isFetching) {
      setShowLoading(false)
    }
  }, [isFetching, isLoading])

  useEffect(() => {
    if (!testMode) {
      instrumentationActiveRef.current = false
      return
    }

    const isQueryLoading = isLoading || isFetching

    if (isQueryLoading && !instrumentationActiveRef.current) {
      instrumentationActiveRef.current = true
      beginUiState('types.list')
    }

    if (!isQueryLoading && instrumentationActiveRef.current) {
      instrumentationActiveRef.current = false

      const payload = error
        ? {
            status: 'error',
            queries: {
              types: 'error',
            },
            message: error instanceof Error ? error.message : String(error),
          }
        : {
            status: 'success',
            queries: {
              types: 'success',
            },
            totalTypes: Array.isArray(types) ? types.length : 0,
          }

      endUiState('types.list', payload)
    }
  }, [error, isFetching, isLoading, testMode, types])

  useEffect(() => {
    if (!testMode) {
      return
    }

    return () => {
      if (instrumentationActiveRef.current) {
        instrumentationActiveRef.current = false
        endUiState('types.list', {
          status: 'aborted',
        })
      }
    }
  }, [testMode])

  const handleSearchChange = (value: string) => {
    if (value) {
      navigate({
        to: '/types',
        search: { search: value },
        replace: true
      });
    } else {
      navigate({
        to: '/types',
        replace: true
      });
    }
  };

  const handleClearSearch = () => {
    handleSearchChange('');
  };

  const allTypes = Array.isArray(types) ? types : []
  const filteredTypes = searchTerm
    ? allTypes.filter((type: { name: string }) =>
        type.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : allTypes

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
      deleteMutation.mutate({
        path: { type_id: type.id }
      })
    }
  }

  if (showLoading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Types</h1>
          <Button disabled>Add Type</Button>
        </div>
        <div className="mb-6 relative">
          <Input 
            placeholder="Search..." 
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pr-8"
          />
          {searchTerm && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
              aria-label="Clear search"
            >
              <ClearButtonIcon />
            </button>
          )}
        </div>
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          data-testid="types.list.loading"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-32 bg-muted animate-pulse rounded-lg"
              data-testid="types.list.loading.skeleton"
            />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div data-testid="types.list.error">
        <div className="text-center py-12">
          <p className="text-lg text-muted-foreground">Failed to load types</p>
          <p className="text-sm text-muted-foreground mt-2">{String(error)}</p>
        </div>
      </div>
    )
  }

  const isEmpty = filteredTypes.length === 0 && allTypes.length === 0
  const isFiltered = searchTerm.trim().length > 0
  const noSearchResults = searchTerm && filteredTypes.length === 0

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Types</h1>
        <Button onClick={() => setCreateFormOpen(true)} data-testid="types.create.button">
          Add Type
        </Button>
      </div>

      {!isEmpty && (
        <div className="mb-6 relative">
          <Input 
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pr-8"
          />
          {searchTerm && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
              aria-label="Clear search"
            >
              <ClearButtonIcon />
            </button>
          )}
        </div>
      )}

      {/* Results Summary */}
      {!isEmpty && (
        <div
          className="flex justify-between items-center text-sm text-muted-foreground mb-6"
          data-testid="types.list.summary"
        >
          <span>
            {isFiltered 
              ? `${filteredTypes.length} of ${allTypes.length} types`
              : `${allTypes.length} types`}
          </span>
        </div>
      )}

      {isEmpty ? (
        <div className="text-center py-12" data-testid="types.list.empty">
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
        <div className="text-center py-12" data-testid="types.list.no-results">
          <h3 className="text-lg font-medium text-muted-foreground">No matching types</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Try adjusting your search terms or add a new type.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="types.list.container">
          {[...filteredTypes]
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
            .map((type: { id: number; name: string; part_count?: number }) => (
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
