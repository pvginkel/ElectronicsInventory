import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormScreenLayout } from '@/components/layout/form-screen-layout';
import { PartForm } from '@/components/parts/part-form';

export const Route = createFileRoute('/parts/$partId/edit')({
  component: PartEditScreen,
});

function PartEditScreen() {
  const { partId } = Route.useParams();
  const navigate = useNavigate();

  const handleSuccess = (updatedPartId: string) => {
    navigate({ to: '/parts/$partId', params: { partId: updatedPartId } });
  };

  const handleCancel = () => {
    navigate({ to: '/parts/$partId', params: { partId } });
  };

  return (
    <div className="flex h-full min-h-0 flex-col p-6">
      <PartForm
        partId={partId}
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
                <span>{partId}</span>
              </>
            }
            title={`Edit Part ${partId}`}
            footer={footer}
          >
            {content}
          </FormScreenLayout>
        )}
      />
    </div>
  );
}
