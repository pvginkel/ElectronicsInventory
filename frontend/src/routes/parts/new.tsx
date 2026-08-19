import { createFileRoute, Link, useNavigate, useSearch } from '@tanstack/react-router'
import { PartForm } from '@/components/parts/part-form'
import { FormScreenLayout } from '@/components/layout/form-screen-layout'

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
    <div className="flex h-full min-h-0 flex-col p-6">
      <PartForm
        duplicateFromPartId={search.duplicate}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
        renderLayout={({ content, footer }) => (
          <FormScreenLayout
            className="flex-1 min-h-0"
            rootTestId="parts.form.layout"
            cardTestId="parts.form.card"
            headerTestId="parts.form.header"
            contentTestId="parts.form.content"
            footerTestId="parts.form.footer"
            actionsTestId="parts.form.actions"
            breadcrumbs={
              <>
                <Link to="/parts" className="hover:text-foreground">
                  Parts
                </Link>
                <span>/</span>
                <span>{search.duplicate ? `Duplicate ${search.duplicate}` : 'New'}</span>
              </>
            }
            title={search.duplicate ? 'Duplicate Part' : 'Add Part'}
            footer={footer}
          >
            {content}
          </FormScreenLayout>
        )}
      />
    </div>
  )
}
