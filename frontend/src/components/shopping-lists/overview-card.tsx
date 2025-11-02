import { KeyValueBadge, StatusBadge } from '@/components/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ShoppingListOverviewSummary } from '@/types/shopping-lists';

interface ShoppingListOverviewCardProps {
  list: ShoppingListOverviewSummary;
  onOpen: () => void;
  disabled?: boolean;
}

// Map shopping list status to badge props
function getShoppingListStatusBadgeProps(status: ShoppingListOverviewSummary['status']): { color: 'inactive' | 'active'; label: string } {
  switch (status) {
    case 'concept':
      return { color: 'inactive', label: 'Concept' };
    case 'ready':
      return { color: 'active', label: 'Ready' };
    case 'done':
      return { color: 'inactive', label: 'Completed' };
  }
}

export function ShoppingListOverviewCard({
  list,
  onOpen,
  disabled = false,
}: ShoppingListOverviewCardProps) {
  const statusBadgeProps = getShoppingListStatusBadgeProps(list.status);
  const tabIndex = disabled ? -1 : 0;

  const handleSelect = () => {
    if (disabled) {
      return;
    }

    onOpen();
  };

  return (
    <Card
      variant={disabled ? "grid-tile-disabled" : "grid-tile"}
      data-testid={`shopping-lists.overview.card.${list.id}`}
      tabIndex={tabIndex}
      role="button"
      aria-disabled={disabled}
      aria-label={`Open shopping list ${list.name}`}
      onClick={handleSelect}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base leading-tight" data-testid={`shopping-lists.overview.card.${list.id}.name`}>
              {list.name}
            </CardTitle>
            {list.description && (
              <CardDescription className="line-clamp-2" data-testid={`shopping-lists.overview.card.${list.id}.description`}>
                {list.description}
              </CardDescription>
            )}
            {list.primarySellerName && (
              <p className="text-xs text-muted-foreground" data-testid={`shopping-lists.overview.card.${list.id}.primary-seller`}>
                Primary seller: {list.primarySellerName}
              </p>
            )}
          </div>
          <StatusBadge
            {...statusBadgeProps}
            testId={`shopping-lists.overview.card.${list.id}.status`}
          />
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <KeyValueBadge
            label="New"
            value={list.lineCounts.new}
            color="info"
            testId={`shopping-lists.overview.card.${list.id}.lines-new`}
          />
          <KeyValueBadge
            label="Ordered"
            value={list.lineCounts.ordered}
            color="warning"
            testId={`shopping-lists.overview.card.${list.id}.lines-ordered`}
          />
          <KeyValueBadge
            label="Completed"
            value={list.lineCounts.done}
            color="success"
            testId={`shopping-lists.overview.card.${list.id}.lines-done`}
          />
        </div>
        {list.totalLines === 0 && (
          <p className="text-xs text-muted-foreground" data-testid={`shopping-lists.overview.card.${list.id}.empty-hint`}>
            No lines yet—start filling the Concept list to enable Mark Ready.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
