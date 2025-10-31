import type { ShoppingListDetail, ShoppingListKitLink } from '@/types/shopping-lists';
import { useShoppingListDetailHeaderSlots } from './detail-header-slots';

export interface ConceptHeaderProps {
  list?: ShoppingListDetail;
  onUpdateMetadata: (update: { name: string; description: string | null }) => Promise<void>;
  isUpdating: boolean;
  onDeleteList?: () => void;
  isDeletingList?: boolean;
  overviewSearchTerm?: string;
  onUnlinkKit?: (link: ShoppingListKitLink) => void;
  unlinkingLinkId?: number | null;
}

export function ConceptHeader(props: ConceptHeaderProps) {
  const { list } = props;
  const { slots, overlays } = useShoppingListDetailHeaderSlots(props);
  const { breadcrumbs, title, titleMetadata, description, metadataRow, actions } = slots;

  if (!list) {
    return (
      <div className="space-y-4" data-testid="shopping-lists.concept.header.loading">
        {breadcrumbs}
        <div className="space-y-2">
          {title}
          {description}
        </div>
        {metadataRow}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="shopping-lists.concept.header">
      {breadcrumbs}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold text-foreground">
              {title}
            </h1>
            {titleMetadata}
          </div>
          {description}
        </div>
        {actions}
      </div>

      {metadataRow}
      {overlays}
    </div>
  );
}
