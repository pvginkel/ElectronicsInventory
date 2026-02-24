/**
 * KanbanSkeletonColumn -- the rightmost column on the Kanban board.
 *
 * Presents a searchable seller dropdown that creates a new seller group
 * when a seller is selected. Sellers that already have columns are excluded
 * from the dropdown options.
 *
 * Hidden when the shopping list is completed (done).
 */
import { useCallback, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SearchableSelect } from '@/components/primitives/searchable-select';
import { useSellers } from '@/hooks/use-sellers';

export interface KanbanSkeletonColumnProps {
  /** IDs of sellers that already have columns (excluded from dropdown). */
  existingSellerIds: Set<number>;
  /** Whether a create mutation is in flight. */
  isCreating: boolean;
  /** Called when the user selects a seller from the dropdown. */
  onCreateGroup: (sellerId: number) => void;
  /** Extra class names for the column root. */
  className?: string;
}

export function KanbanSkeletonColumn({
  existingSellerIds,
  isCreating,
  onCreateGroup,
  className,
}: KanbanSkeletonColumnProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const { data: allSellers = [], isLoading } = useSellers();

  // Filter out sellers that already have columns and apply search
  const availableSellers = useMemo(() => {
    const withoutExisting = allSellers.filter(
      (seller) => !existingSellerIds.has(seller.id),
    );
    if (!searchTerm.trim()) return withoutExisting;
    const term = searchTerm.toLowerCase();
    return withoutExisting.filter((seller) =>
      seller.name.toLowerCase().includes(term),
    );
  }, [allSellers, existingSellerIds, searchTerm]);

  const handleSelect = useCallback(
    (sellerId: number | undefined) => {
      if (sellerId != null) {
        onCreateGroup(sellerId);
        // Reset search after selection
        setSearchTerm('');
        setIsOpen(false);
      }
    },
    [onCreateGroup],
  );

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    if (!isOpen) setSearchTerm('');
  }, [isOpen]);

  return (
    <div
      data-testid="shopping-lists.kanban.skeleton-column"
      className={cn(
        'flex flex-col w-80 shrink-0 rounded-lg border border-dashed bg-muted/20',
        'max-h-full',
        className,
      )}
    >
      {/* Header area */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dashed">
        <Plus className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-muted-foreground">Add seller</h3>
      </div>

      {/* Body: toggle to show the dropdown */}
      <div className="p-3">
        {!isOpen ? (
          <button
            type="button"
            onClick={handleToggle}
            disabled={isCreating}
            className={cn(
              'w-full rounded-md border border-dashed border-border px-3 py-6',
              'flex flex-col items-center justify-center gap-2',
              'text-muted-foreground hover:text-foreground hover:border-foreground/30',
              'transition-colors cursor-pointer',
              isCreating && 'opacity-50 cursor-wait',
            )}
            data-testid="shopping-lists.kanban.skeleton-column.trigger"
          >
            <Plus className="h-6 w-6" />
            <span className="text-sm">Add seller column</span>
          </button>
        ) : (
          <div className="space-y-2">
            <SearchableSelect
              value={undefined}
              onChange={handleSelect}
              options={availableSellers}
              isLoading={isLoading || isCreating}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              placeholder="Search for seller..."
              noResultsText="No sellers available"
              loadingText="Loading sellers..."
              autoFocus
              data-testid="shopping-lists.kanban.skeleton-column.select"
            />
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
