import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { ConfirmDialog } from '@/components/primitives/dialog';
import { Input } from '@/components/primitives/input';
import { ExternalLink } from '@/components/primitives';
import { SectionHeading } from '@/components/ui';
import { SellerSelector } from '@/components/sellers/seller-selector';
import {
  usePostPartsSellerLinksByPartKey,
  useDeletePartsSellerLinksByPartKeyAndSellerLinkId,
} from '@/lib/api/generated/hooks';
import { useConfirm } from '@/hooks/use-confirm';
import { useFormInstrumentation } from '@/hooks/use-form-instrumentation';
import type { components } from '@/lib/api/generated/types';

type PartSellerLink = components['schemas']['PartResponseSchema.1a46b79.PartSellerLinkSchema'];

const FORM_ID = 'parts.detail.sellerLink.add';

interface SellerLinkSectionProps {
  partId: string;
  sellerLinks: PartSellerLink[];
}

/**
 * SellerLinkSection -- Always-visible section for managing seller links on a part.
 *
 * Renders a list of existing seller links (with remove buttons) and an inline
 * add form with a SellerSelector + URL input. Uses its own useConfirm instance
 * so the delete-confirmation dialog is independent of the parent PartDetails.
 */
export function SellerLinkSection({ partId, sellerLinks }: SellerLinkSectionProps) {
  // -- Form state --
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [sellerId, setSellerId] = useState<number | undefined>(undefined);
  const [linkUrl, setLinkUrl] = useState('');

  // -- Mutations --
  const addMutation = usePostPartsSellerLinksByPartKey();
  const removeMutation = useDeletePartsSellerLinksByPartKeyAndSellerLinkId();

  // -- Confirmation dialog (independent from PartDetails) --
  const { confirm, confirmProps } = useConfirm();

  // -- Form instrumentation --
  const { trackSubmit, trackSuccess, trackError } = useFormInstrumentation({
    formId: FORM_ID,
    isOpen: isAddFormOpen,
    snapshotFields: () => ({ sellerId, linkUrl }),
  });

  // -- Derived state --
  const isAddFormValid = sellerId !== undefined && linkUrl.trim().length > 0;
  const hasLinks = sellerLinks.length > 0;

  // -- Handlers --

  const resetForm = () => {
    setSellerId(undefined);
    setLinkUrl('');
    setIsAddFormOpen(false);
  };

  const handleSubmit = async () => {
    if (!isAddFormValid) return;

    trackSubmit();

    try {
      await addMutation.mutateAsync({
        path: { part_key: partId },
        body: { seller_id: sellerId, link: linkUrl.trim() },
      });
      trackSuccess();
      resetForm();
    } catch {
      trackError();
      // Centralized error toast fires automatically; form stays open.
    }
  };

  const handleCancel = () => {
    resetForm();
  };

  const handleRemove = async (sl: PartSellerLink) => {
    const confirmed = await confirm({
      title: 'Remove Seller Link',
      description: `Remove the link to ${sl.seller_name}? This cannot be undone.`,
      confirmText: 'Remove',
      destructive: true,
    });

    if (!confirmed) return;

    await removeMutation.mutateAsync({
      path: { part_key: partId, seller_link_id: sl.id },
    });
  };

  return (
    <div data-testid="parts.detail.seller-links">
      <SectionHeading>Seller Links</SectionHeading>

      {/* Existing seller link rows */}
      {hasLinks ? (
        <div className="space-y-2 mb-3">
          {sellerLinks.map((sl) => (
            <div
              key={sl.id}
              className="flex items-center gap-2"
              data-testid="parts.detail.seller-links.row"
            >
              {/* Logo (if available), matching VendorInfo pattern */}
              {sl.logo_url && (
                <img
                  src={sl.logo_url}
                  alt={sl.seller_name}
                  className="h-5 w-5 rounded-sm object-contain flex-shrink-0"
                />
              )}
              <span className="text-sm font-medium flex-shrink-0">{sl.seller_name}</span>
              <ExternalLink href={sl.link} className="text-sm break-all min-w-0">
                {sl.link}
              </ExternalLink>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto flex-shrink-0 h-7 w-7 p-0"
                onClick={() => handleRemove(sl)}
                disabled={removeMutation.isPending}
                data-testid="parts.detail.seller-links.row.remove"
                title={`Remove link to ${sl.seller_name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p
          className="text-sm text-muted-foreground mb-3"
          data-testid="parts.detail.seller-links.empty"
        >
          No seller links yet.
        </p>
      )}

      {/* Add form toggle / inline form */}
      {!isAddFormOpen ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAddFormOpen(true)}
          data-testid="parts.detail.seller-links.add-button"
        >
          Add Seller Link
        </Button>
      ) : (
        <div
          className="space-y-3 rounded-md border p-3"
          data-testid="parts.detail.seller-links.form"
        >
          <div data-testid="parts.detail.seller-links.form.seller">
            <SellerSelector
              value={sellerId}
              onChange={setSellerId}
              placeholder="Select seller..."
            />
          </div>

          <Input
            type="url"
            placeholder="Product page URL"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            data-testid="parts.detail.seller-links.form.link"
          />

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!isAddFormValid || addMutation.isPending}
              data-testid="parts.detail.seller-links.form.submit"
            >
              {addMutation.isPending ? 'Adding...' : 'Add'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={addMutation.isPending}
              data-testid="parts.detail.seller-links.form.cancel"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation dialog for remove actions (independent of PartDetails) */}
      <ConfirmDialog {...confirmProps} />
    </div>
  );
}
