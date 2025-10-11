import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { PartLocationGrid } from './part-location-grid';
import { PartForm } from './part-form';
import { CoverImageDisplay } from '@/components/documents/cover-image-display';
import { PartDocumentGrid } from './part-document-grid';
import { AddDocumentModal } from '@/components/documents/add-document-modal';
import { MoreVerticalIcon } from '@/components/icons/MoreVerticalIcon';
import { useGetPartsByPartKey, useDeletePartsByPartKey } from '@/lib/api/generated/hooks';
import { formatPartForDisplay } from '@/lib/utils/parts';
import { useConfirm } from '@/hooks/use-confirm';
import { useClipboardPaste } from '@/hooks/use-clipboard-paste';
import { usePartShoppingListMemberships, invalidatePartMemberships } from '@/hooks/use-part-shopping-list-memberships';
import { AddToShoppingListDialog } from '@/components/shopping-lists/part/add-to-shopping-list-dialog';

interface PartDetailsProps {
  partId: string;
}

export function PartDetails({ partId }: PartDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showAddDocument, setShowAddDocument] = useState(false);
  const [showAddToListDialog, setShowAddToListDialog] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, confirmProps } = useConfirm();
  const documentGridRef = useRef<HTMLDivElement>(null);
  const [latestUploadedDocumentId, setLatestUploadedDocumentId] = useState<number | null>(null);
  
  const membershipQuery = usePartShoppingListMemberships(partId);
  const { data: part, isLoading, error, refetch } = useGetPartsByPartKey(
    { path: { part_key: partId } },
    { enabled: !!partId }
  );
  
  const [documentKey, setDocumentKey] = useState(0); // Force refresh by changing key
  const deletePartMutation = useDeletePartsByPartKey();

  // Enable clipboard paste when not in editing mode
  useClipboardPaste({
    partId,
    enabled: !isEditing && !!partId,
    onUploadSuccess: (documentId) => {
      // Refresh the document grid
      setDocumentKey(prev => prev + 1);
      // Set the document ID for auto-scroll
      setLatestUploadedDocumentId(documentId);
    }
  });

  // Auto-scroll to the newly uploaded document
  useEffect(() => {
    if (!latestUploadedDocumentId) return;

    // Wait for the document grid to refresh
    const scrollTimeout = setTimeout(() => {
      if (documentGridRef.current) {
        // Find the specific document tile by ID
        const targetTile = documentGridRef.current.querySelector(
          `[data-document-id="${latestUploadedDocumentId}"]`
        ) as HTMLElement;
        
        if (targetTile) {
          // Scroll the tile into view with smooth behavior
          targetTile.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest' 
          });

          // Add a brief highlight effect
          targetTile.style.transition = 'box-shadow 0.3s ease';
          targetTile.style.boxShadow = '0 0 0 2px rgb(59, 130, 246)';
          
          setTimeout(() => {
            targetTile.style.boxShadow = '';
          }, 2000);
        }
      }
    }, 500); // Wait for grid to update

    return () => clearTimeout(scrollTimeout);
  }, [latestUploadedDocumentId]);

  const partSummary = useMemo(() => {
    if (!part) {
      return null;
    }
    const numericId = (part as { id?: number | null }).id ?? null;
    return {
      id: numericId,
      key: part.key,
      description: part.description,
      defaultSellerId: part.seller?.id ?? null,
    };
  }, [part]);

  const activeMemberships = useMemo(() => {
    const seen = new Set<number>();
    const unique = [] as typeof membershipQuery.summary.memberships;
    for (const membership of membershipQuery.summary.memberships) {
      if (!seen.has(membership.listId)) {
        seen.add(membership.listId);
        unique.push(membership);
      }
    }
    return unique;
  }, [membershipQuery.summary.memberships]);

  const isMembershipPending = membershipQuery.status === 'pending';
  const isMembershipFetching = membershipQuery.fetchStatus === 'fetching';
  const membershipError = membershipQuery.error;
  const showMembershipSkeleton = isMembershipPending || (isMembershipFetching && membershipQuery.status === 'success');

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

  const handleDuplicatePart = () => {
    navigate({ to: '/parts/new', search: { duplicate: partId } });
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

  const { displayId, displayDescription, displayManufacturerCode, displayManufacturer, displayProductPage } = formatPartForDisplay(part);
  const hasCoverAttachment = Boolean(part.cover_attachment);

  return (
    <div data-testid="parts.detail">
      {partSummary && (
        <AddToShoppingListDialog
          open={showAddToListDialog}
          onClose={() => setShowAddToListDialog(false)}
          part={partSummary}
          defaultNeeded={1}
        />
      )}

      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{displayDescription}</h1>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              onClick={() => setShowAddToListDialog(true)}
              data-testid="parts.detail.add-to-shopping-list"
            >
              Add to shopping list
            </Button>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" data-testid="parts.detail.actions.menu">
                  <MoreVerticalIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDuplicatePart}>
                  Duplicate Part
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div
          id="parts.detail.shopping-list.badges"
          data-testid="parts.detail.shopping-list.badges"
          className="min-h-[32px]"
        >
          {showMembershipSkeleton ? (
            <div className="flex flex-wrap gap-2" data-testid="parts.detail.shopping-list.badges.loading">
              <div className="h-6 w-32 animate-pulse rounded-full bg-muted" />
              <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
            </div>
          ) : membershipError ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="parts.detail.shopping-list.badges.error">
              <span>Failed to load shopping list memberships.</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  invalidatePartMemberships(queryClient, partId);
                  void membershipQuery.refetch();
                }}
              >
                Retry
              </Button>
            </div>
          ) : membershipQuery.summary.hasActiveMembership ? (
            <div className="flex flex-wrap gap-2" data-testid="parts.detail.shopping-list.badge-list">
              {activeMemberships.map((membership) => (
                <Link
                  key={membership.listId}
                  to="/shopping-lists/$listId"
                  params={{ listId: String(membership.listId) }}
                  search={{ sort: 'description' }}
                  className="group inline-flex items-center gap-2 rounded-full border border-input bg-muted/40 px-3 py-1 text-sm transition hover:border-primary hover:text-primary"
                  data-testid="parts.detail.shopping-list.badge"
                >
                  <span>{membership.listName}</span>
                  <Badge
                    variant={membership.listStatus === 'ready' ? 'default' : 'secondary'}
                    className="capitalize"
                  >
                    {membership.listStatus}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="parts.detail.shopping-list.badges.empty">
              This part is not on any Concept or Ready shopping lists.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="parts.detail.summary-grid">
        <div className="lg:col-span-1">
          <Card data-testid="parts.detail.information">
            <CardHeader>
              <CardTitle>Part Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="text-sm font-medium">Part ID</div>
                  <div className="text-2xl font-bold font-mono">{displayId}</div>
                </div>
                <CoverImageDisplay 
                  partId={partId} 
                  hasCoverAttachment={hasCoverAttachment}
                  size="medium" 
                  className="ml-4" 
                  showPlaceholder={false}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  {/* Manufacturer Information */}
                  {(displayManufacturer || displayProductPage) && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-2">Manufacturer Information</div>
                      <div className="space-y-2">
                        {displayManufacturer && (
                          <div>
                            <div className="text-sm font-medium">Manufacturer</div>
                            <div className="text-lg">{displayManufacturer}</div>
                          </div>
                        )}
                        
                        {displayProductPage && (
                          <div>
                            <div className="text-sm font-medium">Product Page</div>
                            <div className="text-sm">
                              <a 
                                href={displayProductPage} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-blue-600 hover:text-blue-800 underline break-all"
                              >
                                {displayProductPage}
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Seller Information */}
                  {(part.seller || part.seller_link) && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-2">Seller Information</div>
                      <div className="space-y-2">
                        {part.seller && (
                          <div>
                            <div className="text-sm font-medium">Seller</div>
                            <div className="text-lg">{part.seller.name}</div>
                          </div>
                        )}

                        {part.seller_link && (
                          <div>
                            <div className="text-sm font-medium">Product Page</div>
                            <div className="text-sm">
                              <a
                                href={part.seller_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 underline break-all"
                              >
                                {part.seller_link}
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

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
                </div>

                {/* Technical Specifications */}
                {(part.dimensions || part.mounting_type || part.package || part.pin_count || part.pin_pitch || part.series || part.voltage_rating || part.input_voltage || part.output_voltage) && (
                  <div>
                    <div className="text-sm font-medium mb-3">Technical Specifications</div>
                    
                    {/* Physical Specifications */}
                    {(part.dimensions || part.package || part.pin_count || part.pin_pitch || part.mounting_type) && (
                      <div className="mb-4">
                        <div className="text-xs font-medium text-muted-foreground mb-2">Physical</div>
                        <div className="space-y-2">
                          {part.dimensions && (
                            <div>
                              <div className="text-sm font-medium">Dimensions</div>
                              <div className="text-sm">{part.dimensions}</div>
                            </div>
                          )}
                          
                          {part.package && (
                            <div>
                              <div className="text-sm font-medium">Package</div>
                              <div className="text-sm">{part.package}</div>
                            </div>
                          )}
                          
                          {part.pin_count && (
                            <div>
                              <div className="text-sm font-medium">Pin Count</div>
                              <div className="text-sm">{part.pin_count}</div>
                            </div>
                          )}
                          
                          {part.pin_pitch && (
                            <div>
                              <div className="text-sm font-medium">Pin Pitch</div>
                              <div className="text-sm">{part.pin_pitch}</div>
                            </div>
                          )}
                          
                          {part.mounting_type && (
                            <div>
                              <div className="text-sm font-medium">Mounting Type</div>
                              <div className="text-sm">{part.mounting_type}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Electrical/Technical Specifications */}
                    {(part.voltage_rating || part.input_voltage || part.output_voltage || part.series) && (
                      <div className="mb-4">
                        <div className="text-xs font-medium text-muted-foreground mb-2">Electrical/Technical</div>
                        <div className="space-y-2">
                          {part.voltage_rating && (
                            <div>
                              <div className="text-sm font-medium">Voltage Rating</div>
                              <div className="text-sm">{part.voltage_rating}</div>
                            </div>
                          )}
                          
                          {part.input_voltage && (
                            <div>
                              <div className="text-sm font-medium">Input Voltage</div>
                              <div className="text-sm">{part.input_voltage}</div>
                            </div>
                          )}
                          
                          {part.output_voltage && (
                            <div>
                              <div className="text-sm font-medium">Output Voltage</div>
                              <div className="text-sm">{part.output_voltage}</div>
                            </div>
                          )}
                          
                          {part.series && (
                            <div>
                              <div className="text-sm font-medium">Series</div>
                              <div className="text-sm">{part.series}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card data-testid="parts.detail.locations">
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

      {/* Documents Section */}
      <Card className="mt-6" data-testid="parts.detail.documents">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Documents</CardTitle>
            <Button
              onClick={() => setShowAddDocument(true)}
              size="sm"
              data-testid="parts.detail.documents.add"
            >
              Add Document
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div ref={documentGridRef}>
            <PartDocumentGrid
              key={documentKey}
              partId={partId}
              hasCoverAttachment={hasCoverAttachment}
              onDocumentChange={() => setDocumentKey(prev => prev + 1)}
            />
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog {...confirmProps} />
      
      <AddDocumentModal
        partId={partId}
        open={showAddDocument}
        onOpenChange={setShowAddDocument}
        onDocumentAdded={() => setDocumentKey(prev => prev + 1)}
      />
    </div>
  );
}
