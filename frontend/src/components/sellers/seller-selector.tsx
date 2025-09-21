import { useState, useCallback, useMemo } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { SellerCreateDialog } from './seller-create-dialog'
import { useSellers, useCreateSeller } from '@/hooks/use-sellers'
import { ExternalLinkIcon } from '@/components/icons/ExternalLinkIcon'

interface SellerSelectorProps {
  value?: number
  onChange: (value: number | undefined) => void
  placeholder?: string
  error?: string
  className?: string
}

export function SellerSelector({
  value,
  onChange,
  placeholder = "Search or select seller...",
  error,
  className
}: SellerSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const { data: allSellers = [], isLoading } = useSellers()

  // Filter sellers based on search term
  const sellers = useMemo(() => {
    if (!searchTerm.trim()) return allSellers
    const term = searchTerm.toLowerCase()
    return allSellers.filter(seller =>
      seller.name.toLowerCase().includes(term)
    )
  }, [allSellers, searchTerm])
  const createMutation = useCreateSeller()

  // Find selected seller for displaying website below
  const selectedSeller = value ? allSellers.find(s => s.id === value) : null

  // Handle search term change
  const handleSearchChange = useCallback((term: string) => {
    setSearchTerm(term)
  }, [])

  // Handle inline creation
  const handleCreateNew = useCallback((name: string) => {
    setSearchTerm(name)
    setCreateDialogOpen(true)
  }, [])

  // Handle successful creation
  const handleCreateSuccess = useCallback(async (data: { name: string; website: string }) => {
    try {
      const result = await createMutation.mutateAsync({ body: data })
      onChange(result.id)
      setSearchTerm(result.name)
      setCreateDialogOpen(false)
    } catch {
      // Error handling is automatic via React Query
    }
  }, [onChange, createMutation])

  // Custom option rendering to show name and website
  const renderOption = useCallback((seller: { id: number; name: string; website: string }) => (
    <div className="flex flex-col">
      <div className="font-medium">{seller.name}</div>
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <span className="truncate">{seller.website}</span>
        <ExternalLinkIcon className="w-3 h-3 flex-shrink-0" />
      </div>
    </div>
  ), [])

  const handleWebsiteClick = () => {
    if (selectedSeller?.website) {
      window.open(selectedSeller.website, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className={className}>
      <SearchableSelect
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        error={error}
        options={sellers}
        isLoading={isLoading}
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        renderOption={renderOption}
        enableInlineCreate={true}
        onCreateNew={handleCreateNew}
        createNewLabel={(term) => `Create seller "${term}"`}
        loadingText="Searching sellers..."
        noResultsText="No sellers found"
      />

      {selectedSeller && (
        <div className="mt-2 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={handleWebsiteClick}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <span>Website: {selectedSeller.website}</span>
            <ExternalLinkIcon className="w-3 h-3" />
          </button>
        </div>
      )}

      <SellerCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleCreateSuccess}
        initialName={searchTerm}
      />
    </div>
  )
}