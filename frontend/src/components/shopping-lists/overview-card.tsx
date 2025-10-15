import type { KeyboardEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { ShoppingListOverviewSummary } from '@/types/shopping-lists';

interface ShoppingListOverviewCardProps {
  list: ShoppingListOverviewSummary;
  onOpen: () => void;
  disabled?: boolean;
}

const STATUS_LABELS: Record<ShoppingListOverviewSummary['status'], string> = {
  concept: 'Concept',
  ready: 'Ready',
  done: 'Completed',
};

const STATUS_BADGE_VARIANT: Record<ShoppingListOverviewSummary['status'], 'default' | 'secondary' | 'outline'> = {
  concept: 'default',
  ready: 'secondary',
  done: 'outline',
};

function formatRelativeUpdated(updatedAt: string): string {
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return 'recently';
  }

  const diffMs = new Date().getTime() - parsed.getTime();
  const diffMinutes = Math.max(Math.round(diffMs / 60000), 0);

  if (diffMinutes < 1) {
    return 'just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  const diffWeeks = Math.round(diffDays / 7);
  if (diffWeeks < 5) {
    return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`;
  }

  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
  }

  const diffYears = Math.round(diffDays / 365);
  return `${diffYears} year${diffYears === 1 ? '' : 's'} ago`;
}

export function ShoppingListOverviewCard({
  list,
  onOpen,
  disabled = false,
}: ShoppingListOverviewCardProps) {
  const statusLabel = STATUS_LABELS[list.status] ?? list.status;
  const statusVariant = STATUS_BADGE_VARIANT[list.status] ?? 'secondary';
  const relativeUpdated = formatRelativeUpdated(list.updatedAt);
  const updatedTooltip = new Date(list.updatedAt).toLocaleString();
  const interactiveClasses = disabled ? 'pointer-events-none opacity-60' : 'cursor-pointer';
  const tabIndex = disabled ? -1 : 0;

  const handleSelect = () => {
    if (disabled) {
      return;
    }

    onOpen();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect();
    }
  };

  return (
    <Card
      variant="content"
      className={`group transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${interactiveClasses}`}
      data-testid={`shopping-lists.overview.card.${list.id}`}
      tabIndex={tabIndex}
      role="button"
      aria-disabled={disabled}
      aria-label={`Open shopping list ${list.name}`}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
    >
      <CardHeader className="pb-3">
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
          <Badge
            variant={statusVariant}
            title={`List status: ${statusLabel}`}
            data-testid={`shopping-lists.overview.card.${list.id}.status`}
          >
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge
            variant="outline"
            className="bg-slate-100 text-slate-700"
            title="New lines still in planning"
            data-testid={`shopping-lists.overview.card.${list.id}.lines-new`}
          >
            New {list.lineCounts.new}
          </Badge>
          <Badge
            variant="outline"
            className="bg-amber-100 text-amber-800"
            title="Ordered lines awaiting receipt"
            data-testid={`shopping-lists.overview.card.${list.id}.lines-ordered`}
          >
            Ordered {list.lineCounts.ordered}
          </Badge>
          <Badge
            variant="outline"
            className="bg-emerald-100 text-emerald-800"
            title="Done lines already received"
            data-testid={`shopping-lists.overview.card.${list.id}.lines-done`}
          >
            Done {list.lineCounts.done}
          </Badge>
        </div>
        {list.totalLines === 0 && (
          <p className="text-xs text-muted-foreground" data-testid={`shopping-lists.overview.card.${list.id}.empty-hint`}>
            No lines yet—start filling the Concept list to enable Mark Ready.
          </p>
        )}
      </CardContent>

      <CardFooter className="pt-3">
        <span
          className="text-xs text-muted-foreground"
          title={updatedTooltip}
          data-testid={`shopping-lists.overview.card.${list.id}.updated`}
        >
          Updated {relativeUpdated}
        </span>
      </CardFooter>
    </Card>
  );
}
