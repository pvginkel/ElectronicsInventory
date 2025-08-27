import { createFileRoute } from '@tanstack/react-router'
import { BoxList } from '@/components/boxes/box-list'

export const Route = createFileRoute('/boxes/')({
  component: Boxes,
})

function Boxes() {
  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-6">
        <span>Storage</span>
      </div>
      
      <BoxList />
    </div>
  )
}