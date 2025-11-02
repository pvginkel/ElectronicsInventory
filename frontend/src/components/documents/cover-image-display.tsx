import { useState, useMemo, useEffect } from 'react';
import { useCoverAttachment } from '@/hooks/use-cover-image';
import { getCoverThumbnailUrl, generateCoverSrcSet, getSizesAttribute } from '@/lib/utils/thumbnail-urls';
import pdfIconSvg from '@/assets/pdf-icon.svg';
import { ImagePlaceholderIcon } from '@/components/icons/ImagePlaceholderIcon';
import { cn } from '@/lib/utils';

interface CoverImageDisplayProps {
  partId: string;
  hasCoverAttachment?: boolean;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  showPlaceholder?: boolean;
}

export function CoverImageDisplay({ 
  partId, 
  hasCoverAttachment,
  size = 'medium', 
  className = '', 
  showPlaceholder = false 
}: CoverImageDisplayProps) {
  const { coverAttachment, isLoading, dataUpdatedAt } = useCoverAttachment(partId, hasCoverAttachment);
  const [imageError, setImageError] = useState(false);

  const reloadToken = useMemo(() => {
    if (typeof dataUpdatedAt === 'number') {
      return dataUpdatedAt.toString();
    }
    if (coverAttachment?.updated_at) {
      return String(coverAttachment.updated_at);
    }
    return coverAttachment ? `${coverAttachment.id ?? ''}` : 'initial';
  }, [coverAttachment, dataUpdatedAt]);

  // Reset image error when cache buster changes (new image to load)
  useEffect(() => {
    setImageError(false);
  }, [reloadToken]);

  if (hasCoverAttachment !== false && isLoading) {
    return (
      <div className={cn('rounded-lg bg-muted animate-pulse', getSizeClasses(size), className)} />
    );
  }

  if (!coverAttachment) {
    if (showPlaceholder) {
      return (
        <div className={`rounded-lg bg-muted border-2 border-dashed border-muted-foreground/25 flex items-center justify-center ${getSizeClasses(size)} ${className}`}>
          <div className="text-center text-muted-foreground">
            <ImagePlaceholderIcon />
            <div className="text-xs">No cover image</div>
          </div>
        </div>
      );
    }
    return null;
  }

  const isPdf = coverAttachment.attachment_type === 'pdf' || 
               (coverAttachment.content_type === 'application/pdf') || 
               (coverAttachment.filename?.toLowerCase().endsWith('.pdf'));

  if (isPdf || imageError) {
    return (
      <div className={`rounded-lg bg-muted flex items-center justify-center ${getSizeClasses(size)} ${className}`}>
        <div className="text-center text-muted-foreground">
          <img src={pdfIconSvg} alt="PDF" width="40%" height="40%" className="mx-auto" />
          <div className="text-xs mt-1">{coverAttachment.title}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg overflow-hidden bg-muted ${getSizeClasses(size)} ${className}`}>
      <img
        key={`cover-${partId}-${reloadToken}`}
        src={getCoverThumbnailUrl(partId, size)}
        srcSet={generateCoverSrcSet(partId)}
        sizes={getSizesAttribute()}
        alt={coverAttachment.title}
        className="w-full h-full object-cover"
        onError={() => setImageError(true)}
        loading="lazy"
      />
    </div>
  );
}

function getSizeClasses(size: 'small' | 'medium' | 'large'): string {
  switch (size) {
    case 'small':
      return 'w-16 h-16';
    case 'medium':
      return 'w-24 h-24';
    case 'large':
      return 'w-32 h-32';
    default:
      return 'w-24 h-24';
  }
}
