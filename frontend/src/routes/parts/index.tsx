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
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-6">
        <span>Parts</span>
      </div>
      
      <PartList 
        onSelectPart={handleSelectPart}
        onCreatePart={handleCreatePart}
      />
    </div>
  )
}