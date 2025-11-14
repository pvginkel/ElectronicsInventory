import { CoverImageDisplay } from '@/components/documents/cover-image-display';
import { Card } from '@/components/ui/card';
import { Tooltip } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { formatPartForDisplay } from '@/lib/utils/parts';
import { AIPartConfidenceBadge } from './ai-confidence-badge';
import type { DuplicatePartEntry } from '@/types/ai-parts';
import type { components } from '@/lib/api/generated/types';

type PartResponseSchema = components['schemas']['PartResponseSchema.1a46b79'];

interface AIPartDuplicateCardProps {
  duplicate: DuplicatePartEntry;
  part: PartResponseSchema | undefined;
  isLoading?: boolean;
  isError?: boolean;
  onClick?: () => void;
  inTooltip?: boolean; // If true, remove border to avoid double-border with tooltip
}

/**
 * Card component for displaying a potential duplicate part in the AI analysis flow.
 * Shows cover image, description, part key, confidence badge, and reasoning tooltip.
 */
export function AIPartDuplicateCard({
  duplicate,
  part,
  isLoading,
  isError,
  onClick,
  inTooltip = false,
}: AIPartDuplicateCardProps) {
  // Format part display data using shared utility
  const { displayDescription } = part
    ? formatPartForDisplay({
        key: part.key,
        description: part.description,
        manufacturer_code: part.manufacturer_code,
      })
    : { displayDescription: duplicate.partKey };

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      // Default behavior: open part in new tab
      window.open(`/parts/${duplicate.partKey}`, '_blank');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <Card
        variant={inTooltip ? "slim" : "grid-tile-disabled"}
        className="flex flex-col h-full animate-pulse max-w-[180px]"
        data-testid={`parts.ai.duplicates.card.${duplicate.partKey}`}
      >
        <div className="flex-shrink-0 mb-2">
          <div className="w-full h-32 bg-muted rounded-md" />
        </div>
        <div className="h-4 bg-muted rounded mb-1" />
        <div className="h-3 bg-muted rounded w-2/3 mb-2" />
        <div className="mt-auto h-6 bg-muted rounded w-16" />
      </Card>
    );
  }

  // Error state fallback
  if (isError || !part) {
    return (
      <Card
        variant={inTooltip ? "slim" : "grid-tile"}
        onClick={handleClick}
        className="flex flex-col h-full max-w-[180px]"
        data-testid={`parts.ai.duplicates.card.${duplicate.partKey}`}
        data-part-key={duplicate.partKey}
      >
        <div className="flex-shrink-0 mb-2">
          <CoverImageDisplay
            partId={duplicate.partKey}
            hasCoverAttachment={false}
            size="large"
            className="w-full h-32 rounded-md shadow-sm"
            showPlaceholder={true}
          />
        </div>

        <h3 className="text-sm font-semibold text-foreground mb-1 leading-tight">
          #{duplicate.partKey}
        </h3>

        <p className="text-xs text-muted-foreground mb-2">
          Unable to load part details
        </p>

        <div className="mt-auto flex items-center gap-2">
          <AIPartConfidenceBadge confidence={duplicate.confidence} />
          {/* Tooltip testId uses .card. prefix to distinguish from bar context */}
          {inTooltip || <Tooltip
            content={<div className="text-xs max-w-xs">{duplicate.reasoning}</div>}
            testId={`parts.ai.duplicate-reasoning.card.${duplicate.partKey}`}
          >
            <Info className="h-4 w-4 text-muted-foreground" />
          </Tooltip>}
        </div>
      </Card>
    );
  }

  // Success state with loaded part data
  return (
    <Card
      variant={inTooltip ? "slim" : "grid-tile"}
      onClick={handleClick}
      className="flex flex-col h-full max-w-[180px]"
      data-testid={`parts.ai.duplicates.card.${duplicate.partKey}`}
      data-part-key={duplicate.partKey}
    >
      {/* Cover Image - using large size (128x128) */}
      <div className="flex-shrink-0 mb-2">
        <CoverImageDisplay
          partId={part.key}
          hasCoverAttachment={!!part.cover_attachment}
          size="large"
          className="w-full h-32 rounded-md shadow-sm"
          showPlaceholder={true}
        />
      </div>

      {/* Part Name/Description - 2 lines max with ellipsis */}
      <h3
        className="text-sm font-semibold text-foreground mb-1 leading-tight overflow-hidden line-clamp-2"
        title={displayDescription}
      >
        {displayDescription}
      </h3>

      {/* Part Key - 1 line max with ellipsis */}
      <p
        className="text-xs text-muted-foreground mb-2 overflow-hidden text-ellipsis whitespace-nowrap font-mono"
        title={part.key}
      >
        #{part.key}
      </p>

      {/* Confidence Badge + Reasoning Tooltip */}
      <div className="mt-auto flex items-center gap-2">
        <AIPartConfidenceBadge confidence={duplicate.confidence} />
        {/* Tooltip testId uses .card. prefix to distinguish from bar context */}
        {inTooltip || <Tooltip
          content={<div className="text-xs max-w-xs">{duplicate.reasoning}</div>}
          testId={`parts.ai.duplicate-reasoning.card.${duplicate.partKey}`}
        >
          <Info className="h-4 w-4 text-muted-foreground" />
        </Tooltip>}
      </div>
    </Card>
  );
}
