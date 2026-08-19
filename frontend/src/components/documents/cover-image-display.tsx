import { useState, useEffect } from 'react';
import { appendThumbnailParam, generateSrcSetFromUrl, getSizesAttribute, THUMBNAIL_SIZES } from '@/lib/utils/thumbnail-urls';
import { ImagePlaceholderIcon } from '@/components/icons/ImagePlaceholderIcon';

interface CoverImageDisplayProps {
  partId?: string;
  kitId?: string;
  coverUrl: string | null;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  showPlaceholder?: boolean;
  alt?: string;
}

export function CoverImageDisplay({
  partId,
  kitId,
  coverUrl,
  size = 'medium',
  className = '',
  showPlaceholder = false,
  alt
}: CoverImageDisplayProps) {
  // Determine default alt text based on entity type
  const defaultAlt = partId ? 'Part cover image' : kitId ? 'Kit cover image' : 'Cover image';
  const altText = alt ?? defaultAlt;
  const [imageError, setImageError] = useState(false);

  // Reset image error when coverUrl changes (new image to load)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset error state when coverUrl changes (new image)
    setImageError(false);
  }, [coverUrl]);

  if (!coverUrl) {
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

  if (imageError) {
    return (
      <div className={`rounded-lg bg-muted flex items-center justify-center ${getSizeClasses(size)} ${className}`}>
        <div className="text-center text-muted-foreground">
          <ImagePlaceholderIcon />
          <div className="text-xs">Image unavailable</div>
        </div>
      </div>
    );
  }

  const sizeValue = THUMBNAIL_SIZES[size];
  const thumbnailUrl = appendThumbnailParam(coverUrl, sizeValue);
  const srcSet = generateSrcSetFromUrl(coverUrl);

  return (
    <div className={`rounded-lg overflow-hidden bg-muted ${getSizeClasses(size)} ${className}`}>
      <img
        key={`cover-${partId}-${coverUrl}`}
        src={thumbnailUrl ?? undefined}
        srcSet={srcSet}
        sizes={getSizesAttribute()}
        alt={altText}
        className="w-full h-full object-cover"
        onError={() => setImageError(true)}
        loading="lazy"
      />
    </div>
  );
}

function getSizeClasses(size: 'small' | 'medium' | 'large'): string {
  // Include shrink-0 to prevent the container from shrinking in flex layouts,
  // which can cause images with landscape aspect ratios (like OG images from
  // link documents) to appear narrower than their height.
  switch (size) {
    case 'small':
      return 'w-16 h-16 shrink-0';
    case 'medium':
      return 'w-24 h-24 shrink-0';
    case 'large':
      return 'w-32 h-32 shrink-0';
    default:
      return 'w-24 h-24 shrink-0';
  }
}
