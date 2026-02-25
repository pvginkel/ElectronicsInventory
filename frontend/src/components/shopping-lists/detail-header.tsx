import type { ShoppingListDetail, ShoppingListKitLink } from '@/types/shopping-lists';

export interface DetailHeaderProps {
  list?: ShoppingListDetail;
  onUpdateMetadata: (update: { name: string; description: string | null }) => Promise<void>;
  isUpdating: boolean;
  onDeleteList?: () => void;
  isDeletingList?: boolean;
  overviewSearchTerm?: string;
  onUnlinkKit?: (link: ShoppingListKitLink) => void;
  unlinkingLinkId?: number | null;
}
