import { ExternalLink } from '@/components/ui';
import { ExternalLinkIcon } from '@/components/icons/ExternalLinkIcon';

interface VendorInfoProps {
  seller?: { id: number; name: string } | null;
  sellerLink?: string | null;
  /**
   * When true, renders the link as a clickable span instead of an anchor.
   * Use this when VendorInfo is rendered inside another anchor element (e.g., a card link)
   * to avoid invalid nested anchor HTML.
   */
  inCardContext?: boolean;
}

export function VendorInfo({ seller, sellerLink, inCardContext = false }: VendorInfoProps) {
  if (!seller) return null;

  const truncatedSeller = seller.name.length > 25 ? seller.name.substring(0, 22) + '...' : seller.name;

  // When inside a card context, we can't use an anchor (would create nested <a> tags)
  // Instead, use a clickable span that opens the link in a new tab
  const handleLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (sellerLink) {
      window.open(sellerLink, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
      {sellerLink ? (
        <>
          <span className="text-xs">🏪</span>
          {inCardContext ? (
            <span
              role="button"
              tabIndex={0}
              onClick={handleLinkClick}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleLinkClick(e as unknown as React.MouseEvent);
                }
              }}
              className="inline-flex items-center gap-1 text-link hover:underline cursor-pointer"
              title={`${seller.name} - Product page (opens in new tab)`}
              aria-label={`${seller.name} - Product page`}
            >
              {truncatedSeller}
              <ExternalLinkIcon className="inline w-3 h-3 flex-shrink-0" />
            </span>
          ) : (
            <ExternalLink
              href={sellerLink}
              onClick={(e) => e.stopPropagation()}
              ariaLabel={`${seller.name} - Product page`}
            >
              {truncatedSeller}
            </ExternalLink>
          )}
        </>
      ) : (
        <>
          <span className="text-xs">🏪</span>
          <span title={seller.name}>{truncatedSeller}</span>
        </>
      )}
    </span>
  );
}