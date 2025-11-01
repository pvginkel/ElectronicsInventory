import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ExternalLink } from '@/components/ui'

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
            <ExternalLink
              href={seller.website}
              testId={`sellers.list.item.${seller.id}.link`}
              className="text-sm"
            >
              {seller.website}
            </ExternalLink>
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
