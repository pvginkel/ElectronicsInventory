import { createFileRoute } from '@tanstack/react-router';
import { PartDetails } from '@/components/parts/part-details';

export const Route = createFileRoute('/parts/$partId/')({
  component: PartDetailScreen,
});

function PartDetailScreen() {
  const { partId } = Route.useParams();

  return <PartDetails partId={partId} />;
}
