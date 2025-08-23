import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/search')({
  component: Search,
})

function Search() {
  return (
    <div className="p-2">
      <h3 className="text-2xl font-bold">Search Parts</h3>
      <p className="mt-2">Search functionality will be implemented here.</p>
    </div>
  )
}