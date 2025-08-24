import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PartLocationGrid } from './part-location-grid';
import { PartForm } from './part-form';
import { useGet__parts__part_id4_ } from '@/lib/api/generated/hooks';
import { formatPartForDisplay } from '@/lib/utils/parts';

interface PartDetailsProps {
  partId: string;
}

export function PartDetails({ partId }: PartDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  
  const { data: part, isLoading, error, refetch } = useGet__parts__part_id4_(
    { path: { part_id4: partId } },
    { enabled: !!partId }
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded w-1/3 mb-4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-muted rounded w-full"></div>
              <div className="h-4 bg-muted rounded w-2/3"></div>
              <div className="h-4 bg-muted rounded w-1/2"></div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (error || !part) {
    return (
      <Card className="p-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2">Part not found</h2>
          <p className="text-muted-foreground">
            The part with ID "{partId}" could not be found.
          </p>
        </div>
      </Card>
    );
  }

  if (isEditing) {
    return (
      <PartForm
        partId={partId}
        onSuccess={() => {
          setIsEditing(false);
          refetch();
        }}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  const { displayId, displayDescription, displayManufacturerCode } = formatPartForDisplay(part);

  return (
    <div className="space-y-6">
      {/* Part Header */}
      <Card className="p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold font-mono mb-2">{displayId}</h1>
            <p className="text-lg text-muted-foreground mb-2">{displayDescription}</p>
            {displayManufacturerCode && (
              <p className="text-sm text-muted-foreground">
                <strong>Manufacturer:</strong> {displayManufacturerCode}
              </p>
            )}
          </div>
          <Button onClick={() => setIsEditing(true)}>
            Edit Part
          </Button>
        </div>

        {/* Part Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <h3 className="font-medium mb-2">Type</h3>
            <p className="text-muted-foreground">
              {part.type?.name || 'No type assigned'}
            </p>
          </div>

          <div>
            <h3 className="font-medium mb-2">Tags</h3>
            <div className="flex flex-wrap gap-1">
              {part.tags && part.tags.length > 0 ? (
                part.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded-md"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">No tags</p>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-2">Created</h3>
            <p className="text-muted-foreground text-sm">
              {new Date(part.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Part Image */}
        {part.image_url && (
          <div className="mt-6">
            <h3 className="font-medium mb-2">Image</h3>
            <img
              src={part.image_url}
              alt={displayDescription}
              className="max-w-sm h-auto rounded-md border"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        )}
      </Card>

      {/* Stock Locations */}
      <Card className="p-6">
        <PartLocationGrid
          partId={partId}
          typeId={part.type_id || undefined}
        />
      </Card>

      {/* Quick Actions */}
      <Card className="p-6">
        <h3 className="font-medium mb-4">Quick Actions</h3>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setShowStockDialog(true)}
          >
            Manage Stock
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              // TODO: Navigate to part history
              console.log('View history for', partId);
            }}
          >
            View History
          </Button>
        </div>
      </Card>

      {/* TODO: Add stock management dialogs here when implemented */}
    </div>
  );
}