import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MembershipIndicatorProps<TSummary> {
  summary?: TSummary;
  status: 'pending' | 'error' | 'success';
  fetchStatus: 'idle' | 'fetching' | 'paused';
  error: unknown;
  testId: string;
  icon: LucideIcon;
  ariaLabel: (summary: TSummary) => string;
  hasMembership: (summary: TSummary) => boolean;
  renderTooltip: (summary: TSummary) => ReactNode;
  errorMessage: string;
  tooltipClassName?: string;
  iconWrapperClassName?: string;
  containerClassName?: string;
}

export function MembershipIndicator<TSummary>({
  summary,
  status,
  fetchStatus,
  error,
  testId,
  icon: Icon,
  ariaLabel,
  hasMembership,
  renderTooltip,
  errorMessage,
  tooltipClassName,
  iconWrapperClassName,
  containerClassName,
}: MembershipIndicatorProps<TSummary>) {
  const isPending = status === 'pending';
  const isRefetching = fetchStatus === 'fetching';
  const hasError = status === 'error' || Boolean(error);

  if (isPending) {
    return (
      <div className="flex h-8 w-8 items-center justify-center" data-testid={`${testId}.loading`}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div
        className={cn('group relative flex h-8 w-8 items-center justify-center', containerClassName)}
        data-testid={`${testId}.error`}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-52 rounded-md border border-destructive/50 bg-background p-2 text-xs text-destructive shadow-lg group-hover:block">
          {errorMessage}
        </div>
      </div>
    );
  }

  if (!summary || !hasMembership(summary)) {
    if (isRefetching) {
      return (
        <div className="flex h-8 w-8 items-center justify-center" data-testid={`${testId}.loading`}>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return null;
  }

  const label = ariaLabel(summary);

  return (
    <div
      className={cn('group relative flex h-8 w-8 items-center justify-center', containerClassName)}
      data-testid={testId}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      tabIndex={0}
      role="button"
      aria-label={label}
    >
      <div
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary transition group-hover:bg-primary/20',
          iconWrapperClassName
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div
        className={cn(
          'pointer-events-auto absolute right-0 top-full z-50 mt-2 hidden w-64 rounded-md border border-input bg-background p-3 text-sm shadow-lg group-hover:block group-focus-within:block',
          tooltipClassName
        )}
        data-testid={`${testId}.tooltip`}
      >
        {renderTooltip(summary)}
      </div>
    </div>
  );
}
