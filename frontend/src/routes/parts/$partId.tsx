import { createFileRoute, Link } from '@tanstack/react-router'
import { PartDetails } from '@/components/parts/part-details'

export const Route = createFileRoute('/parts/$partId')({
  component: PartDetail,
})

function PartDetail() {
  const { partId } = Route.useParams()

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-6">
        <Link to="/parts" className="hover:text-foreground">Parts</Link>
        <span>/</span>
        <span>{partId}</span>
      </div>
      
      <PartDetails partId={partId} />
    </div>
  )
}