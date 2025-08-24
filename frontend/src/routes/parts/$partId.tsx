import { createFileRoute } from '@tanstack/react-router'
import { PartDetails } from '@/components/parts/part-details'

export const Route = createFileRoute('/parts/$partId')({
  component: PartDetail,
})

function PartDetail() {
  const { partId } = Route.useParams()

  return (
    <div className="p-6">
      <PartDetails partId={partId} />
    </div>
  )
}