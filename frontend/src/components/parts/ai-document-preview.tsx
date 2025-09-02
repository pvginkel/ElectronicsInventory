import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, FileText, ExternalLink, Image } from 'lucide-react';
import type { components } from '@/lib/api/generated/types';

type DocumentSuggestionSchema = components['schemas']['AIPartCreateSchema.63ff6da.DocumentSuggestionSchema'];

interface AIDocumentPreviewProps {
  document: DocumentSuggestionSchema;
  onDelete: () => void;
  className?: string;
}

export function AIDocumentPreview({ document, onDelete, className }: AIDocumentPreviewProps) {
  const [imageError, setImageError] = useState(false);

  const getDocumentIcon = () => {
    const docType = document.document_type.toLowerCase();
    if (docType.includes('image') || docType.includes('png') || docType.includes('jpg') || docType.includes('jpeg')) {
      return <Image className="h-5 w-5" />;
    }
    return <FileText className="h-5 w-5" />;
  };

  const getDocumentTypeDisplay = () => {
    const docType = document.document_type.toLowerCase();
    if (docType.includes('pdf')) return 'PDF';
    if (docType.includes('image')) return 'Image';
    if (docType.includes('text')) return 'Text';
    return document.document_type;
  };

  return (
    <Card className={`p-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        {/* Document Icon and Content */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Document Icon */}
          <div className="flex-shrink-0 mt-1">
            {getDocumentIcon()}
          </div>

          {/* Document Info */}
          <div className="flex-1 min-w-0">
            {/* Title and URL */}
            <div className="mb-2">
              <h4 className="font-medium text-sm truncate">
                {document.preview?.title || document.url}
              </h4>
              {document.preview?.title && (
                <p className="text-xs text-muted-foreground truncate mt-1">
                  {document.url}
                </p>
              )}
            </div>

            {/* Document Type */}
            <p className="text-sm text-muted-foreground mb-2">
              {document.document_type}
            </p>

            {/* Document Type Badge and External Link */}
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {getDocumentTypeDisplay()}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => window.open(document.url, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                View
              </Button>
            </div>
          </div>

          {/* Preview Image */}
          {document.preview?.image_url && !imageError && (
            <div className="flex-shrink-0">
              <img
                src={document.preview.image_url}
                alt="Document preview"
                className="w-16 h-16 object-cover rounded border"
                onError={() => setImageError(true)}
              />
            </div>
          )}
        </div>

        {/* Delete Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 flex-shrink-0"
          onClick={onDelete}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}