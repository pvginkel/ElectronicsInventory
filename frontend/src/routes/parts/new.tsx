import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { PartForm } from '@/components/parts/part-form'

export const Route = createFileRoute('/parts/new')({
  component: NewPart,
})

function NewPart() {
  const navigate = useNavigate()

  const handleSuccess = (partId: string) => {
    navigate({ to: '/parts/$partId', params: { partId } })
  }

  const handleCancel = () => {
    navigate({ to: '/parts' })
  }

  return (
    <div className="p-6">
      <PartForm
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />
    </div>
  )
}