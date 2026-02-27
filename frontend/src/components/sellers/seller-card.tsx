import { Card, CardContent, CardHeader, CardTitle } from '@/components/primitives/card'
import { Button } from '@/components/primitives/button'
import { ExternalLink } from '@/components/primitives'
import { Gate } from '@/components/auth/gate'
import { putSellersBySellerIdRole, deleteSellersBySellerIdRole } from '@/lib/api/generated/roles'

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
      variant="grid-tile"
      data-testid={`sellers.list.item.${seller.id}`}
      data-seller-id={seller.id}
    >
      <CardHeader>
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

      <CardContent>
        <div className="flex justify-end items-center">
          <div className="flex space-x-2">
            <Gate requires={putSellersBySellerIdRole}>
              <Button variant="ghost" size="sm" onClick={onEdit}>
                Edit
              </Button>
            </Gate>
            <Gate requires={deleteSellersBySellerIdRole}>
              <Button variant="ghost" size="sm" onClick={onDelete}>
                Delete
              </Button>
            </Gate>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
