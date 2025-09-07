import { createFileRoute } from '@tanstack/react-router'
import { BoxList } from '@/components/boxes/box-list'

export const Route = createFileRoute('/boxes/')({
  validateSearch: (search: Record<string, unknown>) => {
    const searchTerm = search.search as string;
    return searchTerm ? { search: searchTerm } : {};
  },
  component: Boxes,
})

function Boxes() {
  const search = Route.useSearch()
  
  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-6">
        <span>Storage</span>
      </div>
      
      <BoxList searchTerm={search.search || ''} />
    </div>
  )
}