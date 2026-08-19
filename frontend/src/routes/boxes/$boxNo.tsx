import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { BoxDetails } from '@/components/boxes/box-details'

export const Route = createFileRoute('/boxes/$boxNo')({
  component: BoxDetailsPage,
})

function BoxDetailsPage() {
  const { boxNo } = Route.useParams()
  const navigate = useNavigate()

  const handleDeleted = () => {
    navigate({ to: '/boxes' })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <BoxDetails boxNo={parseInt(boxNo, 10)} onDeleted={handleDeleted} />
    </div>
  )
}
