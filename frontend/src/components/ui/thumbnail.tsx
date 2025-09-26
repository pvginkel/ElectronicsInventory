import { useState, useCallback } from 'react';
import { getThumbnailUrl, generateSrcSet, getSizesAttribute } from '@/lib/utils/thumbnail-urls';
import pdfIconSvg from '@/assets/pdf-icon.svg';

interface ThumbnailProps {
  partKey: string;
  attachmentId: string;
  alt: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  onClick?: () => void;
  isPdf?: boolean;
  hasImage?: boolean;
  fallbackIcon?: React.ReactNode;
}

export function Thumbnail({ 
  partKey, 
  attachmentId, 
  alt, 
  size = 'medium',
  className = '',
  onClick,
  isPdf = false,
  hasImage,
  fallbackIcon
}: ThumbnailProps) {
  const [isLoading, setIsLoading] = useState(true);
  const shouldShowImage = hasImage !== false;

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
  }, []);

  const baseClasses = 'rounded-lg bg-muted flex items-center justify-center overflow-hidden';
  const sizeClasses = {
    small: 'w-16 h-16',
    medium: 'w-24 h-24',
    large: 'w-32 h-32'
  };
  
  const clickableClasses = onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : '';
  const combinedClasses = `${baseClasses} ${sizeClasses[size]} ${clickableClasses} ${className}`;

  if (isPdf || !shouldShowImage) {
    // Show PDF icon or fallback
    return (
      <div className={combinedClasses} onClick={onClick}>
        {fallbackIcon || (
          <img src={pdfIconSvg} alt="PDF" width="40%" height="40%" className="text-muted-foreground" />
        )}
      </div>
    );
  }

  return (
    <div className={combinedClasses} onClick={onClick}>
      {isLoading && shouldShowImage && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
        </div>
      )}
      {shouldShowImage && (
        <img
          src={getThumbnailUrl(partKey, attachmentId, size)}
          srcSet={generateSrcSet(partKey, attachmentId)}
          sizes={getSizesAttribute()}
          alt={alt}
          className={`w-full h-full object-cover ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity`}
          onLoad={handleImageLoad}
          onError={handleImageError}
          loading="lazy"
        />
      )}
    </div>
  );
}
