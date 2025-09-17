import { createFileRoute } from '@tanstack/react-router'
import { SellerList } from '@/components/sellers/seller-list'

export const Route = createFileRoute('/sellers/')({
  validateSearch: (search: Record<string, unknown>) => {
    const searchTerm = search.search as string;
    return searchTerm ? { search: searchTerm } : {};
  },
  component: Sellers,
})

function Sellers() {
  const search = Route.useSearch()

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-6">
        <span>Sellers</span>
      </div>

      <SellerList searchTerm={search.search || ''} />
    </div>
  )
}