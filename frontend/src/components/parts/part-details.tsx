import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { PartLocationGrid } from './part-location-grid';
import { PartForm } from './part-form';
import { useGetPartsByPartKey, useDeletePartsByPartKey } from '@/lib/api/generated/hooks';
import { formatPartForDisplay } from '@/lib/utils/parts';
import { useConfirm } from '@/hooks/use-confirm';

interface PartDetailsProps {
  partId: string;
}

export function PartDetails({ partId }: PartDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const navigate = useNavigate();
  const { confirm, confirmProps } = useConfirm();
  
  const { data: part, isLoading, error, refetch } = useGetPartsByPartKey(
    { path: { part_key: partId } },
    { enabled: !!partId }
  );
  
  const deletePartMutation = useDeletePartsByPartKey();

  const handleDeletePart = async () => {
    if (!part) return;

    const confirmed = await confirm({
      title: 'Delete Part',
      description: `Are you sure you want to delete part ${partId} (${part.description})? This action cannot be undone and will only succeed if the part has zero total quantity.`,
      confirmText: 'Delete',
      destructive: true
    });

    if (confirmed) {
      await deletePartMutation.mutateAsync({
        path: { part_key: partId }
      });
      // Navigate back to parts list after successful deletion
      navigate({ to: '/parts' });
    }
  };

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
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{displayDescription}</h1>
          <p className="text-lg text-muted-foreground font-mono">{displayId}</p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => setIsEditing(true)}>
            Edit Part
          </Button>
          <Button 
            variant="outline" 
            onClick={handleDeletePart}
            disabled={deletePartMutation.isPending}
          >
            Delete Part
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Part Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm font-medium">Part ID</div>
                <div className="text-2xl font-bold font-mono">{displayId}</div>
              </div>
              
              <div>
                <div className="text-sm font-medium">Description</div>
                <div className="text-lg">{displayDescription}</div>
              </div>
              
              {displayManufacturerCode && (
                <div>
                  <div className="text-sm font-medium">Manufacturer Code</div>
                  <div className="text-lg">{displayManufacturerCode}</div>
                </div>
              )}
              
              <div>
                <div className="text-sm font-medium">Type</div>
                <div className="text-lg">{part.type?.name || 'No type assigned'}</div>
              </div>

              <div>
                <div className="text-sm font-medium">Tags</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {part.tags && part.tags.length > 0 ? (
                    part.tags.map((tag: string, index: number) => (
                      <span
                        key={index}
                        className="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded-md"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-sm">No tags</span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">Created</div>
                <div className="text-sm text-muted-foreground">
                  {new Date(part.created_at).toLocaleDateString()}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Stock Locations</CardTitle>
            </CardHeader>
            <CardContent>
              <PartLocationGrid
                partId={partId}
                typeId={part.type_id || undefined}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}