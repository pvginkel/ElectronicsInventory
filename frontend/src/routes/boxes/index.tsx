import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/boxes/')({
  component: Boxes,
})

function Boxes() {
  return (
    <div className="p-2">
      <h3 className="text-2xl font-bold">Storage Boxes</h3>
      <p className="mt-2">Storage box management will be implemented here.</p>
    </div>
  )
}