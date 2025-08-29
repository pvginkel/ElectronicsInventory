import { useState, useMemo, useEffect } from 'react';
import { useCoverAttachment } from '@/hooks/use-cover-image';
import { getCoverThumbnailUrl, generateCoverSrcSet, getSizesAttribute } from '@/lib/utils/thumbnail-urls';

interface CoverImageDisplayProps {
  partId: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  showPlaceholder?: boolean;
}

export function CoverImageDisplay({ 
  partId, 
  size = 'medium', 
  className = '', 
  showPlaceholder = false 
}: CoverImageDisplayProps) {
  const { coverAttachment, isLoading, dataUpdatedAt } = useCoverAttachment(partId);
  const [imageError, setImageError] = useState(false);

  // Generate cache buster based on when the cover data was last updated
  const cacheBuster = useMemo(() => {
    return dataUpdatedAt || Date.now();
  }, [dataUpdatedAt]);

  // Reset image error when cache buster changes (new image to load)
  useEffect(() => {
    setImageError(false);
  }, [cacheBuster]);

  if (isLoading) {
    return (
      <div className={`rounded-lg bg-muted animate-pulse ${getSizeClasses(size)} ${className}`} />
    );
  }

  if (!coverAttachment) {
    if (showPlaceholder) {
      return (
        <div className={`rounded-lg bg-muted border-2 border-dashed border-muted-foreground/25 flex items-center justify-center ${getSizeClasses(size)} ${className}`}>
          <div className="text-center text-muted-foreground">
            <svg 
              className="w-8 h-8 mx-auto mb-2" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
              />
            </svg>
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
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
            <text x="12" y="15" fontSize="8" textAnchor="middle" fill="currentColor">PDF</text>
          </svg>
          <div className="text-xs mt-1">{coverAttachment.title}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg overflow-hidden bg-muted ${getSizeClasses(size)} ${className}`}>
      <img
        key={`cover-${partId}-${cacheBuster}`}
        src={getCoverThumbnailUrl(partId, size, cacheBuster)}
        srcSet={generateCoverSrcSet(partId, cacheBuster)}
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