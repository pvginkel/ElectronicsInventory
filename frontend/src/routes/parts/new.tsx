import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { PartForm } from '@/components/parts/part-form'

// Define search params type
interface NewPartSearch {
  duplicate?: string;
}

export const Route = createFileRoute('/parts/new')({
  component: NewPart,
  validateSearch: (search): NewPartSearch => {
    return {
      duplicate: typeof search.duplicate === 'string' ? search.duplicate : undefined,
    }
  },
})

function NewPart() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/parts/new' })

  const handleSuccess = (partId: string) => {
    navigate({ to: '/parts/$partId', params: { partId } })
  }

  const handleCancel = () => {
    navigate({ to: '/parts' })
  }

  return (
    <div className="p-6">
      <PartForm
        duplicateFromPartId={search.duplicate}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />
    </div>
  )
}