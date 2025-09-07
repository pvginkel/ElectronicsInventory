import { createFileRoute } from '@tanstack/react-router'
import { TypeList } from '@/components/types/TypeList'

export const Route = createFileRoute('/types/')({
  validateSearch: (search: Record<string, unknown>) => {
    const searchTerm = search.search as string;
    return searchTerm ? { search: searchTerm } : {};
  },
  component: Types,
})

function Types() {
  const search = Route.useSearch()
  
  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-6">
        <span>Types</span>
      </div>
      
      <TypeList searchTerm={search.search || ''} />
    </div>
  )
}