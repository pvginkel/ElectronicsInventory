import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/parts/')({
  component: Parts,
})

function Parts() {
  return (
    <div className="p-2">
      <h3 className="text-2xl font-bold">Parts</h3>
      <p className="mt-2">Parts listing will be implemented here.</p>
    </div>
  )
}