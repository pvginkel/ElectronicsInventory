import { useState, useCallback } from 'react';
import { getThumbnailUrl, generateSrcSet, getSizesAttribute } from '@/lib/utils/thumbnail-urls';

interface ThumbnailProps {
  partKey: string;
  attachmentId: string;
  alt: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  onClick?: () => void;
  isPdf?: boolean;
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
  fallbackIcon
}: ThumbnailProps) {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
    setImageError(false);
  }, []);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setImageError(true);
  }, []);

  const baseClasses = 'rounded-lg bg-muted flex items-center justify-center overflow-hidden';
  const sizeClasses = {
    small: 'w-16 h-16',
    medium: 'w-24 h-24',
    large: 'w-32 h-32'
  };
  
  const clickableClasses = onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : '';
  const combinedClasses = `${baseClasses} ${sizeClasses[size]} ${clickableClasses} ${className}`;

  if (isPdf || imageError) {
    // Show PDF icon or fallback
    return (
      <div className={combinedClasses} onClick={onClick}>
        {fallbackIcon || (
          <div className="text-muted-foreground">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
              <text x="12" y="15" fontSize="8" textAnchor="middle" fill="currentColor">PDF</text>
            </svg>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={combinedClasses} onClick={onClick}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
        </div>
      )}
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
    </div>
  );
}