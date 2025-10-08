import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { ShoppingListOverviewSummary } from '@/types/shopping-lists';

interface ShoppingListOverviewCardProps {
  list: ShoppingListOverviewSummary;
  onOpen: () => void;
  onDelete: () => void;
  disableActions?: boolean;
}

const STATUS_LABELS: Record<ShoppingListOverviewSummary['status'], string> = {
  concept: 'Concept',
  ready: 'Ready',
  done: 'Done',
};

export function ShoppingListOverviewCard({
  list,
  onOpen,
  onDelete,
  disableActions = false,
}: ShoppingListOverviewCardProps) {
  const statusLabel = STATUS_LABELS[list.status] ?? list.status;

  return (
    <Card
      variant="content"
      className="hover:shadow-md transition-shadow"
      data-testid={`shopping-lists.overview.card.${list.id}`}
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
          <Badge variant="secondary" data-testid={`shopping-lists.overview.card.${list.id}.status`}>
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" data-testid={`shopping-lists.overview.card.${list.id}.lines-total`}>
            {list.totalLines} line{list.totalLines === 1 ? '' : 's'}
          </Badge>
          <Badge variant="outline" className="bg-slate-100 text-slate-700" data-testid={`shopping-lists.overview.card.${list.id}.lines-new`}>
            New {list.lineCounts.new}
          </Badge>
          <Badge variant="outline" className="bg-amber-100 text-amber-800" data-testid={`shopping-lists.overview.card.${list.id}.lines-ordered`}>
            Ordered {list.lineCounts.ordered}
          </Badge>
          <Badge variant="outline" className="bg-emerald-100 text-emerald-800" data-testid={`shopping-lists.overview.card.${list.id}.lines-done`}>
            Done {list.lineCounts.done}
          </Badge>
        </div>
        {list.totalLines === 0 && (
          <p className="text-xs text-muted-foreground" data-testid={`shopping-lists.overview.card.${list.id}.empty-hint`}>
            No lines yet—start filling the Concept list to enable Mark Ready.
          </p>
        )}
      </CardContent>

      <CardFooter className="justify-between">
        <span className="text-xs text-muted-foreground" data-testid={`shopping-lists.overview.card.${list.id}.updated`}>
          Updated {new Date(list.updatedAt).toLocaleDateString()}
        </span>
        <div className="flex gap-2">
          <Button size="sm" onClick={onOpen} data-testid={`shopping-lists.overview.card.${list.id}.open`}>
            Open list
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={disableActions}
            data-testid={`shopping-lists.overview.card.${list.id}.delete`}
          >
            Delete
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
