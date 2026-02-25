import { useState, useCallback, useMemo, useEffect } from 'react'
import { SearchableSelect } from '@/components/primitives/searchable-select'
import { SellerCreateDialog } from './seller-create-dialog'
import { useSellers, useCreateSeller } from '@/hooks/use-sellers'
import { ExternalLinkIcon } from '@/components/icons/ExternalLinkIcon'
import { ExternalLink } from '@/components/primitives'
import { useToast } from '@/hooks/use-toast'
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation'
import { fuzzyMatch } from '@/lib/utils/fuzzy-search'

interface SellerSelectorProps {
  value?: number
  onChange: (value: number | undefined) => void
  placeholder?: string
  error?: string
  className?: string
  /** Seller IDs to exclude from the dropdown (e.g. already-linked sellers). */
  excludeIds?: number[]
}

export function SellerSelector({
  value,
  onChange,
  placeholder = "Search or select seller...",
  error,
  className,
  excludeIds,
}: SellerSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const { showSuccess, showException } = useToast()

  const {
    data: allSellers = [],
    isLoading,
    isFetching,
    error: loadError
  } = useSellers()

  // Filter sellers: exclude already-linked, then apply fuzzy search
  const excludeSet = useMemo(() => new Set(excludeIds ?? []), [excludeIds])
  const sellers = useMemo(() => {
    const eligible = excludeSet.size > 0
      ? allSellers.filter(s => !excludeSet.has(s.id))
      : allSellers
    if (!searchTerm.trim()) return eligible
    return eligible.filter(seller =>
      fuzzyMatch([{ term: seller.name, type: 'text' }], searchTerm)
    )
  }, [allSellers, excludeSet, searchTerm])
  const createMutation = useCreateSeller()

  // Find selected seller for displaying website below
  const hasSelectedValue = value !== undefined
  // Guard keeps falsy IDs (e.g. 0) working if API ever introduces them.
  const selectedSeller = hasSelectedValue ? allSellers.find(s => s.id === value) : null

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
      showSuccess('Seller created successfully')
    } catch (err) {
      showException('Failed to create seller', err)
      throw err
    }
  }, [onChange, createMutation, showException, showSuccess])

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

  useEffect(() => {
    if (loadError) {
      showException('Failed to load sellers', loadError)
    }
  }, [loadError, showException])

  useListLoadingInstrumentation({
    scope: 'sellers.selector',
    isLoading,
    isFetching,
    error: loadError,
    getReadyMetadata: () => ({
      status: 'success',
      sellers: allSellers.length
    }),
    getErrorMetadata: () => ({
      status: 'error',
      message: loadError instanceof Error ? loadError.message : String(loadError)
    }),
    getAbortedMetadata: () => ({ status: 'aborted' })
  })

  return (
    <div className={className} data-testid="sellers.selector">
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
        data-testid="sellers.selector.input"
      />

      {selectedSeller && (
        <div className="mt-2 text-sm" data-testid="sellers.selector.selected">
          <ExternalLink
            href={selectedSeller.website}
            testId="sellers.selector.selected.link"
          >
            {selectedSeller.website}
          </ExternalLink>
        </div>
      )}

      <SellerCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleCreateSuccess}
        initialName={searchTerm}
        formId="sellers.selector.create"
      />
    </div>
  )
}
