import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { SectionHeading } from './section-heading';

export interface MembershipTooltipContentItem {
  id: string | number;
  label: string;
  statusBadge: ReactNode;
  link?: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, unknown>;
  };
  metadata?: ReactNode[];
}

export interface MembershipTooltipContentProps {
  heading: string;
  items: MembershipTooltipContentItem[];
  emptyMessage: string;
  testId?: string;
}

export function MembershipTooltipContent({
  heading,
  items,
  emptyMessage,
  testId,
}: MembershipTooltipContentProps) {
  // Empty state: no items to display
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={testId}>
        {emptyMessage}
      </p>
    );
  }

  // Render list of membership items
  return (
    <div data-testid={testId}>
      <SectionHeading>{heading}</SectionHeading>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="space-y-1">
            {/* Item header: linked or plain text */}
            {item.link ? (
              <Link
                to={item.link.to}
                params={item.link.params}
                search={item.link.search}
                className="flex items-center justify-between gap-2 truncate text-sm hover:text-primary"
                onClick={(event) => event.stopPropagation()}
              >
                <span className="truncate">{item.label}</span>
                {item.statusBadge}
              </Link>
            ) : (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium">{item.label}</span>
                {item.statusBadge}
              </div>
            )}

            {/* Metadata row (optional) */}
            {item.metadata && item.metadata.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {item.metadata}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
