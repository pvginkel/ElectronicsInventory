import { Link } from '@tanstack/react-router';

import { cn } from '@/lib/utils';
import { CodeBadge } from '@/components/ui';
import { CoverImageDisplay } from '@/components/documents/cover-image-display';

interface PartInlineSummaryProps {
  partKey: string;
  description: string;
  manufacturerCode?: string | null;
  className?: string;
  testId?: string;
  link?: boolean;
  showCoverImage?: boolean;
}

export function PartInlineSummary({
  partKey,
  description,
  manufacturerCode,
  className,
  testId,
  link = false,
  showCoverImage = true,
}: PartInlineSummaryProps) {
  const baseClasses = cn(
    '-mx-2.5 -my-1 inline-flex w-[calc(100%+1rem)] flex-col gap-1 rounded-md px-2.5 py-1',
    link ? 'group transition hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring' : '',
    className,
  );

  const titleClasses = cn(
    'font-medium text-foreground transition-colors',
    link ? 'group-hover:text-primary' : '',
  );

  const metadataClasses = 'flex flex-wrap items-center gap-2 text-xs text-muted-foreground';

  const textContent = (
    <div className="flex flex-col gap-1">
      <span className={titleClasses}>{description}</span>
      <span className={metadataClasses}>
        <CodeBadge code={`Key ${partKey}`} />
        {manufacturerCode ? <span>MPN {manufacturerCode}</span> : null}
      </span>
    </div>
  );

  const content = showCoverImage ? (
    <div className="flex items-center gap-4">
      <CoverImageDisplay partId={partKey} size="small" />
      {textContent}
    </div>
  ) : textContent;

  if (!link) {
    return (
      <div className={baseClasses} data-testid={testId}>
        {content}
      </div>
    );
  }

  return (
    <Link
      to="/parts/$partId"
      params={{ partId: partKey }}
      className={baseClasses}
      data-testid={testId}
    >
      {content}
    </Link>
  );
}
