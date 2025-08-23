import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  return (
    <div className="p-2">
      <h3 className="text-2xl font-bold">Electronics Inventory</h3>
      <p className="mt-2">Welcome to your electronics parts inventory system.</p>
    </div>
  )
}