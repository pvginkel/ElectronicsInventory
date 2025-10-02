import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCreateSeller, useUpdateSeller, useDeleteSeller, useSellers } from '@/hooks/use-sellers'
import { SellerCard } from './seller-card'
import { SellerForm } from './seller-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useConfirm } from '@/hooks/use-confirm'
import { ClearButtonIcon } from '@/components/icons/clear-button-icon'
import { useToast } from '@/hooks/use-toast'
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation'

interface SellerListProps {
  searchTerm?: string;
}

export function SellerList({ searchTerm = '' }: SellerListProps) {
  const navigate = useNavigate()
  const [createFormOpen, setCreateFormOpen] = useState(false)
  const [editFormOpen, setEditFormOpen] = useState(false)
  const [editingSeller, setEditingSeller] = useState<{ id: number; name: string; website: string; created_at?: string; updated_at?: string } | null>(null)

  const { confirm, confirmProps } = useConfirm()
  const { showSuccess, showError } = useToast()

  const {
    data: sellers = [],
    isLoading,
    isFetching,
    error
  } = useSellers()
  const createMutation = useCreateSeller()
  const updateMutation = useUpdateSeller()
  const deleteMutation = useDeleteSeller()

  const [showLoading, setShowLoading] = useState(isLoading)

  useEffect(() => {
    if (isLoading) {
      setShowLoading(true)
      return
    }

    if (!isFetching) {
      setShowLoading(false)
    }
  }, [isFetching, isLoading])

  const handleSearchChange = (value: string) => {
    if (value) {
      navigate({
        to: '/sellers',
        search: { search: value },
        replace: true
      });
    } else {
      navigate({
        to: '/sellers',
        replace: true
      });
    }
  };

  const handleClearSearch = () => {
    handleSearchChange('');
  };

  const filteredSellers = useMemo(() => {
    if (!searchTerm.trim()) {
      return sellers
    }

    const term = searchTerm.toLowerCase()
    return sellers.filter((seller: { name: string; website: string }) =>
      seller.name.toLowerCase().includes(term) ||
      seller.website.toLowerCase().includes(term)
    )
  }, [sellers, searchTerm])

  const handleCreateSeller = async (data: { name: string; website: string }) => {
    try {
      await createMutation.mutateAsync({ body: data })
      showSuccess('Seller created successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create seller'
      showError(message)
      throw err
    }
  }

  const handleEditSeller = (seller: { id: number; name: string; website: string; created_at?: string; updated_at?: string }) => {
    setEditingSeller(seller)
    setEditFormOpen(true)
  }

  const handleUpdateSeller = async (data: { name: string; website: string }) => {
    if (!editingSeller) return

    try {
      await updateMutation.mutateAsync({
        path: { seller_id: editingSeller.id },
        body: data
      })
      showSuccess('Seller updated successfully')
      setEditingSeller(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update seller'
      showError(message)
      throw err
    }
  }

  const handleDeleteSeller = async (seller: { id: number; name: string; website: string; created_at?: string; updated_at?: string }) => {
    const confirmed = await confirm({
      title: 'Delete Seller',
      description: `Are you sure you want to delete the seller "${seller.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      destructive: true
    })

    if (confirmed) {
      try {
        await deleteMutation.mutateAsync({
          path: { seller_id: seller.id }
        })
        showSuccess(`Seller "${seller.name}" deleted`)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete seller'
        showError(message)
        throw err
      }
    }
  }

  useListLoadingInstrumentation({
    scope: 'sellers.list',
    isLoading,
    isFetching,
    error,
    getReadyMetadata: () => ({
      status: 'success',
      totals: {
        all: sellers.length,
        filtered: filteredSellers.length
      },
      searchTerm: searchTerm || null
    }),
    getErrorMetadata: () => ({
      status: 'error',
      message: error instanceof Error ? error.message : String(error)
    }),
    getAbortedMetadata: () => ({ status: 'aborted' })
  })

  if (isLoading && showLoading) {
    return (
      <div data-testid="sellers.page">
        <div className="flex justify-between items-center mb-6" data-testid="sellers.page.header">
          <h1 className="text-3xl font-bold">Sellers</h1>
          <Button disabled data-testid="sellers.list.add">Add Seller</Button>
        </div>
        <div className="mb-6 relative" data-testid="sellers.list.search-container">
          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pr-8"
            data-testid="sellers.list.search"
          />
          {searchTerm && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
              aria-label="Clear search"
              data-testid="sellers.list.search.clear"
            >
              <ClearButtonIcon />
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="sellers.list.loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div data-testid="sellers.page">
        <div className="text-center py-12" data-testid="sellers.list.error">
          <p className="text-lg text-muted-foreground">Failed to load sellers</p>
          <p className="text-sm text-muted-foreground mt-2">{String(error)}</p>
        </div>
      </div>
    )
  }

  const isEmpty = sellers.length === 0
  const isFiltered = searchTerm.trim().length > 0
  const noSearchResults = searchTerm && filteredSellers.length === 0

  return (
    <div data-testid="sellers.page">
      <div className="flex justify-between items-center mb-6" data-testid="sellers.page.header">
        <h1 className="text-3xl font-bold">Sellers</h1>
        <Button onClick={() => setCreateFormOpen(true)} data-testid="sellers.list.add">
          Add Seller
        </Button>
      </div>

      {!isEmpty && (
        <div className="mb-6 relative" data-testid="sellers.list.search-container">
          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pr-8"
            data-testid="sellers.list.search"
          />
          {searchTerm && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
              aria-label="Clear search"
              data-testid="sellers.list.search.clear"
            >
              <ClearButtonIcon />
            </button>
          )}
        </div>
      )}

      {/* Results Summary */}
      {!isEmpty && (
        <div className="flex justify-between items-center text-sm text-muted-foreground mb-6" data-testid="sellers.list.summary">
          <span>
            {isFiltered
              ? `${filteredSellers.length} of ${sellers.length} sellers`
              : `${sellers.length} sellers`}
          </span>
        </div>
      )}

      {isEmpty ? (
        <div className="text-center py-12" data-testid="sellers.list.empty">
          <h3 className="text-lg font-medium text-muted-foreground">No sellers yet</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Add your first seller to start managing vendor information for your parts.
          </p>
          <Button
            className="mt-4"
            onClick={() => setCreateFormOpen(true)}
            data-testid="sellers.list.empty.cta"
          >
            Add First Seller
          </Button>
        </div>
      ) : noSearchResults ? (
        <div className="text-center py-12" data-testid="sellers.list.no-results">
          <h3 className="text-lg font-medium text-muted-foreground">No matching sellers</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Try adjusting your search terms or add a new seller.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="sellers.list.table">
          {filteredSellers.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })).map((seller: { id: number; name: string; website: string }) => (
            <SellerCard
              key={seller.id}
              seller={seller}
              onEdit={() => handleEditSeller(seller)}
              onDelete={() => handleDeleteSeller(seller)}
            />
          ))}
        </div>
      )}

      <SellerForm
        open={createFormOpen}
        onOpenChange={setCreateFormOpen}
        onSubmit={handleCreateSeller}
        title="Add Seller"
        submitText="Add Seller"
        formId="sellers.create"
      />

      {editingSeller && (
        <SellerForm
          open={editFormOpen}
          onOpenChange={(open) => {
            setEditFormOpen(open)
            if (!open) setEditingSeller(null)
          }}
          onSubmit={handleUpdateSeller}
          initialValues={editingSeller}
          title="Edit Seller"
          submitText="Update Seller"
          formId={`sellers.edit.${editingSeller.id}`}
        />
      )}

      <ConfirmDialog {...confirmProps} />
    </div>
  )
}
