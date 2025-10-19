import type { ReactNode } from 'react';
import { Card, CardDescription, CardFooter, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { KitSummary } from '@/types/kits';
import { QuantityBadge } from '../parts/quantity-badge';

interface KitCardProps {
  kit: KitSummary;
  controls?: ReactNode;
  className?: string;
}

function formatUpdatedAt(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function KitCard({ kit, controls, className }: KitCardProps) {
  const hasDescription = Boolean(kit.description && kit.description.trim().length > 0);
  const updatedLabel = formatUpdatedAt(kit.updatedAt);
  const shoppingBadgeLabel =
    kit.shoppingListBadgeCount === 1
      ? '1 linked shopping list'
      : `${kit.shoppingListBadgeCount} linked shopping lists`;
  const pickListBadgeLabel =
    kit.pickListBadgeCount === 1
      ? '1 open pick list'
      : `${kit.pickListBadgeCount} open pick lists`;

  return (
    <Card
      className={cn('flex h-full flex-col gap-4', className)}
      data-testid={`kits.overview.card.${kit.id}`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-xl font-semibold leading-tight">{kit.name}</CardTitle>
              
          <div className="flex flex-col items-end gap-2">
            <QuantityBadge quantity={kit.buildTarget} />
          </div>
        
          {kit.status === 'archived' && (
            <Badge variant="outline" className="uppercase tracking-wide text-xs">
              Archived
            </Badge>
          )}
        </div>

        {hasDescription && (
          <CardDescription className="line-clamp-3 text-sm text-muted-foreground">
            {kit.description}
          </CardDescription>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {kit.shoppingListBadgeCount > 0 && (
            <Badge variant="secondary" data-testid={`kits.overview.card.${kit.id}.shopping`}>
              {shoppingBadgeLabel}
            </Badge>
          )}
          {kit.pickListBadgeCount > 0 && (
            <Badge variant="secondary" data-testid={`kits.overview.card.${kit.id}.pick-lists`}>
              {pickListBadgeLabel}
            </Badge>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          Updated <span data-testid={`kits.overview.card.${kit.id}.updated`}>{updatedLabel}</span>
        </div>
      </div>

      {controls && (
        <CardFooter className="mt-auto flex items-center justify-end gap-2 p-0">
          {controls}
        </CardFooter>
      )}
    </Card>
  );
}
