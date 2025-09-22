import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCreateSeller, useUpdateSeller, useDeleteSeller, useSellers } from '@/hooks/use-sellers'
import { SellerCard } from './seller-card'
import { SellerForm } from './seller-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useConfirm } from '@/hooks/use-confirm'
import { ClearButtonIcon } from '@/components/icons/clear-button-icon'

interface SellerListProps {
  searchTerm?: string;
}

export function SellerList({ searchTerm = '' }: SellerListProps) {
  const navigate = useNavigate()
  const [createFormOpen, setCreateFormOpen] = useState(false)
  const [editFormOpen, setEditFormOpen] = useState(false)
  const [editingSeller, setEditingSeller] = useState<{ id: number; name: string; website: string; created_at?: string; updated_at?: string } | null>(null)

  const { confirm, confirmProps } = useConfirm()

  const { data: sellers, isLoading, error } = useSellers()
  const createMutation = useCreateSeller()
  const updateMutation = useUpdateSeller()
  const deleteMutation = useDeleteSeller()

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

  const filteredSellers = sellers?.filter((seller: { name: string; website: string }) =>
    seller.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    seller.website.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  const handleCreateSeller = async (data: { name: string; website: string }) => {
    await createMutation.mutateAsync({ body: data })
  }

  const handleEditSeller = (seller: { id: number; name: string; website: string; created_at?: string; updated_at?: string }) => {
    setEditingSeller(seller)
    setEditFormOpen(true)
  }

  const handleUpdateSeller = async (data: { name: string; website: string }) => {
    if (!editingSeller) return

    await updateMutation.mutateAsync({
      path: { seller_id: editingSeller.id },
      body: data
    })
    setEditingSeller(null)
  }

  const handleDeleteSeller = async (seller: { id: number; name: string; website: string; created_at?: string; updated_at?: string }) => {
    const confirmed = await confirm({
      title: 'Delete Seller',
      description: `Are you sure you want to delete the seller "${seller.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      destructive: true
    })

    if (confirmed) {
      deleteMutation.mutate({
        path: { seller_id: seller.id }
      })
    }
  }

  if (isLoading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Sellers</h1>
          <Button disabled>Add Seller</Button>
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
          <p className="text-lg text-muted-foreground">Failed to load sellers</p>
          <p className="text-sm text-muted-foreground mt-2">{String(error)}</p>
        </div>
      </div>
    )
  }

  const isEmpty = !sellers || (Array.isArray(sellers) && sellers.length === 0)
  const isFiltered = searchTerm.trim().length > 0
  const noSearchResults = searchTerm && filteredSellers.length === 0

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Sellers</h1>
        <Button onClick={() => setCreateFormOpen(true)}>
          Add Seller
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
        <div className="flex justify-between items-center text-sm text-muted-foreground mb-6">
          <span>
            {isFiltered
              ? `${filteredSellers.length} of ${sellers.length} sellers`
              : `${sellers.length} sellers`}
          </span>
        </div>
      )}

      {isEmpty ? (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-muted-foreground">No sellers yet</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Add your first seller to start managing vendor information for your parts.
          </p>
          <Button
            className="mt-4"
            onClick={() => setCreateFormOpen(true)}
          >
            Add First Seller
          </Button>
        </div>
      ) : noSearchResults ? (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-muted-foreground">No matching sellers</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Try adjusting your search terms or add a new seller.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
        />
      )}

      <ConfirmDialog {...confirmProps} />
    </div>
  )
}
