import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { PartList } from '@/components/parts/part-list'
import { AIPartDialog } from '@/components/parts/ai-part-dialog'

export const Route = createFileRoute('/parts/')({
  validateSearch: (search: Record<string, unknown>) => {
    const searchTerm = search.search as string;
    return searchTerm ? { search: searchTerm } : {};
  },
  component: Parts,
})

function Parts() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const [showAIDialog, setShowAIDialog] = useState(false)

  const handleSelectPart = (partId: string) => {
    navigate({ to: '/parts/$partId', params: { partId } })
  }

  const handleCreatePart = () => {
    navigate({ to: '/parts/new' })
  }

  const handleCreateWithAI = () => {
    setShowAIDialog(true)
  }

  const handleAIDialogClose = () => {
    setShowAIDialog(false)
  }

  const handlePartCreated = (partId: string, createAnother: boolean) => {
    if (createAnother) {
      // Keep dialog open and reset for another part
      return
    } else {
      // Navigate to the created part
      navigate({ to: '/parts/$partId', params: { partId } })
    }
  }

  return (
    <div data-testid="parts.page">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-6">
        <span>Parts</span>
      </div>
      
      <PartList 
        searchTerm={search.search || ''}
        onSelectPart={handleSelectPart}
        onCreatePart={handleCreatePart}
        onCreateWithAI={handleCreateWithAI}
      />

      <AIPartDialog
        open={showAIDialog}
        onClose={handleAIDialogClose}
        onPartCreated={handlePartCreated}
      />
    </div>
  )
}
