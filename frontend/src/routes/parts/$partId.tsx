import { createFileRoute, Link } from '@tanstack/react-router'
import { PartDetails } from '@/components/parts/part-details'

export const Route = createFileRoute('/parts/$partId')({
  component: PartDetail,
})

function PartDetail() {
  const { partId } = Route.useParams()

  return (
    <div className="flex h-full min-h-0 flex-col p-6">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center space-x-2 text-sm text-muted-foreground">
        <Link to="/parts" className="hover:text-foreground">Parts</Link>
        <span>/</span>
        <span>{partId}</span>
      </div>

      <div className="flex-1 min-h-0">
        <PartDetails partId={partId} />
      </div>
    </div>
  )
}
