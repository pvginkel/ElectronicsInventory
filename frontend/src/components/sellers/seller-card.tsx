import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ExternalLinkIcon } from '@/components/icons/ExternalLinkIcon'

interface SellerCardProps {
  seller: {
    id: number
    name: string
    website: string
    created_at?: string
    updated_at?: string
  }
  onEdit: () => void
  onDelete: () => void
}

export function SellerCard({ seller, onEdit, onDelete }: SellerCardProps) {
  const handleWebsiteClick = () => {
    window.open(seller.website, '_blank', 'noopener,noreferrer')
  }

  return (
    <Card
      variant="content"
      className="hover:shadow-md transition-shadow"
      data-testid={`sellers.list.item.${seller.id}`}
      data-seller-id={seller.id}
    >
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">{seller.name}</CardTitle>
            <button
              onClick={handleWebsiteClick}
              className="flex items-center gap-1 mt-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid={`sellers.list.item.${seller.id}.link`}
            >
              <span className="truncate">{seller.website}</span>
              <ExternalLinkIcon className="w-3 h-3 flex-shrink-0" />
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex justify-end items-center">
          <div className="flex space-x-2">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
