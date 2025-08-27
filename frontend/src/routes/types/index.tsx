import { createFileRoute } from '@tanstack/react-router'
import { TypeList } from '@/components/types/TypeList'

export const Route = createFileRoute('/types/')({
  component: Types,
})

function Types() {
  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-6">
        <span>Types</span>
      </div>
      
      <TypeList />
    </div>
  )
}