import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { 
  useGetBoxes, 
  usePostBoxes, 
  type BoxWithUsageSchemaList_a9993e3_BoxWithUsageSchema
} from '@/lib/api/generated/hooks'
import { BoxCard } from './box-card'
import { BoxForm } from './box-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ClearButtonIcon } from '@/components/icons/clear-button-icon'
import { useToast } from '@/hooks/use-toast'
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation'

interface BoxListProps {
  searchTerm?: string;
}

export function BoxList({ searchTerm = '' }: BoxListProps) {
  const navigate = useNavigate()
  const [createFormOpen, setCreateFormOpen] = useState(false)
  const { showSuccess, showException } = useToast()

  const {
    data: boxes = [],
    isLoading,
    isFetching,
    error
  } = useGetBoxes()
  const createMutation = usePostBoxes()

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

  const filteredBoxes = useMemo(() => {
    if (!searchTerm.trim()) return boxes

    const term = searchTerm.toLowerCase()
    return boxes.filter((box: BoxWithUsageSchemaList_a9993e3_BoxWithUsageSchema) => {
      const boxNumber = box.box_no.toString()
      const description = box.description.toLowerCase()

      return boxNumber.includes(term) || description.includes(term)
    })
  }, [boxes, searchTerm])

  useListLoadingInstrumentation({
    scope: 'boxes.list',
    isLoading,
    isFetching,
    error,
    getReadyMetadata: () => ({
      status: 'success',
      totals: {
        all: boxes.length,
        filtered: filteredBoxes.length
      },
      searchTerm: searchTerm || null
    }),
    getErrorMetadata: () => ({
      status: 'error',
      message: error instanceof Error ? error.message : String(error)
    }),
    getAbortedMetadata: () => ({ status: 'aborted' })
  })

  const handleCreateBox = async (data: { description: string; capacity: number }) => {
    try {
      await createMutation.mutateAsync({ body: data })
      showSuccess('Box created successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create box'
      showException(message, err)
      throw err
    }
  }

  const handleViewBox = (boxNo: number) => {
    navigate({ to: '/boxes/$boxNo', params: { boxNo: boxNo.toString() } })
  }

  const handleSearchChange = (value: string) => {
    if (value) {
      navigate({
        to: '/boxes',
        search: { search: value },
        replace: true
      })
    } else {
      navigate({
        to: '/boxes',
        replace: true
      })
    }
  }

  const handleClearSearch = () => {
    handleSearchChange('');
  }

  if (isLoading && showLoading) {
    return (
      <div data-testid="boxes.page">
        <div className="flex justify-between items-center mb-6" data-testid="boxes.page.header">
          <h1 className="text-3xl font-bold">Storage Boxes</h1>
          <Button disabled data-testid="boxes.list.add">Add Box</Button>
        </div>

        {/* Search */}
        <div className="w-full mb-6 relative" data-testid="boxes.list.search-container">
          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pr-8"
            data-testid="boxes.list.search"
          />
          {searchTerm && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
              aria-label="Clear search"
              data-testid="boxes.list.search.clear"
            >
              <ClearButtonIcon />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="boxes.list.loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div data-testid="boxes.page">
        <div className="flex justify-between items-center mb-6" data-testid="boxes.page.header">
          <h1 className="text-3xl font-bold">Storage Boxes</h1>
          <Button onClick={() => setCreateFormOpen(true)} data-testid="boxes.list.add">
            Add Box
          </Button>
        </div>

        {/* Search */}
        <div className="w-full mb-6 relative" data-testid="boxes.list.search-container">
          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pr-8"
            data-testid="boxes.list.search"
          />
          {searchTerm && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
              aria-label="Clear search"
              data-testid="boxes.list.search.clear"
            >
              <ClearButtonIcon />
            </button>
          )}
        </div>

        <div className="text-center py-12" data-testid="boxes.list.error">
          <p className="text-lg text-muted-foreground">Failed to load boxes</p>
          <p className="text-sm text-muted-foreground mt-2">{String(error)}</p>
        </div>
      </div>
    )
  }

  const isEmpty = boxes.length === 0
  const isFiltered = searchTerm.trim().length > 0
  const filteredIsEmpty = filteredBoxes.length === 0

  return (
    <div data-testid="boxes.page">
      <div className="flex justify-between items-center mb-6" data-testid="boxes.page.header">
        <h1 className="text-3xl font-bold">Storage Boxes</h1>
        <Button onClick={() => setCreateFormOpen(true)} data-testid="boxes.list.add">
          Add Box
        </Button>
      </div>

      {/* Search */}
      <div className="w-full mb-6 relative" data-testid="boxes.list.search-container">
        <Input
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full pr-8"
          data-testid="boxes.list.search"
        />
        {searchTerm && (
          <button
            onClick={handleClearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
            aria-label="Clear search"
            data-testid="boxes.list.search.clear"
          >
            <ClearButtonIcon />
          </button>
        )}
      </div>

      {/* Results Summary */}
      {!isEmpty && (
        <div className="flex justify-between items-center text-sm text-muted-foreground mb-6" data-testid="boxes.list.summary">
          <span>
            {isFiltered 
              ? `${filteredBoxes?.length || 0} of ${boxes.length} boxes`
              : `${boxes.length} boxes`}
          </span>
        </div>
      )}

      {isEmpty ? (
        <div className="text-center py-12" data-testid="boxes.list.empty">
          <h3 className="text-lg font-medium text-muted-foreground">No storage boxes yet</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Add your first storage box to start organizing your electronics parts.
          </p>
          <Button 
            className="mt-4" 
            onClick={() => setCreateFormOpen(true)}
            data-testid="boxes.list.empty.cta"
          >
            Add First Box
          </Button>
        </div>
      ) : filteredIsEmpty ? (
        <div className="text-center py-12" data-testid="boxes.list.no-results">
          <h3 className="text-lg font-medium text-muted-foreground">No boxes found</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Try adjusting your search terms or add a new box.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="boxes.list.table">
          {filteredBoxes.sort((a, b) => a.box_no - b.box_no).map((box: BoxWithUsageSchemaList_a9993e3_BoxWithUsageSchema) => (
            <BoxCard
              key={box.box_no}
              box={box}
              onOpen={() => handleViewBox(box.box_no)}
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
        formId="boxes.create"
      />

    </div>
  )
}
