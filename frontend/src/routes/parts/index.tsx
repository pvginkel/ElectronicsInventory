import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { PartList } from '@/components/parts/part-list'

export const Route = createFileRoute('/parts/')({
  component: Parts,
})

function Parts() {
  const navigate = useNavigate()

  const handleSelectPart = (partId: string) => {
    navigate({ to: '/parts/$partId', params: { partId } })
  }

  const handleCreatePart = () => {
    navigate({ to: '/parts/new' })
  }

  return (
    <div className="p-6">
      <PartList 
        onSelectPart={handleSelectPart}
        onCreatePart={handleCreatePart}
      />
    </div>
  )
}