import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from './tooltip';

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
      <Tooltip
        testId={`${testId}.error`}
        content={<div className="w-52 text-xs text-destructive">{errorMessage}</div>}
      >
        <div
          className={cn('flex h-8 w-8 items-center justify-center', containerClassName)}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <AlertTriangle className="h-4 w-4 text-destructive" />
        </div>
      </Tooltip>
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
    <Tooltip
      testId={testId}
      content={<div className={cn('w-64', tooltipClassName)}>{renderTooltip(summary)}</div>}
    >
      <div
        className={cn('flex h-8 w-8 items-center justify-center', containerClassName)}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        tabIndex={0}
        role="button"
        aria-label={label}
        data-testid={testId}
      >
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary transition hover:bg-primary/20',
            iconWrapperClassName
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Tooltip>
  );
}
