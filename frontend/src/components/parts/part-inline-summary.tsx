import { Link } from '@tanstack/react-router';

import { cn } from '@/lib/utils';

interface PartInlineSummaryProps {
  partKey: string;
  description: string;
  manufacturerCode?: string | null;
  className?: string;
  testId?: string;
}

export function PartInlineSummary({
  partKey,
  description,
  manufacturerCode,
  className,
  testId,
}: PartInlineSummaryProps) {
  return (
    <Link
      to="/parts/$partId"
      params={{ partId: partKey }}
      className={cn(
        'group -mx-2.5 -my-1 inline-flex w-[calc(100%+1rem)] flex-col gap-1 rounded-md px-2.5 py-1 transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      data-testid={testId}
    >
      <span className="font-medium text-foreground transition-colors group-hover:text-primary">
        {description}
      </span>
      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">Key {partKey}</span>
        {manufacturerCode ? <span>MPN {manufacturerCode}</span> : null}
      </span>
    </Link>
  );
}
